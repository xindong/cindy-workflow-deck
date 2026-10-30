import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSidebar } from '../plugin/project-sidebar.js';
const workflows = () => Object.fromEntries(['experiment','feature','tooling','pr','merge'].map(id => [id, {ok:true, source:'/project/_S/'+id+'.md'}]));
function fixture() {
  let data = { projectConfiguration: { revision:1, configuration:{schemaVersion:1,activeProjectId:'p',projects:[{id:'p',directory:'/project',discovery:'auto'}]} } }, time=20000;
  const calls=[], options={status:'running'};
  const store={read:async()=>structuredClone(data),update:async fn=>{if(options.failWrite)throw new Error('disk');data={...data,...fn(data)};}};
  const agent={errand:async args=>{calls.push(args);if(options.lose)throw new Error('lost');return options.reply||{ok:true,jobId:'job-'+calls.length};},queryErrand:async args=>options.query||{ok:true,jobId:args.jobId,status:options.status,sessionId:'task-'+args.jobId}};
  const inspect=async()=>{if(options.inspect)await options.inspect();return{workflows:{...workflows(),...(options.ue?{'ue-update':options.ue}:{})}};};
  const sidebar=createProjectSidebar({store,agent,inspect,now:()=>time});
  return {sidebar,store,calls,options,agent,tick:()=>{time+=11000;},get data(){return data;},set data(value){data=value;}};
}
test('saved root enables five workflows without any chat or launch, and survives restart',async()=>{
  const f=fixture();assert.equal((await f.sidebar.refresh()).state,'ready');assert.equal(f.sidebar.view().directory,'/project');
  assert.ok(Object.entries(f.sidebar.view().workflows).filter(([id])=>id!=='ue-update').every(([,w])=>w.enabled));assert.equal(f.calls.length,0);
  const fresh=createProjectSidebar({store:f.store,agent:f.agent,inspect:async()=>({workflows:workflows()})});
  assert.equal((await fresh.refresh()).state,'ready');assert.equal(f.calls.length,0);
});
test('each request reuses the project room and selected root, without source chat id or call token',async()=>{
  const f=fixture();await f.sidebar.refresh();
  const first=await f.sidebar.launch('project-request-00001','feature','p','goal');assert.equal(first.state,'accepted');
  await f.sidebar.launch('project-request-00001','feature','p');assert.equal(f.calls.length,1);
  f.options.status='done';await f.sidebar.refresh();f.tick();await f.sidebar.launch('project-request-00002','tooling','p');
  assert.equal(f.calls.length,2);assert.equal(f.calls[0].sessionKey,f.calls[1].sessionKey);
  for(const call of f.calls){assert.equal(call.workingDir,'/project');assert.equal(call.sessionId,undefined);assert.equal(call.userActionToken,undefined);assert.ok(call.task.includes('AGENTS.md'));assert.ok(call.task.includes('/project/_S/'));}
});
test('running jobs block concurrency and inspection refresh updates authoritative task session receipts',async()=>{
  const f=fixture();await f.sidebar.refresh();await f.sidebar.launch('project-request-00001','feature','p');f.tick();
  assert.equal((await f.sidebar.launch('project-request-00002','feature','p')).code,'BUSY');
  assert.equal(f.calls.length,1);assert.equal(f.data.sidebarReceipts['project-request-00001'].sessionId,'task-job-1');
  f.options.status='done';await f.sidebar.refresh();assert.equal(f.sidebar.view().busy,false);
});
test('changed project during inspection or mismatching project id cannot launch',async()=>{
  const f=fixture();await f.sidebar.refresh();assert.equal((await f.sidebar.launch('project-request-00001','feature','other')).code,'SOURCE_CHANGED');
  f.options.inspect=async()=>{f.data.projectConfiguration.revision++;};
  assert.equal((await f.sidebar.launch('project-request-00002','feature','p')).code,'SOURCE_CHANGED');assert.equal(f.calls.length,0);
});
test('lost receipts never replay, including restart; explicit acknowledge only unlocks new requests',async()=>{
  const f=fixture();await f.sidebar.refresh();f.options.lose=true;
  assert.equal((await f.sidebar.launch('project-request-00001','feature','p')).state,'uncertain');
  await f.sidebar.launch('project-request-00001','feature','p');assert.equal(f.calls.length,1);
  await f.sidebar.refresh();assert.equal(f.sidebar.view().verificationNeeded,true);
  await f.sidebar.acknowledge();f.tick();f.options.lose=false;
  await f.sidebar.launch('project-request-00002','feature','p');assert.equal(f.calls.length,2);
  assert.equal(f.data.sidebarReceipts['project-request-00001'].state,'uncertain');
});
test('Host rejection, absent interfaces, and disk failure do not dispatch extra work',async()=>{
  const f=fixture();await f.sidebar.refresh();f.options.reply={ok:false,errorCode:'PERMISSION_DENIED'};
  assert.equal((await f.sidebar.launch('project-request-00001','feature','p')).code,'PERMISSION_DENIED');assert.equal(f.sidebar.view().busy,false);
  f.tick();f.options.failWrite=true;await assert.rejects(f.sidebar.launch('project-request-00002','feature','p'));assert.equal(f.calls.length,1);
  delete f.agent.errand;assert.equal(f.sidebar.view().state,'unsupported');
});
test('expired jobs keep verification visible; checking does not resend an expired job',async()=>{
  const f=fixture();await f.sidebar.refresh();await f.sidebar.launch('project-request-00001','feature','p');
  f.options.query={ok:false,errorCode:'JOB_NOT_FOUND'};await f.sidebar.refresh();
  assert.equal(f.sidebar.view().verificationNeeded,true);assert.equal(f.sidebar.view().busy,true);
  await f.sidebar.acknowledge();assert.equal(f.sidebar.view().busy,false);assert.equal(f.calls.length,1);
});

