import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requestNode} from '../plugin/node-request.js';
import {gitWithHost} from '../plugin/git-host.js';
import {errorHelp} from '../plugin/error-help.js';
const {createResultTransfer}=createRequire(import.meta.url)('../plugin/node/result-transfer.cjs');
test('real worker returns complete near-limit project rules in Host-safe lines and stays available',async t=>{
 const root=await mkdtemp(join(tmpdir(),'jixin-large-project-'));t.after(()=>rm(root,{recursive:true,force:true}));
 execFileSync('git',['init','-q',root]);
 const unit='规则 "路径" \\\n',body=unit.repeat(Math.floor(110000/Buffer.byteLength(unit)));let links='';
 for(let i=0;i<9;i++){await writeFile(join(root,'rule'+i+'.md'),body);links+='[规则](rule'+i+'.md)\n';}await writeFile(join(root,'AGENTS.md'),links);
 const child=spawn(process.execPath,['-e','require(process.argv[1])',fileURLToPath(new URL('../plugin/node/worker-entry.cjs',import.meta.url))],{stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());
 const pending=new Map(),lines=[],methods=[];let id=0;
 createInterface({input:child.stdout}).on('line',line=>{lines.push(Buffer.byteLength(line)+1);const message=JSON.parse(line),entry=pending.get(message.id);pending.delete(message.id);entry?.(message);});
 const node={request:async options=>{methods.push(options.method);const current=++id;const result=new Promise(resolve=>pending.set(current,resolve));child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:current,...options})+'\n');const message=await result;return message.error?{ok:false,error:message.error}:{ok:true,result:message.result};}};
 const state=await gitWithHost(node,root,{action:'status'});
 assert.equal(state.sources.length,10);assert.equal(state.incomplete,false);
 for(let i=0;i<9;i++)assert.equal(state.sources.find(s=>s.path==='rule'+i+'.md').content,body);
 assert.ok(Buffer.byteLength(JSON.stringify(state))>1024*1024,'reproduces oversized old response');
 assert.ok(lines.every(bytes=>bytes<1024*1024));assert.equal(methods.filter(m=>m==='project/git').length,1);
 assert.ok(methods.filter(m=>m==='result/read').length>1);assert.equal(methods.at(-1),'result/release');
 const next=await node.request({method:'unknown'});assert.equal(next.error.code,-32601);
});
test('escaped and Unicode pages remain bounded, immutable, independent, expiring and releasable',()=>{
 let clock=0;const store=createResultTransfer({now:()=>clock});
 const original={text:('\u0000"\\\n😀规则').repeat(90000)},a=store.wrap(original),b=store.wrap({second:original});
 assert.notEqual(a.token,b.token);let text='';while(text.length<a.length){const page=store.read({token:a.token,offset:text.length});assert.ok(Buffer.byteLength(JSON.stringify({jsonrpc:'2.0',id:1,result:page}))<1024*1024);assert.deepEqual(store.read({token:a.token,offset:text.length}),page);text+=page.text;}
 assert.deepEqual(JSON.parse(text),original);store.release(a);assert.throws(()=>store.read({token:a.token,offset:0}),{code:'RESULT_TRANSFER_EXPIRED'});
 assert.throws(()=>store.read({token:b.token,offset:1}),{code:'RESULT_TRANSFER_EXPIRED'});clock=120001;assert.throws(()=>store.read({token:b.token,offset:0}),{code:'RESULT_TRANSFER_EXPIRED'});
 assert.throws(()=>store.wrap({text:'a'.repeat(16*1024*1024)}),{code:'RESULT_TOO_LARGE'});
});
test('failed or malformed result pages never replay a write; cleanup cannot invalidate known success',async()=>{
 for(const fault of ['expired','wrong-token','wrong-offset','short','throw']){
  const calls=[];const node={request:async o=>{calls.push(o.method);if(o.method==='project/git')return {ok:true,result:{kind:'jixin-transfer-v1',token:'one',length:65537}};if(o.method==='result/release')return {ok:true};if(fault==='throw')throw Error('disconnected');if(fault==='expired')return {ok:false,errorCode:'RESULT_TRANSFER_EXPIRED'};return {ok:true,result:{token:fault==='wrong-token'?'two':'one',offset:fault==='wrong-offset'?1:0,text:'a'.repeat(fault==='short'?1:65536)}};}};
  await assert.rejects(requestNode(node,{method:'project/git',params:{action:'beginner-submit'}}));assert.equal(calls.filter(m=>m==='project/git').length,1);assert.equal(calls.at(-1),'result/release');
 }
 const text=JSON.stringify({ok:true});const node={request:async o=>{if(o.method==='write')return {ok:true,result:{kind:'jixin-transfer-v1',token:'t',length:text.length}};if(o.method==='result/read')return {ok:true,result:{token:'t',offset:0,text}};throw Error('cleanup unavailable');}};
 assert.deepEqual((await requestNode(node,{method:'write'})).result,{ok:true});
});
test('error explanations give a plain reason and next step while preserving diagnostics',()=>{
 const raw={code:'PROTOCOL_ERROR',message:'Node stdout 单行超过 1MB'},help=errorHelp(raw);
 assert.match(help.message,/项目信息较多/);assert.match(help.message,/升级插件/);assert.doesNotMatch(help.message,/PROTOCOL|stdout/);assert.match(help.detail,/PROTOCOL_ERROR\nNode stdout/);
 for(const error of [{code:'HOST_NOT_READY'},{code:'EACCES'},{code:'RESULT_TRANSFER_EXPIRED'},{code:'UNKNOWN',message:'TypeError: unexpected wire payload'}]){
  const shown=errorHelp(error);assert.match(shown.message,/请/);assert.doesNotMatch(shown.message,/TypeError|HOST_NOT_READY|EACCES/);assert.ok(shown.detail.includes(error.code));assert.ok(/[a-z]/i.test(errorHelp(error,true).message));
 }
});
