import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,chmod,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
async function fixture(t) {
  const temp=await mkdtemp(join(tmpdir(),'jixin-git-'));t.after(()=>rm(temp,{recursive:true,force:true}));
  const root=await realpath(temp),git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  git(['init','-q','-b','main']);git(['config','user.name','Git Fixture']);git(['config','user.email','fixture@example.test']);
  await writeFile(join(root,'AGENTS.md'),'Read [contribution](CONTRIBUTING.md).');
  await writeFile(join(root,'CONTRIBUTING.md'),'Use Conventional Commits and DCO. Main requires a PR.');
  git(['add','.']);git(['commit','-qm','chore: initial']);
  const status=()=>gitRequest(root);
  const act=async(action,extra={})=>gitRequest(root,{action,token:(await status()).token,rulesConfirmed:true,...extra});
  return {root,git,status,act};
}
test('main hard gate, real feature branch, staging, signoff, local push and fast-forward sync',async t=>{
 const f=await fixture(t);const main=await f.status();assert.ok(main.sources.some(s=>s.path==='CONTRIBUTING.md'));
 await assert.rejects(f.act('commit',{message:'feat: blocked'}),{code:'PROTECTED_BRANCH'});
 await assert.rejects(f.act('push'),{code:'PROTECTED_BRANCH'});
 await f.act('branch-create',{branch:'feature/basic-git'});
 await writeFile(join(f.root,'a.txt'),'new\n');await f.act('stage',{paths:['a.txt']});
 await assert.rejects(f.act('commit',{message:'wrong title'}),{code:'COMMIT_FORMAT'});
 await f.act('commit',{message:'feat: basic git'});assert.match(f.git(['log','-1','--format=%B']),/Signed-off-by: Git Fixture/);
 assert.equal((await f.status()).changes.length,0);
 const remote=join(f.root,'.git','remote.git');execFileSync('git',['init','--bare','-q',remote]);f.git(['remote','add','origin',remote]);
 await f.act('push');assert.equal(f.git(['rev-parse','origin/feature/basic-git']),f.git(['rev-parse','HEAD']));
 await f.act('fetch');await f.act('pull');
});
test('one-shot review cannot replay and changes invalidate reviewed rules or staged content',async t=>{
 const f=await fixture(t);const first=await f.status();
 await gitRequest(f.root,{action:'branch-create',branch:'feature/ticket',token:first.token,rulesConfirmed:true});
 await assert.rejects(gitRequest(f.root,{action:'branch-create',branch:'feature/duplicate',token:first.token,rulesConfirmed:true}),{code:'STALE_REVIEW'});
 const review=await f.status();await writeFile(join(f.root,'CONTRIBUTING.md'),'Different project rules');
 await assert.rejects(gitRequest(f.root,{action:'stage',paths:['CONTRIBUTING.md'],token:review.token,rulesConfirmed:true}),{code:'STALE_REVIEW'});
 const unconfirmed=await f.status();await assert.rejects(gitRequest(f.root,{action:'stage',paths:['CONTRIBUTING.md'],token:unconfirmed.token}),{code:'RULE_REVIEW_REQUIRED'});
});
test('project hooks must be enabled; actual rejecting hook prevents commit with no bypass',async t=>{
 const f=await fixture(t);await f.act('branch-create',{branch:'feature/hooks'});
 await mkdir(join(f.root,'.githooks'));const hook=join(f.root,'.githooks/pre-commit');await writeFile(hook,'#!/bin/sh\necho PROJECT_RULE_REJECTED >&2\nexit 1\n');await chmod(hook,0o755);
 assert.equal((await f.status()).hooksReady,false);
 await assert.rejects(f.act('stage',{paths:['.githooks/pre-commit']}),{code:'HOOKS_NOT_READY'});
 f.git(['config','core.hooksPath','.githooks']);assert.equal((await f.status()).hooksReady,true);
 await f.act('stage',{paths:['.githooks/pre-commit']});const before=f.git(['rev-parse','HEAD']);
 await assert.rejects(f.act('commit',{message:'test: hook'}),e=>e.code==='GIT_OPERATION_FAILED' && e.message.includes('PROJECT_RULE_REJECTED'));
 assert.equal(f.git(['rev-parse','HEAD']),before);
});
test('literal path staging and unstaging preserves worktree; no arbitrary shell/actions',async t=>{
 const f=await fixture(t);await f.act('branch-create',{branch:'feature/paths'});
 const name=process.platform==='win32'?'[ab].txt':':(glob)*.txt';await writeFile(join(f.root,name),'literal');await writeFile(join(f.root,'other.txt'),'other');
 await f.act('stage',{paths:[name]});assert.equal(f.git(['diff','--cached','--name-only']),name);
 await f.act('unstage',{paths:[name]});assert.equal(f.git(['diff','--cached','--name-only']),'');
 await assert.rejects(f.act('stage',{paths:['../outside']}),{code:'INVALID_PATHS'});
 await assert.rejects(f.act('reset'),{code:'UNKNOWN_ACTION'});
});
test('worktree changes after review invalidate staging even if porcelain status is unchanged',async t=>{
 const f=await fixture(t);await f.act('branch-create',{branch:'feature/stale'});await writeFile(join(f.root,'untracked.txt'),'first');const s=await f.status();await writeFile(join(f.root,'untracked.txt'),'second content');
 await assert.rejects(gitRequest(f.root,{action:'stage',paths:['untracked.txt'],token:s.token,rulesConfirmed:true}),{code:'STALE_REVIEW'});
});
test('linked worktrees use their own branch and index; subdirectory roots are rejected',async t=>{
 const f=await fixture(t),worktree=await mkdtemp(join(tmpdir(),'jixin-worktree-'));t.after(()=>rm(worktree,{recursive:true,force:true}));
 f.git(['worktree','add','-q','-b','feature/worktree',worktree]);const s=await gitRequest(worktree);assert.equal(s.branch,'feature/worktree');
 await writeFile(join(worktree,'worktree.txt'),'isolated');await gitRequest(worktree,{action:'stage',paths:['worktree.txt'],token:(await gitRequest(worktree)).token,rulesConfirmed:true});
 assert.equal(f.git(['diff','--cached','--name-only']),'');
 await mkdir(join(f.root,'subdir'));await assert.rejects(gitRequest(join(f.root,'subdir')),{code:'NOT_PROJECT_ROOT'});
});
test('PR uses exact title/body arguments through gh without shell or a real external PR', {skip:process.platform==='win32'},async t=>{
 const f=await fixture(t);f.git(['remote','add','origin','https://github.com/team/current.git']);await f.act('branch-create',{branch:'feature/pr'});
 const bin=join(f.root,'.git','fixture-bin');await mkdir(bin);const gh=join(bin,'gh');
 await writeFile(gh,'#!/bin/sh\nprintf "%s\\n" "$@"\n');await chmod(gh,0o755);
 const old=process.env.PATH;process.env.PATH=bin+':'+old;
 try { const body='Checklist completed\nLiteral $(do-not-run) and backticks';const result=await f.act('pr',{title:'feat: fixture PR',body,base:'main'});assert.ok(result.output.includes(body));assert.match(result.output,/--repo\ngithub.com\/team\/current/);assert.match(result.output,/--base\nmain\n--head\nfeature\/pr/); }
 finally {process.env.PATH=old;}
});

