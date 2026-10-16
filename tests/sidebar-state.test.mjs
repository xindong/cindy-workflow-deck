import test from 'node:test';
import assert from 'node:assert/strict';
import { createSidebar } from '../plugin/sidebar-state.js';
const ctx=(id='source')=>({session_id:id,workdir:'/project/'+id,workdir_is_local:true,workdir_is_read_only:false});
const result=(enabled=true)=>({checkedAt:'2026-10-16T00:00:00Z',workflows:Object.fromEntries(['experiment','feature','tooling','pr','merge'].map(id=>[id,{ok:enabled,...(!enabled?{reason:'missing'}:{source:'/project/'+id})}]))});
function fixture(){
  let saved={},time=0;const calls=[];const options={inspection:result(),throwRun:false,reply:null,failWrite:false};
  const store={read:async()=>structuredClone(saved),write:async patch=>{if(options.failWrite)throw new Error('storage');saved={...saved,...structuredClone(patch)};}};
  const inspect=async dir=>{if(options.inspectHook)return options.inspectHook(dir);return structuredClone(options.inspection);};
  const sidebar=createSidebar({inspect,store,now:()=>time,agent:{run:async args=>{calls.push(args);if(options.throwRun)throw new Error('lost');return options.reply||{ok:true,sessionId:'new-'+calls.length};}}});
  return {sidebar,options,calls,store,saved:()=>saved,tick:()=>{time+=11000;}};
}
test('initial state is disabled; remote/unverified paths cannot bind',async()=>{
 const f=fixture();assert.equal(f.sidebar.view().state,'unbound');
 for(const context of [null,{...ctx(),workdir_is_local:false},{...ctx(),workdir:''}])await assert.rejects(f.sidebar.bind(context));
 assert.equal(f.calls.length,0);
});
test('empty project disables every action; partial availability is per workflow',async()=>{
 const f=fixture();f.options.inspection=result(false);await f.sidebar.bind(ctx());
 assert.ok(Object.values(f.sidebar.view().workflows).every(item=>!item.enabled));
 f.options.inspection.workflows.feature={ok:true};await f.sidebar.refresh();
 assert.equal(f.sidebar.view().workflows.feature.enabled,true);assert.equal(f.sidebar.view().workflows.merge.enabled,false);
});
test('read-only source and failed inspection fail closed without pretending files are missing',async()=>{
 const f=fixture();await f.sidebar.bind({...ctx(),workdir_is_read_only:true});assert.equal(f.sidebar.view().state,'readonly');
 f.options.inspectHook=async()=>{throw new Error('disk unavailable');};await f.sidebar.bind(ctx('other'));
 assert.equal(f.sidebar.view().state,'check_failed');assert.equal(f.sidebar.view().workflows.feature.enabled,false);
});
test('each sidebar click requests a new task in the Host-associated source with no path/model override',async()=>{
 const f=fixture();await f.sidebar.bind(ctx());
 for(const [index,id]of ['experiment','feature','tooling','pr','merge'].entries()){
  const receipt=await f.sidebar.launch('request-key-0000'+index,id,'source','goal');assert.equal(receipt.state,'accepted');f.tick();
 }
 assert.equal(f.calls.length,5);
 for(const args of f.calls){assert.equal(args.mode,'new');assert.equal(args.trigger,'background');assert.equal(args.sessionId,'source');assert.equal(args.promptTemplate,'{{user_message}}');assert.equal(args.workingDir,undefined);assert.equal(args.route,undefined);assert.ok(args.userMessage.includes('goal'));}
});
test('duplicate request is read-only and cooldown limits new requests',async()=>{
 const f=fixture();await f.sidebar.bind(ctx());const a=await f.sidebar.launch('same-request-key-1','feature','source');
 assert.deepEqual(await f.sidebar.launch('same-request-key-1','feature','source'),a);
 assert.equal((await f.sidebar.launch('same-request-key-2','feature','source')).code,'RATE_LIMITED');assert.equal(f.calls.length,1);
});
test('lost receipt is uncertain and not replayed; new runtime requires binding again',async()=>{
 const f=fixture();f.options.throwRun=true;await f.sidebar.bind(ctx());
 assert.equal((await f.sidebar.launch('lost-request-key-1','feature','source')).state,'uncertain');f.tick();
 await f.sidebar.launch('lost-request-key-1','feature','source');assert.equal(f.calls.length,1);
 const fresh=createSidebar({inspect:async()=>result(),agent:{run:async()=>assert.fail('must not run')},store:f.store});
 assert.equal(fresh.view().state,'unbound');
 assert.equal((await fresh.launch('fresh-request-key-1','feature','source')).code,'SOURCE_CHANGED');
});
test('switch to unknown source disables, known source can resume; dropped events or changed workdir invalidate binding',async()=>{
 const f=fixture();await f.sidebar.bind(ctx());f.sidebar.switchSession('other');assert.equal(f.sidebar.view().state,'unbound');
 f.sidebar.switchSession('source','/project/source');assert.equal(f.sidebar.view().state,'ready');
 f.sidebar.switchSession('source','/different');assert.equal(f.sidebar.view().state,'unbound');
 await f.sidebar.bind(ctx());f.sidebar.switchSession('source','/project/source',true);assert.equal(f.sidebar.view().state,'unbound');
});
test('launch rechecks files, source id and session switching during async inspection',async()=>{
 const f=fixture();await f.sidebar.bind(ctx());f.options.inspection=result(false);
 assert.equal((await f.sidebar.launch('missing-request-key-1','feature','source')).code,'FLOW_UNAVAILABLE');assert.equal(f.calls.length,0);
 assert.equal((await f.sidebar.launch('wrong-request-key-1','feature','wrong')).code,'SOURCE_CHANGED');
 let resolve,entered;const waiting=new Promise(yes=>{entered=yes});f.options.inspectHook=()=>{entered();return new Promise(yes=>{resolve=yes;});};
 const pending=f.sidebar.launch('race-request-key-1','feature','source');await waiting;f.sidebar.switchSession('other');resolve(result());
 assert.equal((await pending).state,'rejected');assert.equal(f.calls.length,0);
});
test('storage failure prevents launch; Host permission denial invalidates binding',async()=>{
 const f=fixture();await f.sidebar.bind(ctx());f.options.failWrite=true;await assert.rejects(f.sidebar.launch('disk-request-key-1','feature','source'));assert.equal(f.calls.length,0);
 f.options.failWrite=false;f.options.reply={ok:false,errorCode:'PERMISSION_DENIED'};
 assert.equal((await f.sidebar.launch('deny-request-key-1','feature','source')).state,'rejected');assert.equal(f.sidebar.view().state,'unbound');
});
