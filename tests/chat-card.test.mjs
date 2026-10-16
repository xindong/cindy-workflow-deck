import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardLauncher, workflowCard, receiptCard } from '../plugin/chat-card.js';
function fixture(options = {}) {
  let saved = {}; const calls = [];
  const store = { read: async () => structuredClone(saved), write: async patch => {
    if (options.failWrite) throw new Error('disk'); saved = { ...saved, ...structuredClone(patch) };
  } };
  const agent = { run: async args => { calls.push(args); if (options.throw) throw new Error('lost'); return options.reply ?? { ok: true, sessionId: 'new-' + calls.length }; } };
  return { store, agent, calls, read: () => saved, launcher: () => createCardLauncher({ store, agent }) };
}
const message = (id='click-1', workflow='feature') => ({ actionId: 'start:' + workflow, spawnCallId: id, callId: 'source-card', sessionId: 'source-chat', userActionToken: 'private-ticket-' + id, prompt: '目标 {{user_message}} <script>文本</script>' });
test('five cards declare actions and prompts without scripts; English supported', () => {
  assert.equal((workflowCard().match(/data-ghost-action=/g) || []).length, 5);
  assert.ok(!/<script|onclick|<iframe/i.test(workflowCard()));
  assert.ok(workflowCard(true).includes('Start an experiment'));
  assert.ok(!receiptCard({ state: 'accepted', sessionId: '<script>' }).includes('<script>'));
});
test('each click starts new, inherits through host ticket only and never copies source history', async () => {
  const f=fixture(), launch=f.launcher();
  for (const id of ['experiment','feature','tooling','pr','merge']) assert.equal((await launch(message(id,id))).state, 'accepted');
  assert.equal(f.calls.length,5);
  for (const call of f.calls) {
    assert.equal(call.mode,'new'); assert.equal(call.promptTemplate,'{{user_message}}');
    assert.ok(call.userMessage.includes('目标 {{user_message}}'));
    assert.deepEqual(Object.keys(call).sort(),['event','mode','promptTemplate','title','userActionToken','userMessage']);
    assert.ok(!JSON.stringify(f.read()).includes('private-ticket'));
  }
});
test('duplicates including concurrent delivery and restart do not consume another ticket', async () => {
  const f=fixture(); const launch=f.launcher();
  await Promise.all([launch(message()),launch(message())]); await f.launcher()(message());
  assert.equal(f.calls.length,1);
});
test('lost receipt is persisted as uncertain and never replayed', async () => {
  const f=fixture({throw:true}); assert.equal((await f.launcher()(message())).state,'uncertain');
  await f.launcher()(message()); assert.equal(f.calls.length,1);
});
test('missing ticket, source or action is rejected without any agent call', async () => {
  const f=fixture();
  for (const field of ['userActionToken','spawnCallId','sessionId']) {
    const m=message(); delete m[field]; assert.equal((await f.launcher()(m)).state,'rejected');
  }
  assert.equal((await f.launcher()({...message(),actionId:'unknown'})).state,'rejected');
  assert.equal(f.calls.length,0);
});
test('journal failure stops dispatch; host rejection and incomplete receipt remain distinct', async () => {
  const f=fixture({failWrite:true}); await assert.rejects(f.launcher()(message())); assert.equal(f.calls.length,0);
  const rejected=fixture({reply:{ok:false,errorCode:'PERMISSION_DENIED'}});
  assert.equal((await rejected.launcher()(message())).state,'rejected');
  const unknown=fixture({reply:{ok:true}}); assert.equal((await unknown.launcher()(message())).state,'uncertain');
});
test('bounded card journal preserves uncertain results and prunes acknowledged receipts only', async () => {
  const f=fixture();
  const receipts=Object.fromEntries(Array.from({length:100},(_,i)=>['old-'+i,{state:'accepted',sessionId:'task-'+i}]));
  receipts['old-0']={state:'uncertain'}; await f.store.write({cardReceipts:receipts,launches:[{taskId:'legacy'}]});
  assert.equal((await f.launcher()(message())).state,'accepted');
  assert.equal(Object.keys(f.read().cardReceipts).length,100);
  assert.equal(f.read().cardReceipts['old-0'].state,'uncertain');
  assert.equal(f.read().launches[0].taskId,'legacy');
  const blocked=fixture(); await blocked.store.write({cardReceipts:Object.fromEntries(Array.from({length:100},(_,i)=>['u-'+i,{state:'uncertain'}]))});
  assert.equal((await blocked.launcher()(message())).code,'CARD_JOURNAL_FULL'); assert.equal(blocked.calls.length,0);
});
