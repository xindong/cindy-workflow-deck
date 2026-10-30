import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionLog } from '../plugin/execution-log.js';
function fixture() {
  let data={ sidebarReceipts: { a:{ state:'accepted', sessionId:'own', workflowId:'feature', sourceSessionId:'source' } } };
  const store={ read:async()=>structuredClone(data),write:async patch=>{data={...data,...structuredClone(patch)};} };
  return { store, log:createExecutionLog({store}) };
}
test('only own Host context can report; replay dedupes and reload retains log',async()=>{
  const {store,log}=fixture(), args={status:'output',title:'Tests',detail:'<script>not markup</script>'};
  await assert.rejects(log.report({session_id:'other'},args,'c1'),{code:'UNOWNED_SESSION'});
  await log.report({session_id:'own'},args,'c1');await log.report({session_id:'own'},args,'c1');
  const rows=await createExecutionLog({store}).list();assert.equal(rows[0].entries.length,1);assert.equal(rows[0].entries[0].detail,args.detail);
});
test('completion report and Host turn end remain distinct; no unrelated tool data',async()=>{
  const {log}=fixture();await log.report({session_id:'own'},{status:'completed',title:'Ready',detail:'Verified'},'x');
  await log.event({name:'did-turn-end',seq:7,data:{sessionId:'own',endReason:'interrupted',secret:'not copied'}});
  await log.event({name:'did-turn-end',seq:7,data:{sessionId:'own',endReason:'interrupted'}});
  const entries=(await log.list())[0].entries;assert.deepEqual(entries.map(x=>x.kind),['completed','host']);assert.equal(entries[1].detail,'interrupted');assert.equal(JSON.stringify(entries).includes('not copied'),false);
});
test('concurrent reports serialize; bounded storage preserves receipt records',async()=>{
  const {store,log}=fixture();await Promise.all(Array.from({length:80},(_,i)=>log.report({session_id:'own'},{status:'step',title:String(i),detail:'字'.repeat(1000)},String(i))));
  const data=await store.read();assert.ok(new TextEncoder().encode(JSON.stringify(data.executionLogs)).length<=18000);assert.equal(data.sidebarReceipts.a.sessionId,'own');assert.ok((await log.list())[0].entries.length>0);
});
test('storage failure never acknowledges report as recorded',async()=>{
  const {store}=fixture();store.write=async()=>{throw new Error('disk failed');};const log=createExecutionLog({store});
  await assert.rejects(log.report({session_id:'own'},{status:'step',title:'Step',detail:'Done'},'x'),/disk failed/);
});

test('repeated workflows in one task show one log entry with the latest workflow label',async()=>{
 const {store,log}=fixture();
 await store.write({sidebarReceipts:{a:{state:'accepted',sessionId:'own',workflowId:'feature'},b:{state:'accepted',sessionId:'own',workflowId:'tooling'}}});
 await log.report({session_id:'own'},{status:'step',title:'Continued',detail:'Current request'},'continued');
 const rows=await log.list();assert.equal(rows.length,1);assert.equal(rows[0].workflowId,'tooling');assert.equal(rows[0].entries.length,1);
});