test('complete 500KB rule graph stays usable; aggregate and file-count limits still block writes',async t=>{
 for(const [count,bytes,incomplete] of [[9,60000,false],[19,60000,true],[78,20,false],[81,20,true]]) {
  const f=await fixture(t);
  const links=[];
  for(let i=0;i<count;i++) {
   const name='rule-'+i+'.md'; links.push('[rule]('+name+')');
   await writeFile(join(f.root,name),'x'.repeat(bytes));
  }
  // Repeated links do not exhaust the unique-file budget.
  await writeFile(join(f.root,'AGENTS.md'),links.concat(links).join('\n'));
  const state=await f.status(); assert.equal(state.incomplete,incomplete);
  if(incomplete) await assert.rejects(f.act('branch-create',{branch:'feature/blocked-rules'}),{code:'RULE_DISCOVERY_INCOMPLETE'});
  else {assert.equal(state.sources.length,count+2); await f.act('branch-create',{branch:'feature/complete-rules'});}
 }
});

test('project-adjacent Windows git.exe is never selected as the Git runtime',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'jixin-runtime-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const root=join(await realpath(parent),'project');await mkdir(root);
 execFileSync('git',['-C',root,'init','-q','-b','main']);
 const f={root},decoy=join(parent,'git/bin');await mkdir(decoy,{recursive:true});
 await writeFile(join(decoy,'git.exe'),'untrusted project-adjacent executable');await chmod(join(decoy,'git.exe'),0o755);
 const script="Object.defineProperty(process,'platform',{value:'win32'});require(process.argv[1]).gitRequest(process.argv[2]).then(s=>process.stdout.write(s.root)).catch(()=>process.exit(1));";
 const output=execFileSync(process.execPath,['-e',script,createRequire(import.meta.url).resolve('../plugin/node/git-service.cjs'),f.root],{encoding:'utf8'});
 assert.equal(output,f.root);
});
