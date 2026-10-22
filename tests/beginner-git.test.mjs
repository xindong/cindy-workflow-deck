import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
const {preflight}=createRequire(import.meta.url)('../plugin/node/safe-update.cjs');
async function fixture(t,template=false) {
 const temp=await mkdtemp(join(tmpdir(),'jixin-beginner-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const root=join(await realpath(temp),'project'),remote=join(temp,'origin.git');await mkdir(root);
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 git(['init','-q','-b','main']);git(['config','user.name','Art Fixture']);git(['config','user.email','art@example.test']);
 await writeFile(join(root,'AGENTS.md'),'Use Conventional Commits. DCO required. Never commit directly to main. Use a PR.');
 if(template){await mkdir(join(root,'.github'));await writeFile(join(root,'.github/PULL_REQUEST_TEMPLATE.md'),'## Team verification\n- [ ] Art lead approved\n');}
 git(['add','.']);git(['commit','-qm','chore: initial']);const main=git(['rev-parse','HEAD']);
 execFileSync('git',['init','-q','--bare',remote]);git(['remote','add','origin',remote]);git(['push','-qu','origin','main']);git(['config','url.'+remote+'.insteadOf','https://github.com/fixture/project.git']);git(['remote','set-url','origin','https://github.com/fixture/project.git']);git(['symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/main']);
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
 assert.equal(await readFile(join(f.root,'someone-else.txt'),'utf8'),'keep');const args=JSON.parse(await readFile(f.log,'utf8'));assert.equal(args[args.indexOf('--base')+1],'main');assert.equal(args.includes('--draft'),false);assert.equal(args[args.indexOf('--repo')+1],'github.com/fixture/project');
 const head=f.git(['rev-parse','HEAD']);assert.equal((await f.act('beginner-submit',{operationId})).id,operationId);assert.equal(f.git(['rev-parse','HEAD']),head);
 assert.equal((await f.status()).beginnerReceipt.state,'awaiting-review');
});
test('template creates draft, preserves unchecked requirements, never claims approval',async t=>{
 const f=await fixture(t,true);await writeFile(join(f.root,'art.png'),'art');const r=await f.act('beginner-submit',{paths:['art.png'],summary:'调整材质'});
 assert.equal(r.state,'review-draft');const a=JSON.parse(await readFile(f.log,'utf8'));assert.ok(a.includes('--draft'));assert.match(a[a.indexOf('--body')+1],/- \[ \] Art lead approved/);
});
test('selection, existing index and unrelated commits block without losing work',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'art.png'),'art');
 await assert.rejects(f.act('beginner-submit',{paths:[],summary:'x'}),{code:'SELECT_FILES'});
 assert.equal((await f.act('beginner-update')).state,'updated');
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
 const r=await f.act('beginner-update');assert.equal(r.state,'blocked');assert.equal(f.git(['rev-parse','HEAD']),before);assert.equal(await readFile(join(f.root,'local.png'),'utf8'),'local');assert.equal(f.git(['rev-parse','origin/main']),tg(['rev-parse','HEAD']));
});

