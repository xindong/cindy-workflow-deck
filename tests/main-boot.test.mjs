import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const entry = (await readFile(new URL('../plugin/main.js',import.meta.url),'utf8')).replace("import('./runtime.js')", 'loadRuntime()');
function boot() {
  let listener, resolve, reject; const sent=[], delivered=[];
  const loading = new Promise((yes,no)=>{resolve=yes;reject=no;});
  vm.runInNewContext(entry,{ cindy:{onHostMessage:cb=>{listener=cb;},send:message=>{sent.push(message);return Promise.resolve();}},loadRuntime:()=>loading,console:{error(){}} });
  return {emit:message=>listener(message),isListening:()=>typeof listener==='function',resolve,reject,sent,delivered};
}
test('boot registers listener synchronously and queues first calls while runtime is still loading',async()=>{
  const b=boot();assert.ok(b.isListening());
  b.emit({type:'tool-call',callId:'first'});b.emit({type:'tool-call',callId:'second'});
  assert.equal(b.delivered.length,0);
  b.resolve({handleHostMessage:message=>b.delivered.push(message)});await Promise.resolve();
  assert.deepEqual(b.delivered.map(m=>m.callId),['first','second']);
  b.emit({type:'tool-call',callId:'third'});assert.equal(b.delivered[2].callId,'third');
});
test('module load failure settles queued and future tool calls instead of leaving them pending',async()=>{
  const b=boot();b.emit({type:'tool-call',callId:'first'});b.reject(new Error('module failed'));
  await Promise.resolve();await Promise.resolve();
  b.emit({type:'tool-call',callId:'second'});
  assert.deepEqual(b.sent.map(m=>m.callId),['first','second']);
  assert.ok(b.sent.every(m=>m.ok===false&&m.errorCode==='PLUGIN_START_FAILED'));
});
