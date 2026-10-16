import { buildPrompt, workflowById } from './workflows.js';

export function createController({ tasks, store, now = () => new Date().toISOString() }) {
  let records = [];
  let queue = Promise.resolve();
  const ready = store.read().then(data => {
    records = Array.isArray(data.launches) ? data.launches : [];
  });
  const persist = () => store.write({ schema: 1, launches: records });
  const serial = work => {
    const next = queue.then(() => ready).then(work);
    queue = next.catch(() => {});
    return next;
  };
  const allowed = (caps, name) => Array.isArray(caps?.operations)
    ? caps.operations.includes(name)
    : caps?.operations?.[name] === true;

  async function execute(record) {
    try {
      if (typeof tasks?.capabilities !== 'function') {
        throw Object.assign(new Error('Plugin tasks are unavailable'), { code: 'UNSUPPORTED_HOST' });
      }
      const caps = await tasks.capabilities();
      if (!allowed(caps, 'create') || !allowed(caps, 'send')) {
        throw Object.assign(new Error('This Cindy version does not support plugin tasks'), { code: 'UNSUPPORTED_HOST' });
      }
      if (!record.taskId) {
        record.phase = 'creating';
        await persist(); // Durable request key BEFORE creating a task.
        const task = await tasks.create({ requestKey: record.createKey, title: record.title });
        if (!task?.taskId || task.revision === undefined) {
          throw Object.assign(new Error('Incomplete task receipt'), { code: 'UNVERIFIED_RECEIPT' });
        }
        record.taskId = task.taskId;
        record.revision = task.revision;
        record.workingDir = task.workingDir ?? '';
        record.permissionMode = task.permissionMode ?? '';
        record.phase = 'created';
        await persist(); // Do NOT send if persistence fails.
      }
      record.phase = 'sending';
      await persist();
      const run = await tasks.send({
        taskId: record.taskId, expectedRevision: record.revision,
        requestKey: record.sendKey, text: record.prompt,
      });
      if (!run?.runId) throw Object.assign(new Error('Incomplete dispatch receipt'), { code: 'UNVERIFIED_RECEIPT' });
      record.runId = run.runId;
      record.phase = 'accepted';
      record.errorCode = '';
      record.updatedAt = now();
      await persist();
    } catch (error) {
      // A lost response is NOT proof of failure; only an explicit user recovery
      // replays the SAME durable keys. Never auto-send a second input.
      record.errorCode = error.code || 'UNVERIFIED';
      const rejected = ['PERMISSION_DENIED', 'UNSUPPORTED_HOST', 'INVALID_REQUEST', 'INVALID_PARAMS', 'MODEL_UNAVAILABLE', 'ROUTE_UNAVAILABLE'];
      record.phase = rejected.includes(record.errorCode) ? 'rejected' : 'uncertain';
      record.updatedAt = now();
      await persist();
    }
    return publicRecord(record);
  }
  function publicRecord(record) {
    const { prompt, createKey, sendKey, revision, ...view } = record;
    return view;
  }
  return {
    list: () => serial(async () => records.map(publicRecord)),
    launch: (id, workflowId, context) => serial(async () => {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new Error('Invalid request id');
      const existing = records.find(record => record.id === id);
      if (existing) return publicRecord(existing); // Transport retries only read.
      const flow = workflowById(workflowId);
      const prompt = buildPrompt(workflowId, context);
      // Keep at most 20; never discard unresolved receipts to make room.
      const record = { id, workflowId, title: flow.label, prompt,
        createKey: `deck-${id}-create`, sendKey: `deck-${id}-send`,
        phase: 'preparing', createdAt: now(), updatedAt: now() };
      const bytes = () => new TextEncoder().encode(JSON.stringify({ schema: 1, launches: [record, ...records] })).length;
      while (records.length >= 20 || bytes() > 60 * 1024) {
        const index = records.findLastIndex(record => ['accepted', 'rejected'].includes(record.phase));
        if (index < 0) throw Object.assign(new Error('Resolve pending launches first'), { code: 'PENDING_LIMIT' });
        records.splice(index, 1);
      }
      records.unshift(record);
      await persist();
      return execute(record);
    }),
    recover: id => serial(async () => {
      const record = records.find(item => item.id === id);
      if (!record) throw new Error('Unknown launch');
      if (['accepted', 'rejected'].includes(record.phase)) return publicRecord(record);
      return execute(record);
    }),
    refresh: () => serial(async () => {
      const caps = await tasks.capabilities();
      if (!allowed(caps, 'getRun')) return records.map(publicRecord);
      for (const record of records) {
        if (!record.runId) continue;
        try {
          const run = await tasks.getRun({ runId: record.runId });
          record.runStatus = run.status ?? run.state ?? 'unknown';
          record.observedAt = now();
          record.refreshError = '';
        } catch (error) { record.refreshError = error.code || 'UNVERIFIED'; }
      }
      await persist();
      return records.map(publicRecord);
    }),
  };
}