async function teamChange(f,files) {
 const team=join(f.root,'.git/team');execFileSync('git',['clone','-q','--branch','main',f.remote,team]);
 const tg=args=>execFileSync('git',['-C',team,...args],{encoding:'utf8'}).trim();tg(['config','user.name','Team']);tg(['config','user.email','team@example.test']);
 for(const [file,value] of Object.entries(files))await writeFile(join(team,file),value);
 tg(['add','.']);tg(['commit','-qm','chore: team change']);tg(['push','-q']);return tg(['rev-parse','HEAD']);
}
test('dirty update rehearses first, restores staged/unstaged and untracked bytes, retains exact backup and replay does nothing',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'asset.txt'),'base');f.git(['add','.']);f.git(['commit','-qm','chore: asset']);f.git(['push','-q']);
 const target=await teamChange(f,{'team.txt':'remote'});
 await writeFile(join(f.root,'asset.txt'),'staged');f.git(['add','asset.txt']);await writeFile(join(f.root,'asset.txt'),'unstaged');await writeFile(join(f.root,'new.bin'),Buffer.from([0,255,42]));
 const before=f.git(['status','--porcelain']),cached=f.git(['diff','--cached','--binary']),unstaged=f.git(['diff','--binary']);
 const r=await f.act('beginner-update');assert.equal(r.state,'updated',JSON.stringify(r));assert.equal(f.git(['rev-parse','HEAD']),target);
 assert.equal(f.git(['status','--porcelain']),before);assert.equal(f.git(['diff','--cached','--binary']),cached);assert.equal(f.git(['diff','--binary']),unstaged);assert.deepEqual(await readFile(join(f.root,'new.bin')),Buffer.from([0,255,42]));
 assert.deepEqual(r.completed,['fetch','preflight','stash','merge','restore']);assert.equal(f.git(['rev-parse','refs/stash']),r.stash);
 const stash=f.git(['stash','list']);await f.act('beginner-update',{operationId:r.id});assert.equal(f.git(['stash','list']),stash);
});
test('tracked conflict detected before stashing leaves HEAD, file, index and existing stash unchanged',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'asset.txt'),'base\n');f.git(['add','.']);f.git(['commit','-qm','chore: asset']);f.git(['push','-q']);
 await writeFile(join(f.root,'other.txt'),'older stash');f.git(['stash','push','-u','-m','prior']);const stash=f.git(['rev-parse','refs/stash']);
 await teamChange(f,{'asset.txt':'team\n'});await writeFile(join(f.root,'asset.txt'),'local\n');
 const head=f.git(['rev-parse','HEAD']),status=f.git(['status','--porcelain']);const r=await f.act('beginner-update');assert.equal(r.state,'blocked');assert.equal(r.step,'preflight');assert.match(r.message,/本地修改和暂存状态保持原样/);
 assert.equal(f.git(['rev-parse','HEAD']),head);assert.equal(f.git(['status','--porcelain']),status);assert.equal(f.git(['rev-parse','refs/stash']),stash);assert.equal(await readFile(join(f.root,'asset.txt'),'utf8'),'local\n');
});
test('untracked collision is rejected before real stash or merge',async t=>{
 const f=await fixture(t);await teamChange(f,{'same.txt':'remote'});await writeFile(join(f.root,'same.txt'),'local');const r=await f.act('beginner-update');assert.equal(r.state,'blocked');assert.equal(r.step,'preflight');assert.equal(f.git(['rev-parse','HEAD']),f.main);assert.equal(await readFile(join(f.root,'same.txt'),'utf8'),'local');assert.equal(f.git(['stash','list']),'');
});
test('non-overlapping edits in one tracked file merge and restore without blocking on filename overlap',async t=>{
 const f=await fixture(t);const lines=Array.from({length:30},(_,i)=>'line '+i);await writeFile(join(f.root,'asset.txt'),lines.join('\n'));f.git(['add','.']);f.git(['commit','-qm','chore: asset']);f.git(['push','-q']);
 const team=[...lines];team[1]='team';await teamChange(f,{'asset.txt':team.join('\n')});const local=[...lines];local[28]='local';await writeFile(join(f.root,'asset.txt'),local.join('\n'));
 const r=await f.act('beginner-update');assert.equal(r.state,'updated',JSON.stringify(r));const actual=(await readFile(join(f.root,'asset.txt'),'utf8')).split('\n');assert.equal(actual[1],'team');assert.equal(actual[28],'local');
});

test('restore failure caused by post-merge hook keeps backup and blocks replay',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'asset.txt'),'base');f.git(['add','.']);f.git(['commit','-qm','chore: asset']);f.git(['push','-q']);await teamChange(f,{'team.txt':'remote'});
 await writeFile(join(f.root,'asset.txt'),'local');await writeFile(join(f.root,'.git/hooks/post-merge'),'#!/bin/sh\nprintf hook > asset.txt\n');await chmod(join(f.root,'.git/hooks/post-merge'),0o755);
 const r=await f.act('beginner-update');assert.equal(r.state,'needs-verification');assert.equal(r.step,'restore');assert.ok(r.stash);assert.equal(f.git(['show',r.stash+':asset.txt']),'local');assert.equal(await readFile(join(f.root,'asset.txt'),'utf8'),'hook');await assert.rejects(f.act('beginner-update'),{code:'PREVIOUS_OPERATION_PENDING'});
});

