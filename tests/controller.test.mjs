import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createController } from '../plugin/controller.js';
import { WORKFLOWS, buildPrompt } from '../plugin/workflows.js';

function fixture(options = {}) {
  let saved = {};
  const calls = { creates: [], sends: [], getRuns: [] };
  const created = new Map();
  const sent = new Map();
  const store = {
    read: async () => structuredClone(saved),
    write: async value => {
      assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 64 * 1024);
      if (options.failWrite?.(value)) throw new Error('Storage unavailable');
      saved = structuredClone(value);
    },
  };
  const tasks = {
    capabilities: async () => options.caps ?? { operations: ['create', 'send', 'getRun'] },
    create: async args => {
      calls.creates.push(args);
      if (options.deny) throw Object.assign(new Error('Denied'), { code: 'PERMISSION_DENIED' });
      if (!created.has(args.requestKey)) created.set(args.requestKey, { taskId: `task-${created.size + 1}`, revision: 1, workingDir: '/selected/project', permissionMode: 'ask' });
      const receipt = created.get(args.requestKey);
      if (options.loseCreateOnce) { options.loseCreateOnce = false; throw new Error('Lost response'); }
      return receipt;
    },
    send: async args => {
      calls.sends.push(args);
      if (!sent.has(args.requestKey)) sent.set(args.requestKey, { runId: `run-${sent.size + 1}` });
      if (options.loseSendOnce) { options.loseSendOnce = false; throw new Error('Lost response'); }
      return options.incompleteSend ? {} : sent.get(args.requestKey);
    },
    getRun: async args => { calls.getRuns.push(args); if (options.failRefresh) throw Object.assign(new Error('Unavailable'), { code: 'HOST_NOT_READY' }); return { status: options.runStatus || 'running' }; },
  };
  return { calls, tasks, store, created, sent, read: () => saved, controller: () => createController({ tasks, store }) };
}

