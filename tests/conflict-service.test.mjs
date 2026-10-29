import test from 'node:test';
import assert from 'node:assert/strict';
import {createConflictService} from '../plugin/conflict-service.js';
import {createConfigurationController} from '../plugin/configuration-controller.js';
import {updateConfiguration,newProject} from '../plugin/core/project-config.mjs';
import {randomUUID} from 'node:crypto';
function fixture() {
 const project={...newProject('one'),directory:'/project'},calls=[];
 let data={projectConfiguration:updateConfiguration({},0,{projects:[project],activeProjectId:project.id})};
 const store={read:async()=>data,update:async fn=>{Object.assign(data,fn(data));}};
 const agent={errand:async p=>{calls.push(p);return {ok:true,jobId:'job',sessionId:'session'};},queryErrand:async()=>({ok:true,status:'done'})};
 const service=createConflictService({store,agent,git:async()=>({operationLocked:false})});
 const params={projectId:'one',revision:1,operationId:randomUUID(),strategy:'ask',instructions:'请先问我'};
 return {service,params,agent,calls,store};
}
test('AI repair is scoped to selected project, asks before semantic choices, and transport retries never dispatch twice',async()=>{
 const f=fixture(),r=await f.service('conflict-start',f.params);assert.equal(r.state,'running');assert.equal(f.calls[0].workingDir,'/project');assert.match(f.calls[0].task,/选择框工具/);assert.match(f.calls[0].task,/不提交、上传或创建 PR/);
 assert.equal((await f.service('conflict-start',f.params)).jobId,'job');
 assert.equal((await f.service('conflict-start',{...f.params,operationId:randomUUID()})).jobId,'job');assert.equal(f.calls.length,1);
 assert.equal((await f.service('conflict-read',f.params)).state,'done');assert.equal(f.calls.length,1);
});
test('uncertain dispatch survives service restart and cannot be replayed with a new request id',async()=>{
 const f=fixture();f.agent.errand=async()=>{f.calls.push('lost');throw new Error('response lost');};
 assert.equal((await f.service('conflict-start',f.params)).state,'uncertain');
 const fresh=createConflictService({store:f.store,agent:f.agent,git:()=>{throw new Error('must not reread or dispatch');}});
 assert.equal((await fresh('conflict-start',{...f.params,operationId:randomUUID()})).state,'uncertain');assert.equal(f.calls.length,1);
});
test('stale settings, invalid instructions and active locks stop repair before dispatch',async()=>{
 const f=fixture();await assert.rejects(f.service('conflict-start',{...f.params,revision:0}),{code:'CONFIG_CONFLICT'});
 await assert.rejects(f.service('conflict-start',{...f.params,instructions:'x'.repeat(1001)}),{code:'INVALID_REQUEST'});
 const locked=createConflictService({store:f.store,agent:f.agent,git:async()=>({operationLocked:true})});
 await assert.rejects(locked('conflict-start',f.params),{code:'OPERATION_LOCKED'});assert.equal(f.calls.length,0);
});

test('lost dispatch can be manually acknowledged without replay and its receipt is retained',async()=>{
 const f=fixture();f.agent.errand=async()=>{f.calls.push('lost');throw new Error('lost');};
 const original=await f.service('conflict-start',f.params);
 await assert.rejects(f.service('conflict-acknowledge',{...f.params,recordId:original.id}),{code:'STALE_REVIEW'});
 const record=await f.service('conflict-acknowledge',{...f.params,recordId:original.id,confirmed:true});
 assert.equal(record.state,'acknowledged');assert.equal(record.acknowledgedFrom,'uncertain');assert.equal(f.calls.length,1);
 assert.equal((await f.service('conflict-read',f.params)).id,original.id);
 f.agent.errand=async p=>{f.calls.push(p);return {ok:true,jobId:'new-job'};};
 await f.service('conflict-start',{...f.params,operationId:randomUUID()});
 assert.equal((await f.service('conflict-start',f.params)).state,'acknowledged');assert.equal(f.calls.length,2);
});

test('configuration backend blocks legacy pending repairs and an acknowledged migration overrides the old receipt',async()=>{
 const f=fixture(),id=randomUUID();let writes=0;
 const controller=createConfigurationController({store:f.store,git:async()=>{writes++;return {};}});
 await f.store.update(()=>({conflictRepairs:{one:{id,directory:'/project',state:'uncertain'}}}));
 await assert.rejects(controller('git-request',{...f.params,action:'beginner-update'}),{code:'AI_REPAIR_PENDING'});assert.equal(writes,0);
 await controller('git-request',{...f.params,action:'status'});assert.equal(writes,1);
 await f.service('conflict-acknowledge',{...f.params,recordId:id,confirmed:true});
 await controller('git-request',{...f.params,action:'beginner-update'});assert.equal(writes,2);
 assert.equal((await f.store.read()).conflictRepairs.one.state,'uncertain');
});

test('same project id with a different directory has independent receipts and preserves unresolved old work',async()=>{
 const f=fixture();f.agent.queryErrand=async()=>({ok:true,status:'running'});
 const original=await f.service('conflict-start',f.params);
 await f.store.update(data=>({projectConfiguration:updateConfiguration(data,1,{projects:[{...newProject('one'),directory:'/other'}],activeProjectId:'one'})}));
 const params={...f.params,revision:2,operationId:randomUUID()};
 assert.equal(await f.service('conflict-read',params),null);
 const next=await f.service('conflict-start',params);assert.notEqual(next.id,original.id);assert.equal(f.calls[1].workingDir,'/other');
 assert.equal((await f.store.read()).conflictRepairsByDirectory['/project'].state,'running');
 assert.equal((await f.store.read()).conflictRepairsByDirectory['/other'].id,next.id);
});
