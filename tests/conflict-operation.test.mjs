import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {gitRequest}=require('../plugin/node/git-service.cjs');
const {pendingGitOperation,assertNoPendingGit}=require('../plugin/node/beginner-git.cjs');

test('real merge distinguishes unmerged files, staged resolution and completed commit in both read APIs',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'jixin-merge-finish-')));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-q','-b','main']);git(['config','user.name','Merge Fixture']);git(['config','user.email','fixture@example.test']);
 await writeFile(join(root,'notes.md'),'base\n');git(['add','.']);git(['commit','-qm','base']);
 git(['checkout','-qb','other']);await writeFile(join(root,'notes.md'),'other\n');git(['commit','-qam','other']);
 git(['checkout','-q','main']);await writeFile(join(root,'notes.md'),'local\n');git(['commit','-qam','local']);
 assert.throws(()=>git(['merge','other']));
 for(const action of ['status','diagnosis-status']){const s=await gitRequest(root,{action});assert.equal(s.pendingGit,true);assert.equal(s.gitOperation.kind,'merge');assert.equal(s.gitOperation.unresolvedCount,1);assert.equal(s.gitOperation.awaitingMergeCommit,false);}
 await writeFile(join(root,'notes.md'),'local\nother\n');git(['add','notes.md']);
 const ctx={root,run:async args=>git(args)};
 for(const action of ['status','diagnosis-status']){const s=await gitRequest(root,{action});assert.equal(s.pendingGit,true);assert.deepEqual(s.gitOperation,{kind:'merge',unresolvedCount:0,awaitingMergeCommit:true});await assert.rejects(assertNoPendingGit(ctx,s),{code:'PROJECT_CONFLICT',message:/合并提交尚未完成/});}
 assert.notEqual(git(['rev-parse','--verify','MERGE_HEAD']),'');
 git(['commit','-qm','approved merge']);
 for(const action of ['status','diagnosis-status']){const s=await gitRequest(root,{action});assert.equal(s.pendingGit,false);assert.equal(s.gitOperation,null);await assertNoPendingGit(ctx,s);}
});

test('rebase enclosing state takes priority over cherry-pick and does not claim merge commit',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'jixin-rebase-state-')));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'rebase-merge'));await writeFile(join(root,'CHERRY_PICK_HEAD'),'id');
 const ctx={root,run:async args=>args.at(-1)};
 assert.deepEqual(await pendingGitOperation(ctx,{changes:[]}),{kind:'rebase',unresolvedCount:0,awaitingMergeCommit:false});
});
