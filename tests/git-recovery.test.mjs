import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {gitWithHost} from '../plugin/git-host.js';
function worker(t) {
 const child=spawn(process.execPath,[resolve(import.meta.dirname,'../plugin/node/inspect-project.cjs')],{stdio:['pipe','pipe','pipe']});
 t.after(()=>child.kill());let id=0;const pending=new Map();
 createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line);const p=pending.get(r.id);pending.delete(r.id);p?.(r);});
 child.stderr.resume();
 return {child,request:args=>new Promise(yes=>{const n=++id;pending.set(n,yes);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...args})+'\n');})};
}
test('worker preserves domain error codes and accepts fresh reviews after errors and restart',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'jixin-recover-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const git=a=>execFileSync('git',['-C',root,...a],{encoding:'utf8'}).trim();
 git(['init','-q','-b','main']);git(['config','user.name','Recovery']);git(['config','user.email','test@example.test']);
 await writeFile(join(root,'AGENTS.md'),'Use project hooks.');git(['add','.']);git(['commit','-qm','initial']);
 let w=worker(t);const raw=p=>w.request({method:'project/git',params:{dir:root,...p}});
 const host={request:async args=>{const r=await w.request(args);assert.equal(r.error,undefined,'Domain errors must not be protocol errors');return {ok:true,result:r.result};}};
 const call=p=>gitWithHost(host,root,p);
 const initial=await call({action:'status'});w.child.kill();w=worker(t);
 await assert.rejects(call({action:'branch-create',branch:'feature/lost',token:initial.token,rulesConfirmed:true}),{code:'STALE_REVIEW'});
 for(let i=0;i<3;i++){
  const fresh=await call({action:'status'});
  await assert.rejects(call({action:'branch-create',branch:'--invalid',token:fresh.token,rulesConfirmed:true}),{code:'INVALID_BRANCH'});
 }
 const fresh=await call({action:'status'});
 await call({action:'branch-create',branch:'feature/recovered',token:fresh.token,rulesConfirmed:true});
 assert.equal(git(['branch','--show-current']),'feature/recovered');
 await assert.rejects(call({action:'branch-create',branch:'feature/replay',token:fresh.token,rulesConfirmed:true}),{code:'STALE_REVIEW'});
 assert.equal((await raw({action:'status'})).result.ok,true);
});
test('transport failures remain failures and are never retried',async()=>{
 let calls=0;await assert.rejects(gitWithHost({request:async()=>{calls++;return {ok:false,errorCode:'TIMEOUT',message:'timeout'};}},'/project',{action:'beginner-update'}),{code:'TIMEOUT'});assert.equal(calls,1);
});
