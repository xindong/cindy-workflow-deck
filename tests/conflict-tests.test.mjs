import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createConflictService} from '../plugin/conflict-service.js';
import {updateConfiguration,newProject} from '../plugin/core/project-config.mjs';

async function fixture(kind) {
 let data={projectConfiguration:updateConfiguration({},0,{projects:[{...newProject('one'),directory:'/project'}],activeProjectId:'one'})},fingerprint='merged',pendingGit=false,task;
 const store={read:async()=>data,update:async fn=>Object.assign(data,fn(data))};
 const git=async(dir,p)=>p.action==='stash-files'?{entry:{id:'a'.repeat(40),ref:'stash@{0}'}}:{fingerprint,pendingGit};
 const service=createConflictService({store,git,agent:{errand:async p=>{task=p.task;return {ok:true,jobId:'job',sessionId:'project-task'};},queryErrand:async()=>({ok:true,status:'done'})}});
 const params={projectId:'one',revision:1,operationId:randomUUID(),strategy:'ask',instructions:'',...(kind?{kind,stashId:'a'.repeat(40)}:{})};
 const record=await service('conflict-start',params),source={sessionContext:{session_id:'project-task'}};
 const report={recordId:record.id,status:'passed',summary:'Passed',checks:[{command:'node --test',exitCode:0,result:'2 tests passed'}]};
 return {service,params,record,report,source,task,store,change:()=>{fingerprint='changed';},pending:()=>{pendingGit=true;}};
}

test('update and stash request real automatic tests on final restored contents in the same task',async()=>{
 for(const kind of [undefined,'stash']) {
  const f=await fixture(kind);
  for(const text of ['自动项目测试','实际执行','最终合并并恢复完毕','测试后若继续改动','unavailable','真实退出码','不安装依赖','不让用户手输命令',f.record.id])assert.ok(f.task.includes(text),text);
  const record=await f.service('conflict-read',f.params);assert.equal(record.state,'done');assert.equal(record.tests.status,'pending');
 }
});

test('test report binds to host session and repair id even after active project changes',async()=>{
 const f=await fixture();
 for(const source of [{},{sessionContext:{session_id:'other'}}])await assert.rejects(f.service('conflict-tests-report',f.report,source),{code:'UNOWNED_SESSION'});
 await assert.rejects(f.service('conflict-tests-report',{...f.report,recordId:randomUUID()},f.source),{code:'UNOWNED_SESSION'});
 await f.store.update(data=>({projectConfiguration:updateConfiguration(data,1,{projects:[{...newProject('two'),directory:'/other'}],activeProjectId:'two'})}));
 assert.equal((await f.service('conflict-tests-report',f.report,f.source)).status,'passed');
 assert.equal((await f.store.read()).conflictRepairsByDirectory['/project'].tests.source,'agent-report');
});

test('both conflict targets request full previews, reversible choices and bounded explicit batch writes',async()=>{
 for(const kind of [undefined,'stash']) {
  const f=await fixture(kind);
  for(const text of ['最终全文','相对当前本地的差异','不能截断后冒充全文','不覆盖项目文件或暂存区','返回修改段落','撤销本轮选择，重新开始','取消且保持原文件','原索引条目','写后内容摘要','后续改动','不能将整个工作树或整个索引重置','报告 pending','多选文件批量处理','不要把单选框冒充多选','未选文件不得执行该批操作','二进制/无法解读内容明确排除','批量不保证跨文件原子性','不自动重放或假称整批回滚'])assert.ok(f.task.includes(text),text);
  assert.equal(f.record.sessionKey.startsWith('jixin-project-'),true);
 }
});

test('no checks, failed exit, missing exit and oversized reports cannot claim passed',async()=>{
 const f=await fixture();
 for(const checks of [[],[{command:'npm test',exitCode:1,result:'failed'}],[{command:'npm test',exitCode:null,result:'interrupted'}],[{command:'x'.repeat(501),exitCode:0,result:'passed'}]])await assert.rejects(f.service('conflict-tests-report',{...f.report,checks},f.source),{code:'INVALID_TEST_REPORT'});
 f.pending();await assert.rejects(f.service('conflict-tests-report',f.report,f.source),{code:'TESTS_UNVERIFIED'});
});

test('failed or unavailable tests block restored completion; changed content invalidates a pass',async()=>{
 const f=await fixture('stash'),ack={...f.params,recordId:f.record.id,confirmed:true,stashRestored:true};
 for(const report of [{status:'failed',checks:[{command:'node --test',exitCode:1,result:'failed'}]},{status:'unavailable',checks:[]}]) {
  await f.service('conflict-tests-report',{...f.report,...report},f.source);
  await f.service('conflict-read',f.params);
  await assert.rejects(f.service('conflict-acknowledge',ack),{code:'TESTS_UNVERIFIED'});
 }
 await f.service('conflict-tests-report',f.report,f.source);f.change();
 assert.equal((await f.service('conflict-read',f.params)).tests.status,'pending');
 await assert.rejects(f.service('conflict-acknowledge',ack),{code:'TESTS_UNVERIFIED'});
 await f.service('conflict-tests-report',f.report,f.source);
 assert.equal((await f.service('conflict-acknowledge',ack)).stashOutcome,'restored');
});

test('explicit manual release preserves unverified outcome instead of claiming restoration success',async()=>{
 const f=await fixture('stash');await f.service('conflict-read',f.params);
 const result=await f.service('conflict-acknowledge',{...f.params,recordId:f.record.id,confirmed:true,stashRestored:true,testsUnverified:true});
 assert.equal(result.state,'acknowledged');assert.equal(result.stashOutcome,'unverified');assert.equal(result.tests.status,'pending');
});