test('ignored local files are protected even when ordinary Git status is clean',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'.gitignore'),'local.cache\n');f.git(['add','.gitignore']);f.git(['commit','-qm','chore: ignore']);f.git(['push','-q']);
 const team=join(f.root,'.git/team');execFileSync('git',['clone','-q','--branch','main',f.remote,team]);const tg=a=>execFileSync('git',['-C',team,...a]);tg(['config','user.name','Team']);tg(['config','user.email','team@example.test']);await writeFile(join(team,'local.cache'),'remote');tg(['add','-f','local.cache']);tg(['commit','-qm','chore: cache']);tg(['push','-q']);
 await writeFile(join(f.root,'local.cache'),'precious local');assert.equal(f.git(['status','--porcelain']),'');const head=f.git(['rev-parse','HEAD']);const r=await f.act('beginner-update');assert.equal(r.state,'blocked');assert.equal(r.step,'preflight');assert.equal(f.git(['rev-parse','HEAD']),head);assert.equal(await readFile(join(f.root,'local.cache'),'utf8'),'precious local');
});

test('LFS rehearsal skips downloads only in the disposable worktree',async t=>{
 const f=await fixture(t);
 // A unique fixture driver cannot inherit the CI runner's real LFS process/required settings.
 f.git(['config','filter.jixin-test-lfs.clean','cat']);f.git(['config','filter.jixin-test-lfs.smudge','cat']);f.git(['config','filter.jixin-test-lfs.required','true']);
 await writeFile(join(f.root,'.gitattributes'),'*.asset filter=jixin-test-lfs');await writeFile(join(f.root,'hero.asset'),'pointer-only');
 f.git(['add','.']);f.git(['commit','-qm','add asset']);await writeFile(join(f.root,'AGENTS.md'),'local pending edit');
 const state=await f.status();const before=f.git(['status','--porcelain']);
 const env={...process.env,GIT_CONFIG_COUNT:'3',GIT_CONFIG_KEY_0:'filter.jixin-test-lfs.smudge',GIT_CONFIG_VALUE_0:'sh -c '+String.fromCharCode(39)+'test "$GIT_LFS_SKIP_SMUDGE" = 1 || exit 63; cat'+String.fromCharCode(39),GIT_CONFIG_KEY_1:'filter.jixin-test-lfs.required',GIT_CONFIG_VALUE_1:'true',GIT_CONFIG_KEY_2:'filter.jixin-test-lfs.clean',GIT_CONFIG_VALUE_2:'cat'};
 await preflight({root:f.root,run:async args=>f.git(args)},state,state.head,env);
 assert.equal(f.git(['status','--porcelain']),before);assert.equal(env.GIT_LFS_SKIP_SMUDGE,process.env.GIT_LFS_SKIP_SMUDGE);
});

test('large ignored filename lists stay bounded and collisions preserve directory prefixes',async()=>{
 const names=Array.from({length:20000},(_,i)=>'Cache/'+i+'x'.repeat(130));
 const ignored=names.join(String.fromCharCode(0))+String.fromCharCode(0);
 assert.ok(Buffer.byteLength(ignored)>2*1024*1024);
 for(const [incoming,local] of [['Assets/file','Assets'],['Assets','Assets/local'],['Assets/file','Assets/file']]){
  const run=async(args,options)=>{
   if(args[0]==='merge-base')return '';
   assert.equal(options.filenameList,true);
   return args[0]==='ls-tree'?incoming+String.fromCharCode(0):ignored+local+String.fromCharCode(0);
  };
  await assert.rejects(preflight({run},{head:'old',changes:[]},'new',{}),{code:'UPDATE_CONFLICT'});
 }
 await preflight({run:async(args,options)=>{if(args[0]==='merge-base')return '';assert.equal(options.filenameList,true);return args[0]==='ls-tree'?'Team/file'+String.fromCharCode(0):ignored;}},{head:'old',changes:[]},'new',{});
});

