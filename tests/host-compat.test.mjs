import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWithHost } from '../plugin/host-compat.js';
test('missing Node interface is unsupported before any inspection is attempted',async()=>{
 for(const node of [undefined,{}, {request:true}])await assert.rejects(inspectWithHost(node,'/project'),{code:'UNSUPPORTED_HOST'});
});
test('explicit unsupported Node response is distinct from permissions and real failures',async()=>{
 for(const code of ['UNSUPPORTED_HOST','UNSUPPORTED_OPERATION','METHOD_NOT_FOUND','PERMISSION_DENIED','NETWORK_ERROR','PROJECT_CHECK_FAILED']){
  await assert.rejects(inspectWithHost({request:async()=>({ok:false,errorCode:code})},'/project'),{code:['UNSUPPORTED_HOST','UNSUPPORTED_OPERATION','METHOD_NOT_FOUND'].includes(code)?'UNSUPPORTED_HOST':code});
 }
 const error=Object.assign(new Error('disk'),{code:'EACCES'});
 await assert.rejects(inspectWithHost({request:async()=>{throw error;}},'/project'),{code:'EACCES'});
 assert.deepEqual(await inspectWithHost({request:async()=>({ok:true,result:{checked:true}})},'/project'),{checked:true});
});