test('all five workflow prompts refer to the exact requested file or Skill', () => {
  assert.deepEqual(WORKFLOWS.map(flow => flow.source), ['_S/experiment.md', '_S/feature.md', '_S/tooling.md', 'xd-pr-review', '_E/merge.md']);
  for (const flow of WORKFLOWS) {
    const prompt = buildPrompt(flow.id, '实现新的背包筛选');
    assert.ok(prompt.includes(flow.source));
    assert.ok(prompt.includes('全新的独立任务'));
    assert.ok(prompt.includes('实现新的背包筛选'));
    assert.ok(prompt.includes('停止'));
    assert.ok(prompt.includes('\n\n'));
  }
  assert.throws(() => buildPrompt('shell', 'rm -rf'));
  assert.throws(() => buildPrompt('feature', 'a'.repeat(4001)));
});
test('each click creates its own task, with no existing session id or permission override', async () => {
  const f = fixture(); const controller = f.controller();
  const results = await Promise.all(WORKFLOWS.map(flow => controller.launch(randomUUID(), flow.id, '目标')));
  assert.equal(new Set(results.map(result => result.taskId)).size, 5);
  assert.equal(results.every(result => result.phase === 'accepted'), true);
  assert.equal(f.sent.size, 5);
  for (const args of f.calls.creates) assert.deepEqual(Object.keys(args).sort(), ['requestKey', 'title']);
  for (const args of f.calls.sends) assert.equal(args.expectedRevision, 1);
  assert.equal((await controller.list()).length, 5);
});
test('same transport request is read-only after first launch, even on controller restart', async () => {
  const f = fixture(); const id = randomUUID();
  const first = await f.controller().launch(id, 'feature', 'original');
  const duplicate = await f.controller().launch(id, 'merge', 'different');
  assert.equal(duplicate.taskId, first.taskId);
  assert.equal(duplicate.workflowId, 'feature');
  assert.equal(f.calls.creates.length, 1); assert.equal(f.calls.sends.length, 1);
});
test('lost create receipt never automatically resends; explicit recovery reuses the create key', async () => {
  const f = fixture({ loseCreateOnce: true }); const id = randomUUID();
  const first = await f.controller().launch(id, 'experiment', '');
  assert.equal(first.phase, 'uncertain'); assert.equal(f.sent.size, 0);
  assert.equal((await f.controller().launch(id, 'experiment', '')).phase, 'uncertain');
  const recovered = await f.controller().recover(id);
  assert.equal(recovered.phase, 'accepted'); assert.equal(f.created.size, 1);
  assert.equal(f.calls.creates[0].requestKey, f.calls.creates[1].requestKey);
  assert.equal(f.sent.size, 1);
});
test('lost send receipt recovers after restart with same task, revision and send key', async () => {
  const f = fixture({ loseSendOnce: true }); const id = randomUUID();
  const first = await f.controller().launch(id, 'pr', 'PR #123');
  assert.equal(first.phase, 'uncertain'); assert.equal(f.created.size, 1); assert.equal(f.sent.size, 1);
  await f.controller().recover(id);
  assert.equal(f.created.size, 1); assert.equal(f.sent.size, 1);
  assert.deepEqual(f.calls.sends[0], f.calls.sends[1]);
});
test('permission rejection does not retry automatically or via recovery', async () => {
  const f = fixture({ deny: true }); const controller = f.controller(); const id = randomUUID();
  assert.equal((await controller.launch(id, 'merge', '')).phase, 'rejected');
  assert.equal((await controller.recover(id)).phase, 'rejected');
  assert.equal(f.calls.creates.length, 1); assert.equal(f.calls.sends.length, 0);
});
test('unsupported host fails before creating or dispatching a task', async () => {
  const f = fixture({ caps: { operations: ['models'] } });
  const result = await f.controller().launch(randomUUID(), 'feature', '');
  assert.equal(result.errorCode, 'UNSUPPORTED_HOST'); assert.equal(f.created.size, 0);
});
test('host operation-map capability shape is supported', async () => {
  const f = fixture({ caps: { operations: { create: true, send: true, getRun: true } } });
  assert.equal((await f.controller().launch(randomUUID(), 'feature', '')).phase, 'accepted');
});
test('storage failure before creation does not create a task', async () => {
  const f = fixture({ failWrite: () => true });
  await assert.rejects(f.controller().launch(randomUUID(), 'feature', ''));
  assert.equal(f.created.size, 0); assert.equal(f.sent.size, 0);
});
test('cannot send when task receipt was not persisted', async () => {
  const f = fixture({ failWrite: data => data.launches[0]?.phase === 'created' });
  const result = await f.controller().launch(randomUUID(), 'tooling', '');
  assert.equal(result.phase, 'uncertain'); assert.equal(f.created.size, 1); assert.equal(f.sent.size, 0);
});
test('incomplete send receipt is unverified, not completed or failed', async () => {
  const f = fixture({ incompleteSend: true });
  const result = await f.controller().launch(randomUUID(), 'pr', '');
  assert.equal(result.phase, 'uncertain'); assert.equal(result.errorCode, 'UNVERIFIED_RECEIPT');
});
test('refresh only reads actual run status and never launches another task', async () => {
  const f = fixture({ runStatus: 'reconciling' }); const controller = f.controller();
  await controller.launch(randomUUID(), 'feature', '');
  const records = await controller.refresh();
  assert.equal(records[0].runStatus, 'reconciling'); assert.equal(f.calls.sends.length, 1);
  assert.equal(f.calls.getRuns.length, 1);
});
test('refresh failures retain prior status with a visible error', async () => {
  const options = { runStatus: 'running' }; const f = fixture(options); const controller = f.controller();
  await controller.launch(randomUUID(), 'feature', ''); await controller.refresh(); options.failRefresh = true;
  const records = await controller.refresh();
  assert.equal(records[0].runStatus, 'running'); assert.equal(records[0].refreshError, 'HOST_NOT_READY');
});
test('large goals prune old acknowledged records before exceeding host 64KB storage', async () => {
  const f = fixture(); const controller = f.controller();
  for (let i = 0; i < 15; i++) await controller.launch(randomUUID(), 'feature', '目标内容'.repeat(1000));
  assert.ok(Buffer.byteLength(JSON.stringify(f.read())) <= 64 * 1024);
  assert.ok((await controller.list()).length < 15); assert.equal(f.sent.size, 15);
});
test('unverified requests are never silently pruned to make room', async () => {
  const f = fixture({ incompleteSend: true }); const controller = f.controller();
  const firstId = randomUUID();
  await controller.launch(firstId, 'feature', '目标内容'.repeat(1000));
  let rejected = false;
  for (let i = 0; i < 20; i++) {
    try { await controller.launch(randomUUID(), 'feature', '目标内容'.repeat(1000)); }
    catch (error) { assert.equal(error.code, 'PENDING_LIMIT'); rejected = true; break; }
  }
  assert.equal(rejected, true);
  const records = await controller.list();
  assert.ok(records.some(record => record.id === firstId));
  assert.equal(records.length, f.sent.size);
});