test('settled fetch failure can be retried after configuration repair without acknowledging or replaying',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'local.png'),'keep');
 f.git(['remote','set-url','origin',join(f.root,'.git/nonexistent.git')]);
 const first=await f.act('beginner-update');assert.equal(first.state,'blocked');assert.equal(first.step,'fetch');
 assert.equal((await f.status()).beginnerReceipt.retryable,true);
 assert.equal(await readFile(join(f.root,'local.png'),'utf8'),'keep');
 f.git(['remote','set-url','origin',f.remote]);
 const second=await f.act('beginner-update');assert.equal(second.state,'updated');assert.notEqual(second.id,first.id);
 assert.equal(await readFile(join(f.root,'local.png'),'utf8'),'keep');assert.equal(f.git(['stash','list']),'');
});
test('running, uncertain, submission and post-mutation receipts never become retryable',()=>{
 const {retryableFailure}=createRequire(import.meta.url)('../plugin/node/beginner-git.cjs');
 const safe={action:'beginner-update',state:'blocked',step:'preflight',completed:['fetch']};assert.equal(retryableFailure(safe),true);
 for(const patch of [{state:'running'},{state:'needs-verification'},{action:'beginner-submit'},{step:'merge'},{step:'stash'},{step:'restore'},{stash:'backup'},{completed:['fetch','stash']}])assert.equal(retryableFailure({...safe,...patch}),false);
});

test('submodule pointer changes block before local stash or fast-forward',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'local.txt'),'keep');
 const head=f.git(['rev-parse','HEAD']),status=f.git(['status','--porcelain']);
 f.git(['switch','-qc','team-submodule']);
 f.git(['update-index','--add','--cacheinfo','160000,'+head+',vendor']);
 f.git(['commit','-qm','chore: add submodule']);f.git(['push','-q','origin','HEAD:main']);
 f.git(['switch','-q','main']);
 const result=await f.act('beginner-update');
 assert.equal(result.state,'blocked');assert.equal(result.step,'preflight');assert.match(result.message,/子模块/);
 assert.equal(f.git(['rev-parse','HEAD']),head);assert.equal(f.git(['status','--porcelain']),status);assert.equal(f.git(['stash','list']),'');
});

test('changed initialized submodule stays at its original revision and update reports blocked',async t=>{
 const f=await fixture(t),source=join(f.root,'.git/vendor-source');await mkdir(source);
 const vendor=args=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
 vendor(['init','-qb','main']);vendor(['config','user.name','Fixture']);vendor(['config','user.email','fixture@example.test']);
 await writeFile(join(source,'asset'),'old');vendor(['add','.']);vendor(['commit','-qm','old']);const old=vendor(['rev-parse','HEAD']);
 await writeFile(join(source,'asset'),'new');vendor(['commit','-qam','new']);const next=vendor(['rev-parse','HEAD']);
 f.git(['-c','protocol.file.allow=always','submodule','add','-q',source,'vendor']);
 execFileSync('git',['-C',join(f.root,'vendor'),'checkout','-q',old]);
 f.git(['add','.gitmodules','vendor']);f.git(['commit','-qm','chore: vendor baseline']);f.git(['push','-q','origin','main']);
 const head=f.git(['rev-parse','HEAD']);f.git(['switch','-qc','team-vendor-update']);
 f.git(['update-index','--cacheinfo','160000,'+next+',vendor']);f.git(['commit','-qm','chore: update vendor']);f.git(['push','-q','origin','HEAD:main']);f.git(['switch','-q','main']);
 const result=await f.act('beginner-update');assert.equal(result.state,'blocked');assert.equal(result.step,'preflight');assert.match(result.message,/子模块/);
 assert.equal(f.git(['rev-parse','HEAD']),head);assert.equal(f.git(['status','--porcelain']),'');
 assert.equal(execFileSync('git',['-C',join(f.root,'vendor'),'rev-parse','HEAD'],{encoding:'utf8'}).trim(),old);
 assert.equal(await readFile(join(f.root,'vendor/asset'),'utf8'),'old');
});

