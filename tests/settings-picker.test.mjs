import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsTransport} from '../plugin/settings-transport.js';
test('native folder picker waits beyond ordinary RPC deadline; cancel/select settle once and close rejects pending',async t=>{
 const originals={fetch:globalThis.fetch,BroadcastChannel:globalThis.BroadcastChannel,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 t.after(()=>Object.assign(globalThis,originals));
 const channels=[],timers=[];
 globalThis.fetch=async()=>({ok:true});
 globalThis.setTimeout=(callback,delay)=>{const timer={callback,delay};timers.push(timer);return timer;};globalThis.clearTimeout=()=>{};
 globalThis.BroadcastChannel=class{constructor(){channels.push(this);}postMessage(message){this.last=message;}close(){}};
 const transport=createSettingsTransport(),channel=channels[0];
 const choose=transport.call('config-pick-directory');await Promise.resolve();await Promise.resolve();
 assert.equal(timers.length,0,'No client deadline may end a human folder decision');
 const id=channel.last.reqId;
 channel.onmessage({data:{from:'main',type:'settings-result',reqId:id,ok:true,result:{path:'/chosen'}}});assert.deepEqual(await choose,{path:'/chosen'});
 const cancel=transport.call('config-pick-directory');await Promise.resolve();channel.onmessage({data:{from:'main',type:'settings-result',reqId:channel.last.reqId,ok:false,code:'CANCELLED',message:'cancelled'}});await assert.rejects(cancel,{code:'CANCELLED'});
 const read=transport.call('config-inspect');assert.equal(timers[0].delay,30000);timers[0].callback();await assert.rejects(read,{code:'RESPONSE_UNCONFIRMED'});
 const pending=transport.call('config-pick-directory');transport.close();await assert.rejects(pending,/Settings closed/);
});
