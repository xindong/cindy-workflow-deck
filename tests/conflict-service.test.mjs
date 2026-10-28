import test from 'node:test';
import assert from 'node:assert/strict';
import {createConflictService} from '../plugin/conflict-service.js';
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
