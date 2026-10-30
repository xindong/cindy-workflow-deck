import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {projectTaskKey,PROJECT_TASK_TITLE} from '../plugin/project-task.js';
import {createProjectSidebar} from '../plugin/project-sidebar.js';
import {createConflictService} from '../plugin/conflict-service.js';
import {updateConfiguration,newProject} from '../plugin/core/project-config.mjs';

test('project room key is stable, host-valid, and separates execution directories',async()=>{
 const a=await projectTaskKey('/project');assert.match(a,/^[a-zA-Z0-9._-]{1,64}$/);
 assert.equal(await projectTaskKey('/project/'),a);
 assert.equal(await projectTaskKey('C:\\Team\\Project\\'),await projectTaskKey('c:/team/project'));
 assert.notEqual(await projectTaskKey('/other'),a);
 await assert.rejects(projectTaskKey('relative/path'),{code:'INVALID_CONFIGURATION'});
});

test('conflict, UE and workflows share one Host room across reload; changed directories stay isolated',async()=>{
 let data={projectConfiguration:updateConfiguration({},0,{projects:[{...newProject('p'),directory:'/project'}],activeProjectId:'p'})},time=20000;
 const store={read:async()=>structuredClone(data),update:async fn=>Object.assign(data,fn(data))};
 const rooms=new Map(),jobs=new Map(),calls=[];
 const agent={errand:async args=>{
  calls.push(args);if(!rooms.has(args.sessionKey))rooms.set(args.sessionKey,'session-'+rooms.size);
  const reply={ok:true,sessionId:rooms.get(args.sessionKey),jobId:randomUUID()};jobs.set(reply.jobId,reply);return reply;
 },queryErrand:async({jobId})=>({...jobs.get(jobId),status:'done'})};
 const inspect=async()=>({workflows:Object.fromEntries(['experiment','feature','tooling','pr','merge','ue-update'].map(id=>[id,{ok:true,source:'/flows/'+id+'.md'}]))});
 const makeSidebar=()=>createProjectSidebar({store,agent,inspect,now:()=>time});
 let sidebar=makeSidebar();await sidebar.refresh();
 const first=await sidebar.launch(randomUUID(),'ue-update','p');await sidebar.refresh();
 const repair=createConflictService({store,agent,git:async()=>({operationLocked:false})});
 const params={projectId:'p',revision:1,operationId:randomUUID(),strategy:'ask',instructions:''};
 const second=await repair('conflict-start',params);assert.equal(second.sessionId,first.sessionId);
 await repair('conflict-read',params);
 sidebar=makeSidebar();await sidebar.refresh();time+=11000;
 const third=await sidebar.launch(randomUUID(),'feature','p');assert.equal(third.sessionId,first.sessionId);
 await sidebar.refresh();
 await store.update(latest=>({projectConfiguration:updateConfiguration(latest,1,{projects:[{...newProject('p'),directory:'/other'}],activeProjectId:'p'})}));
 time+=11000;await sidebar.refresh();const other=await sidebar.launch(randomUUID(),'ue-update','p');assert.notEqual(other.sessionId,first.sessionId);
 await sidebar.refresh();
 await store.update(latest=>({projectConfiguration:updateConfiguration(latest,2,{projects:[{...newProject('renamed'),directory:'/project',workflowDirectory:'/new-flows'}],activeProjectId:'renamed'})}));
 time+=11000;await sidebar.refresh();const back=await sidebar.launch(randomUUID(),'tooling','renamed');assert.equal(back.sessionId,first.sessionId);
 assert.equal(rooms.size,2);assert.equal(calls.length,5);
 for(const call of calls){assert.equal(call.title,PROJECT_TASK_TITLE);assert.ok(call.task.includes('不重放未确认的操作'));}
});