test('thrown job queries persist verification and explicit acknowledgement permits only new launches',async()=>{
 const f=fixture();await f.sidebar.refresh();await f.sidebar.launch('project-request-00001','feature','p');
 f.agent.queryErrand=async()=>{throw new Error('connection lost');};
 for(let i=0;i<2;i++){await f.sidebar.refresh();assert.equal(f.sidebar.view().busy,true);assert.equal(f.sidebar.view().verificationNeeded,true);}
 assert.equal(f.data.sidebarReceipts['project-request-00001'].queryError,'UNVERIFIED_RECEIPT');
 await f.sidebar.acknowledge();assert.equal(f.sidebar.view().busy,false);assert.equal(f.sidebar.view().verificationNeeded,false);
 await f.sidebar.launch('project-request-00001','feature','p');assert.equal(f.calls.length,1);
 f.tick();await f.sidebar.launch('project-request-00002','feature','p');assert.equal(f.calls.length,2);
});

test('UE update is optional, checks file again on launch, and uses durable real dispatch',async()=>{
 const f=fixture();await f.sidebar.refresh();
 assert.equal(f.sidebar.view().workflows['ue-update'].enabled,false);
 assert.equal((await f.sidebar.launch('ue-update-request-0001','ue-update','p')).code,'FLOW_UNAVAILABLE');
 assert.equal(f.calls.length,0);
 f.options.ue={ok:true,source:'/flows/UPDATE_UE5.md'};await f.sidebar.refresh();
 assert.equal(f.sidebar.view().workflows['ue-update'].enabled,true);
 f.options.ue={ok:false,reason:'missing'};
 assert.equal((await f.sidebar.launch('ue-update-request-0002','ue-update','p')).code,'FLOW_UNAVAILABLE');
 f.options.ue={ok:true,source:'/flows/UPDATE_UE5.md'};
 const reply=await f.sidebar.launch('ue-update-request-0003','ue-update','p','直接更新');assert.equal(reply.state,'accepted');
 await f.sidebar.launch('ue-update-request-0003','ue-update','p');assert.equal(f.calls.length,1);
 const call=f.calls[0];assert.equal(call.workingDir,'/project');assert.equal(call.title,'极心许愿 · 项目处理');
 assert.ok(call.task.includes('/flows/UPDATE_UE5.md'));
 for(const part of ['仅授权先做更新前检查','空间需求待确认','相同磁盘合并计算','暂无法可靠估计','请求明确确认','禁止 fetch/pull','请求用户手动选择引擎根目录','保持同一任务等待用户答复','校验通过后在同一任务继续','用户选目录只确定预检目标，不等于确认更新'])assert.ok(call.task.includes(part),part);
});
