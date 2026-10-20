import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
async function fixture(t,template=false) {
 const temp=await mkdtemp(join(tmpdir(),'jixin-beginner-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const root=join(await realpath(temp),'project'),remote=join(temp,'origin.git');await mkdir(root);
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 git(['init','-q','-b','main']);git(['config','user.name','Art Fixture']);git(['config','user.email','art@example.test']);
 await writeFile(join(root,'AGENTS.md'),'Use Conventional Commits. DCO required. Never commit directly to main. Use a PR.');
 if(template){await mkdir(join(root,'.github'));await writeFile(join(root,'.github/PULL_REQUEST_TEMPLATE.md'),'## Team verification\n- [ ] Art lead approved\n');}
 git(['add','.']);git(['commit','-qm','chore: initial']);const main=git(['rev-parse','HEAD']);
 execFileSync('git',['init','-q','--bare',remote]);git(['remote','add','origin',remote]);git(['push','-qu','origin','main']);git(['symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/main']);
 const bin=join(root,'.git/bin');await mkdir(bin);const log=join(root,'.git/gh-args.json'),gh=join(bin,'gh');
 await writeFile(gh,'#!'+process.execPath+'\n'+
  'const fs=require("node:fs");const a=process.argv.slice(2);if(a[0]==="auth")process.exit(0);fs.writeFileSync('+JSON.stringify(log)+',JSON.stringify(a));if(fs.existsSync('+JSON.stringify(join(root,'.git/fail-review'))+')){console.error("Review result uncertain");process.exit(1);}console.log("https://example.test/team/repo/pull/1");\n');
 await chmod(gh,0o755);const previous=process.env.PATH;process.env.PATH=bin+':'+previous;t.after(()=>{process.env.PATH=previous;});
 const status=()=>gitRequest(root),act=async(action,extra={})=>gitRequest(root,{action,token:(await status()).token,rulesConfirmed:true,operationId:randomUUID(),...extra});
 return {root,remote,git,main,log,status,act};
}
test('beginner submits only chosen art files on a new branch, DCO + native hooks, mock review and durable replay',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'hero.png'),'art');await writeFile(join(f.root,'someone-else.txt'),'keep');
 const operationId=randomUUID(),result=await f.act('beginner-submit',{operationId,paths:['hero.png'],summary:'调整角色颜色'});
 assert.equal(result.state,'awaiting-review');assert.match(f.git(['branch','--show-current']),/^work\/change-/);assert.equal(f.git(['rev-parse','main']),f.main);
 assert.equal(f.git(['diff-tree','--no-commit-id','--name-only','-r','HEAD']),'hero.png');assert.match(f.git(['log','-1','--format=%B']),/chore: 调整角色颜色[\s\S]*Signed-off-by: Art Fixture/);
 assert.equal(await readFile(join(f.root,'someone-else.txt'),'utf8'),'keep');const args=JSON.parse(await readFile(f.log,'utf8'));assert.equal(args[args.indexOf('--base')+1],'main');assert.equal(args.includes('--draft'),false);
 const head=f.git(['rev-parse','HEAD']);assert.equal((await f.act('beginner-submit',{operationId})).id,operationId);assert.equal(f.git(['rev-parse','HEAD']),head);
 assert.equal((await f.status()).beginnerReceipt.state,'awaiting-review');
});
test('template creates draft, preserves unchecked requirements, never claims approval',async t=>{
 const f=await fixture(t,true);await writeFile(join(f.root,'art.png'),'art');const r=await f.act('beginner-submit',{paths:['art.png'],summary:'调整材质'});
 assert.equal(r.state,'review-draft');const a=JSON.parse(await readFile(f.log,'utf8'));assert.ok(a.includes('--draft'));assert.match(a[a.indexOf('--body')+1],/- \[ \] Art lead approved/);
});
test('selection, existing index, unrelated commits and dirty updates block without losing work',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'art.png'),'art');
 await assert.rejects(f.act('beginner-submit',{paths:[],summary:'x'}),{code:'SELECT_FILES'});
 await assert.rejects(f.act('beginner-update'),{code:'DIRTY_WORKTREE'});
 f.git(['add','art.png']);await assert.rejects(f.act('beginner-submit',{paths:['art.png'],summary:'x'}),{code:'EXISTING_STAGED_CHANGES'});
 f.git(['switch','-c','feature/old']);f.git(['commit','-qm','chore: old']);await writeFile(join(f.root,'new.png'),'new');
 await assert.rejects(f.act('beginner-submit',{paths:['new.png'],summary:'x'}),{code:'UNREVIEWED_COMMITS'});
 assert.equal(await readFile(join(f.root,'art.png'),'utf8'),'art');assert.equal(await readFile(join(f.root,'new.png'),'utf8'),'new');
});
test('rejecting hook keeps files, persistent block survives module reload, acknowledgement does not replay',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\necho TEAM_REJECTED >&2\nexit 1\n');await chmod(join(f.root,'.git/hooks/pre-commit'),0o755);
 await writeFile(join(f.root,'art.png'),'art');const r=await f.act('beginner-submit',{paths:['art.png'],summary:'x'});assert.equal(r.state,'blocked');assert.match(r.detail,/TEAM_REJECTED/);assert.equal(f.git(['rev-parse','HEAD']),f.main);assert.equal(await readFile(join(f.root,'art.png'),'utf8'),'art');
 const req=createRequire(import.meta.url);delete req.cache[req.resolve('../plugin/node/beginner-git.cjs')];assert.equal((await f.status()).beginnerReceipt.id,r.id);
 await assert.rejects(f.act('beginner-update'),{code:'PREVIOUS_OPERATION_PENDING'});
 await f.act('beginner-acknowledge',{recordId:r.id});assert.equal((await f.status()).beginnerReceipt.state,'acknowledged');assert.equal(f.git(['rev-parse','HEAD']),f.main);
});
test('uncertain review keeps uploaded commit and blocks future submissions without replay',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'.git/fail-review'),'fail');await writeFile(join(f.root,'art.png'),'art');
 const r=await f.act('beginner-submit',{paths:['art.png'],summary:'x'});assert.equal(r.state,'needs-verification');assert.ok(r.completed.includes('push'));assert.equal(f.git(['rev-parse','origin/'+r.branch]),f.git(['rev-parse','HEAD']));
 const before=await readFile(f.log,'utf8');await f.act('beginner-submit',{operationId:r.id});assert.equal(await readFile(f.log,'utf8'),before);
 await assert.rejects(f.act('beginner-submit',{paths:['art.png'],summary:'x'}),{code:'PREVIOUS_OPERATION_PENDING'});
});
test('safe update fetches a real local team version and fast-forwards',async t=>{
 const f=await fixture(t),team=join(f.root,'.git/team');execFileSync('git',['clone','-q','--branch','main',f.remote,team]);
 const teamGit=args=>execFileSync('git',['-C',team,...args],{encoding:'utf8'}).trim();teamGit(['config','user.name','Team']);teamGit(['config','user.email','team@example.test']);
 await writeFile(join(team,'team.png'),'team update');teamGit(['add','.']);teamGit(['commit','-qm','chore: team']);teamGit(['push','-q']);
 assert.equal((await f.act('beginner-update')).state,'updated');assert.equal(await readFile(join(f.root,'team.png'),'utf8'),'team update');
});
test('operation lock prevents parallel runtimes and invalid hooks stop before branch creation',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'.git/jixin-write.lock'));await assert.rejects(f.act('beginner-update'),{code:'OPERATION_LOCKED'});await rm(join(f.root,'.git/jixin-write.lock'),{recursive:true});
 await mkdir(join(f.root,'.githooks'));await writeFile(join(f.root,'art.png'),'art');await assert.rejects(f.act('beginner-submit',{paths:['art.png'],summary:'x'}),{code:'HOOKS_NOT_READY'});assert.equal(f.git(['branch','--show-current']),'main');
});
test('multiple team templates and missing review account stop before any local change',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'.github/PULL_REQUEST_TEMPLATE'),{recursive:true});await writeFile(join(f.root,'.github/PULL_REQUEST_TEMPLATE/a.md'),'A');await writeFile(join(f.root,'.github/PULL_REQUEST_TEMPLATE/b.md'),'B');
 f.git(['add','.github']);f.git(['commit','-qm','chore: templates']);f.git(['push','-q']);await writeFile(join(f.root,'art.png'),'art');
 await assert.rejects(f.act('beginner-submit',{paths:['art.png'],summary:'x'}),{code:'REVIEW_TEMPLATE_AMBIGUOUS'});assert.equal(f.git(['branch','--show-current']),'main');
 f.git(['rm','-r','.github']);f.git(['commit','-qm','chore: remove templates']);f.git(['push','-q']);
 await writeFile(join(f.root,'.git/bin/gh'),'#!/bin/sh\nexit 1\n');await assert.rejects(f.act('beginner-submit',{paths:['art.png'],summary:'x'}),{code:'REVIEW_ACCOUNT_REQUIRED'});assert.equal(f.git(['branch','--show-current']),'main');
});
test('diverged update stops without merge commit, reset or losing either side',async t=>{
 const f=await fixture(t),team=join(f.root,'.git/team');execFileSync('git',['clone','-q','--branch','main',f.remote,team]);
 const tg=args=>execFileSync('git',['-C',team,...args],{encoding:'utf8'}).trim();tg(['config','user.name','Team']);tg(['config','user.email','team@example.test']);
 await writeFile(join(team,'team.png'),'team');tg(['add','.']);tg(['commit','-qm','chore: team']);tg(['push','-q']);
 f.git(['switch','-c','feature/local']);await writeFile(join(f.root,'local.png'),'local');f.git(['add','.']);f.git(['commit','-qm','chore: local']);const before=f.git(['rev-parse','HEAD']);
 const r=await f.act('beginner-update');assert.equal(r.state,'needs-verification');assert.equal(f.git(['rev-parse','HEAD']),before);assert.equal(await readFile(join(f.root,'local.png'),'utf8'),'local');assert.equal(f.git(['rev-parse','origin/main']),tg(['rev-parse','HEAD']));
});
