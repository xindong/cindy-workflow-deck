import test from 'node:test';
import assert from 'node:assert/strict';
import { createSidebar } from '../plugin/sidebar-state.js';
const ctx=(id='source')=>({session_id:id,workdir:'/project/'+id,workdir_is_local:true,workdir_is_read_only:false});
const result=(enabled=true)=>({checkedAt:'2026-10-16T00:00:00Z',workflows:Object.fromEntries(['experiment','feature','tooling','pr','merge'].map(id=>[id,{ok:enabled,...(!enabled?{reason:'missing'}:{source:'/project/'+id})}]))});
function fixture(){
  let saved={},time=0;const calls=[];const options={inspection:result(),throwRun:false,reply:null,failWrite:false};
  const store={read:async()=>structuredClone(saved),write:async patch=>{if(options.failWrite)throw new Error('storage');saved={...saved,...structuredClone(patch)};}};
  const inspect=async dir=>{if(options.inspectHook)return options.inspectHook(dir);return structuredClone(options.inspection);};
  const sidebar=createSidebar({inspect,store,now:()=>time,agent:{run:async args=>{calls.push(args);if(options.runHook)return options.runHook(args);if(options.throwRun)throw new Error('lost');return options.reply||{ok:true,sessionId:'new-'+calls.length};}}});
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
test('visiting an accepted workflow task keeps the verified source usable after cooldown',async()=>{
 const f=fixture();await f.sidebar.bind(ctx());
 const receipt=await f.sidebar.launch('child-request-key-1','feature','source');
 f.sidebar.switchSession(receipt.sessionId,'/project/source');f.tick();
 assert.equal(f.sidebar.view().sessionId,'source');
 assert.equal(f.sidebar.view().state,'ready');
 assert.ok(Object.values(f.sidebar.view().workflows).every(item=>item.enabled));
 assert.equal((await f.sidebar.launch('child-request-key-2','tooling','source')).state,'accepted');
 assert.equal(f.calls[1].sessionId,'source');
 f.sidebar.switchSession('unknown','/project/source');
 assert.equal(f.sidebar.view().state,'unbound');
});
test('focus event arriving before the launch receipt is reconciled without retargeting the source',async()=>{
 const f=fixture();await f.sidebar.bind(ctx());
 f.options.runHook=async()=>{f.sidebar.switchSession('early-child','/project/source');return {ok:true,sessionId:'early-child'};};
 await f.sidebar.launch('early-request-key-1','feature','source');f.tick();
 assert.equal(f.sidebar.view().state,'ready');assert.equal(f.sidebar.view().sessionId,'source');
 assert.equal(f.sidebar.view().workflows.tooling.enabled,true);
});
test('child links cannot survive directory changes, source archival, dropped events or rebinding',async()=>{
 for(const action of ['directory','archive','dropped','rebind']){
  const f=fixture();await f.sidebar.bind(ctx());const receipt=await f.sidebar.launch('invalidate-child-1','feature','source');f.tick();
  if(action==='archive')f.sidebar.forgetSession('source');
  if(action==='dropped')f.sidebar.switchSession('source','/project/source',true);
  if(action==='rebind')await f.sidebar.bind({...ctx(),workdir:'/changed'});
  f.sidebar.switchSession(receipt.sessionId,action==='directory'?'/other':'/project/source');
  assert.equal(f.sidebar.view().state,'unbound',action);
  assert.equal((await f.sidebar.launch('invalidate-child-2','tooling','source')).code,'SOURCE_CHANGED');
  assert.equal(f.calls.length,1);
 }
});
test('unverified receipts cannot associate another chat even at the same directory',async()=>{
 const f=fixture();await f.sidebar.bind(ctx());f.options.throwRun=true;
 await f.sidebar.launch('unverified-child-1','feature','source');f.tick();
 f.sidebar.switchSession('new-1','/project/source');assert.equal(f.sidebar.view().state,'unbound');
});
test('missing Agent API disables launching without writing an uncertain receipt',async()=>{
 let writes=0;const sidebar=createSidebar({agent:{},inspect:async()=>result(),store:{read:async()=>({}),write:async()=>{writes++;}}});
 await sidebar.bind(ctx());assert.equal(sidebar.view().state,'unsupported');
 assert.equal((await sidebar.launch('missing-agent-key-1','feature','source')).code,'UNSUPPORTED_HOST');
 assert.equal(writes,0);assert.ok(Object.values(sidebar.view().workflows).every(item=>!item.enabled));
});
test('unsupported inspection remains distinct and refresh can recover',async()=>{
 const f=fixture();f.options.inspectHook=async()=>{throw Object.assign(new Error('unsupported'),{code:'UNSUPPORTED_HOST'});};
 await f.sidebar.bind(ctx());assert.equal(f.sidebar.view().state,'unsupported');
 assert.equal((await f.sidebar.launch('unsupported-node-1','feature','source')).code,'UNSUPPORTED_HOST');assert.equal(f.calls.length,0);
 f.options.inspectHook=null;await f.sidebar.refresh();assert.equal(f.sidebar.view().state,'ready');
});
test('explicit unsupported Agent receipts or errors reject without automatic replay',async()=>{
 for(const throws of [false,true]){
  const f=fixture();await f.sidebar.bind(ctx());
  f.options.runHook=async()=>{if(throws)throw Object.assign(new Error('unsupported'),{code:'UNSUPPORTED_OPERATION'});return {ok:false,errorCode:'UNSUPPORTED_HOST'};};
  const r=await f.sidebar.launch('unsupported-agent-1','feature','source');
  assert.equal(r.state,'rejected');assert.equal(r.code,'UNSUPPORTED_HOST');assert.equal(f.sidebar.view().state,'unsupported');assert.equal(f.sidebar.view().busy,false);
  assert.deepEqual(await f.sidebar.launch('unsupported-agent-1','feature','source'),r);assert.equal(f.calls.length,1);
 }
});