test('progress reads stay responsive during a real merge, scoped to operation and without write side effects',async t=>{
 const f=await fixture(t);const target=await teamChange(f,{'team.txt':'new'});
 const hook=join(f.root,'.git/hooks/post-merge');await writeFile(hook,'#!/bin/sh\nsleep 2\n');await chmod(hook,0o755);
 const operationId=randomUUID();let settled=false;
 const updating=f.act('beginner-update',{operationId}).then(r=>{settled=true;return r;});
 let progress;
 for(let i=0;i<40;i++) {
  await new Promise(r=>setTimeout(r,50));
  progress=await gitRequest(f.root,{action:'operation-progress',operationId});
  if(progress?.step==='merge')break;
 }
 assert.equal(progress?.step,'merge');assert.equal(settled,false,'read must not wait behind the update queue');
 assert.deepEqual(progress.completed,['fetch','preflight']);
 const journal=await readFile(join(f.root,'.git/jixin-beginner.json'),'utf8');
 assert.equal(await gitRequest(f.root,{action:'operation-progress',operationId:randomUUID()}),null);
 assert.equal(await readFile(join(f.root,'.git/jixin-beginner.json'),'utf8'),journal);
 assert.equal(progress.token,undefined);assert.equal(progress.detail,undefined);
 const result=await updating;assert.equal(result.state,'updated');assert.equal(f.git(['rev-parse','HEAD']),target);
 assert.equal((await gitRequest(f.root,{action:'operation-progress',operationId})).state,'updated');
 await assert.rejects(gitRequest(f.root,{action:'operation-progress',operationId:'bad'}),{code:'INVALID_REQUEST'});
});

test('update follows the current art upstream instead of main and restores dirty files',async t=>{
 const f=await fixture(t);f.git(['switch','-c','art/character']);await writeFile(join(f.root,'art.txt'),'branch\n');f.git(['add','art.txt']);f.git(['commit','-qm','chore: art base']);f.git(['push','-qu','origin','art/character']);
 const team=join(f.root,'.git/art-team');execFileSync('git',['clone','-q','--branch','art/character',f.remote,team]);const tg=args=>execFileSync('git',['-C',team,...args],{encoding:'utf8'}).trim();tg(['config','user.name','Team']);tg(['config','user.email','team@example.test']);await writeFile(join(team,'new-team.txt'),'team\n');tg(['add','.']);tg(['commit','-qm','chore: art update']);tg(['push','-q']);
 await writeFile(join(f.root,'art.txt'),'local art\n');const r=await f.act('beginner-update');assert.equal(r.state,'updated');assert.equal(r.base,'art/character');assert.equal(f.git(['branch','--show-current']),'art/character');assert.equal(f.git(['rev-parse','HEAD']),tg(['rev-parse','HEAD']));assert.equal(f.git(['rev-parse','main']),f.main);assert.equal(await readFile(join(f.root,'art.txt'),'utf8'),'local art\n');
});
test('local commits ahead of the selected upstream are not treated as divergence or reset',async t=>{
 const f=await fixture(t);f.git(['switch','-c','art/local']);f.git(['push','-qu','origin','art/local']);await writeFile(join(f.root,'saved.txt'),'saved');f.git(['add','.']);f.git(['commit','-qm','chore: local']);const head=f.git(['rev-parse','HEAD']);await writeFile(join(f.root,'dirty.txt'),'keep');
 const r=await f.act('beginner-update');assert.equal(r.state,'updated');assert.equal(r.base,'art/local');assert.match(r.message,/尚未进入线上分支/);assert.equal(f.git(['rev-parse','HEAD']),head);assert.equal(await readFile(join(f.root,'dirty.txt'),'utf8'),'keep');assert.equal(r.stash,undefined);
});
test('a genuinely diverged art upstream still stops without stashing or overwriting',async t=>{
 const f=await fixture(t);f.git(['switch','-c','art/diverged']);f.git(['push','-qu','origin','art/diverged']);
 const team=join(f.root,'.git/diverged-team');execFileSync('git',['clone','-q','--branch','art/diverged',f.remote,team]);const tg=args=>execFileSync('git',['-C',team,...args],{encoding:'utf8'}).trim();tg(['config','user.name','Team']);tg(['config','user.email','team@example.test']);await writeFile(join(team,'remote.txt'),'remote');tg(['add','.']);tg(['commit','-qm','chore: remote']);tg(['push','-q']);
 await writeFile(join(f.root,'local.txt'),'local');f.git(['add','.']);f.git(['commit','-qm','chore: local']);const head=f.git(['rev-parse','HEAD']);const r=await f.act('beginner-update');assert.equal(r.base,'art/diverged');assert.equal(r.state,'blocked');assert.equal(r.retryable,undefined);assert.match(r.message,/分叉/);assert.equal(r.stash,undefined);assert.equal(f.git(['rev-parse','HEAD']),head);
});
