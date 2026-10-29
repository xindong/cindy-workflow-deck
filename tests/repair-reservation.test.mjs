import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,mkdir,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {gitWithHost} from '../plugin/git-host.js';
function worker(t){
 const child=spawn(process.execPath,[resolve(import.meta.dirname,'../plugin/node/inspect-project.cjs')],{stdio:['pipe','pipe','pipe']});
 t.after(()=>child.kill());child.stderr.resume();let id=0;const pending=new Map();
 createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.({ok:true,result:r.result});pending.delete(r.id);});
 return {child,request:args=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...args})+'\n');})};
}
test('repair reservation survives worker restart, blocks ordinary writes, and requires exact verified release',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'jixin-repair-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 git(['init','-q','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);
 await writeFile(join(root,'note.md'),'base\n');git(['add','.']);git(['commit','-qm','base']);
 let host=worker(t);const call=params=>gitWithHost(host,root,params),id=randomUUID();
 const initial=await call({action:'status'});
 await call({action:'conflict-reserve',operationId:id});host.child.kill();host=worker(t);
 assert.equal((await call({action:'status'})).aiRepair.id,id);
 for(const action of ['beginner-update','file-revert','branch-create','beginner-acknowledge']){
  await assert.rejects(call({action,operationId:randomUUID(),token:initial.token,rulesConfirmed:true,branch:'feature/test'}),{code:'AI_REPAIR_PENDING'});
 }
 assert.equal(await readFile(join(root,'note.md'),'utf8'),'base\n');
 await assert.rejects(call({action:'conflict-reserve',operationId:randomUUID()}),{code:'AI_REPAIR_PENDING'});
 await assert.rejects(call({action:'conflict-release',recordId:randomUUID(),manual:true,confirmed:true}),{code:'STALE_REVIEW'});
 await assert.rejects(call({action:'conflict-release',recordId:id,manual:true}),{code:'RULE_REVIEW_REQUIRED'});
 const mergeHead=join(root,'.git','MERGE_HEAD');await writeFile(mergeHead,git(['rev-parse','HEAD'])+'\n');
 await assert.rejects(call({action:'conflict-release',recordId:id,manual:true,confirmed:true}),{code:'PROJECT_CONFLICT'});
 assert.equal((await call({action:'status'})).aiRepair.id,id);await rm(mergeHead);
 await call({action:'conflict-release',recordId:id,manual:true,confirmed:true});
 assert.equal((await call({action:'status'})).aiRepair,null);
 const fresh=await call({action:'status'});await call({action:'branch-create',branch:'feature/verified',token:fresh.token,rulesConfirmed:true});
 assert.equal(git(['branch','--show-current']),'feature/verified');
 const lock=join(root,'.git','jixin-write.lock');await mkdir(lock);
 await assert.rejects(call({action:'conflict-reserve',operationId:randomUUID()}),{code:'OPERATION_LOCKED'});await rm(lock,{recursive:true});
});
