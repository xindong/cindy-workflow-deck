import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,chmod,rm,realpath,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
async function fixture(t){
 const temp=await mkdtemp(join(tmpdir(),'jixin-auto-setup-'));t.after(()=>rm(temp,{recursive:true,force:true}));const root=await realpath(temp);
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-q','-b','main']);git(['config','user.name','Setup Fixture']);git(['config','user.email','fixture@example.test']);
 await writeFile(join(root,'CONTRIBUTING.md'),'Project required setup:\ngit config core.hooksPath .githooks\nMain requires PR.');
 await mkdir(join(root,'.githooks'));await writeFile(join(root,'.githooks/pre-commit'),'#!/bin/sh\necho must-not-run > hook-ran\nexit 1\n');await chmod(join(root,'.githooks/pre-commit'),0o755);
 git(['add','.']);git(['update-index','--chmod=+x','.githooks/pre-commit']);git(['commit','-qm','chore: fixture']);
 const prepare=()=>gitRequest(root,{action:'prepare',confirmProjectSetup:true});return{root,git,prepare};
}
test('explicit preparation enables declared checks without running hooks or changing HEAD/index/files',async t=>{
 const f=await fixture(t);const before=f.git(['rev-parse','HEAD']);await writeFile(join(f.root,'art.txt'),'unsubmitted');const status=f.git(['status','--porcelain']);
 assert.equal((await gitRequest(f.root)).hooksReady,false);
 const result=await f.prepare();assert.equal(result.state,'ready');assert.equal(f.git(['config','--local','--get','core.hooksPath']),'.githooks');
 assert.equal((await gitRequest(f.root)).hooksReady,true);assert.equal(f.git(['rev-parse','HEAD']),before);assert.equal(f.git(['status','--porcelain']),status);
 await assert.rejects(readFile(join(f.root,'hook-ran')),{code:'ENOENT'});assert.equal((await f.prepare()).state,'ready');
 const s=await gitRequest(f.root);await gitRequest(f.root,{action:'branch-create',branch:'work/check',token:s.token,rulesConfirmed:true});
 let current=await gitRequest(f.root);await gitRequest(f.root,{action:'stage',paths:['art.txt'],token:current.token,rulesConfirmed:true});current=await gitRequest(f.root);
 await assert.rejects(gitRequest(f.root,{action:'commit',message:'art: changed',token:current.token,rulesConfirmed:true}),e=>e.code==='GIT_OPERATION_FAILED');
 assert.equal(f.git(['rev-parse','HEAD']),before);
});
test('status never configures project and prepare requires explicit setup intent',async t=>{
 const f=await fixture(t);await gitRequest(f.root);await assert.rejects(gitRequest(f.root,{action:'prepare'}),{code:'SETUP_NOT_CONFIRMED'});assert.throws(()=>f.git(['config','--local','--get','core.hooksPath']));
});
test('existing configured hooks and custom default hooks are preserved',async t=>{
 const f=await fixture(t);f.git(['config','core.hooksPath','custom-hooks']);assert.equal((await f.prepare()).blockers[0].code,'SETUP_EXISTING_HOOKS');assert.equal(f.git(['config','core.hooksPath']),'custom-hooks');
 f.git(['config','--unset','core.hooksPath']);await writeFile(join(f.root,'.git/hooks/pre-commit'),'#!/bin/sh\nexit 0\n');await chmod(join(f.root,'.git/hooks/pre-commit'),0o755);
 assert.equal((await f.prepare()).blockers[0].code,'SETUP_EXISTING_HOOKS');assert.throws(()=>f.git(['config','--local','--get','core.hooksPath']));
});
test('modified rules and hooks cannot authorize automatic setup',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'CONTRIBUTING.md'),'git config core.hooksPath .githooks\nlocally modified');assert.equal((await f.prepare()).blockers[0].code,'SETUP_UNCOMMITTED_RULE');
 f.git(['restore','CONTRIBUTING.md']);await writeFile(join(f.root,'.githooks/pre-commit'),'#!/bin/sh\nexit 0');assert.equal((await f.prepare()).blockers[0].code,'SETUP_MODIFIED_HOOK');
 assert.throws(()=>f.git(['config','--local','--get','core.hooksPath']));
});
test('no declared hook setup never leads to inferred configuration',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'CONTRIBUTING.md'),'Main requires PR.');f.git(['add','CONTRIBUTING.md']);f.git(['commit','-qm','docs: no setup']);assert.equal((await f.prepare()).blockers[0].code,'SETUP_RULE_REQUIRED');
});
test('linked worktree preparation does not change shared repository settings',async t=>{
 const f=await fixture(t),dir=join(f.root,'.git','linked');f.git(['worktree','add','-qb','work/art',dir]);
 const result=await gitRequest(dir,{action:'prepare',confirmProjectSetup:true});assert.equal(result.blockers[0].code,'SETUP_SHARED_WORKTREE');assert.throws(()=>f.git(['config','--local','--get','core.hooksPath']));
});
test('deleted tracked hooks stop preparation',async t=>{
 const f=await fixture(t);await unlink(join(f.root,'.githooks/pre-commit'));const result=await f.prepare();assert.equal(result.state,'needs-attention');assert.throws(()=>f.git(['config','--local','--get','core.hooksPath']));
});
test('native defaults need no new hooks and missing identity is never guessed',async t=>{
 const f=await fixture(t);await rm(join(f.root,'.githooks'),{recursive:true});f.git(['add','-u']);f.git(['commit','-qm','chore: use defaults']);assert.equal((await f.prepare()).state,'ready');assert.throws(()=>f.git(['config','--local','--get','core.hooksPath']));
 f.git(['config','user.name','']);const result=await f.prepare();assert.equal(result.blockers[0].code,'GIT_IDENTITY_REQUIRED');assert.equal(f.git(['config','user.name']),'');
});
test('CRLF working copy of committed rules is supported without editing the document',async t=>{
 const f=await fixture(t);const text=await readFile(join(f.root,'CONTRIBUTING.md'),'utf8');await writeFile(join(f.root,'CONTRIBUTING.md'),text.replace(/\n/g,'\r\n'));
 const result=await f.prepare();assert.equal(result.state,'ready');assert.equal(await readFile(join(f.root,'CONTRIBUTING.md'),'utf8'),text.replace(/\n/g,'\r\n'));
});
test('missing tracked checks are not reported as ready even when hook path is already set',async t=>{
 const f=await fixture(t);f.git(['config','core.hooksPath','.githooks']);await unlink(join(f.root,'.githooks/pre-commit'));assert.equal((await gitRequest(f.root)).hooksReady,false);
 assert.equal((await f.prepare()).blockers[0].code,'SETUP_MISSING_HOOK');assert.equal(f.git(['config','core.hooksPath']),'.githooks');
});
test('an untracked hook cannot be activated by automatic preparation',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'.githooks/pre-push'),'#!/bin/sh\nexit 0\n');await chmod(join(f.root,'.githooks/pre-push'),0o755);
 assert.equal((await f.prepare()).blockers[0].code,'SETUP_UNTRACKED_HOOK');assert.throws(()=>f.git(['config','core.hooksPath']));
});

test('less common default Git hooks are never disabled by automatic preparation',async t=>{
 for(const name of ['post-index-change','reference-transaction','pre-rebase','post-rewrite']){
  const f=await fixture(t);const file=join(f.root,'.git/hooks',name);
  await writeFile(file,'#!/bin/sh\nexit 0\n');await chmod(file,0o755);
  const before=f.git(['rev-parse','HEAD']);const result=await f.prepare();
  assert.equal(result.blockers[0].code,'SETUP_EXISTING_HOOKS');
  assert.throws(()=>f.git(['config','--local','--get','core.hooksPath']));assert.equal(f.git(['rev-parse','HEAD']),before);
 }
});
