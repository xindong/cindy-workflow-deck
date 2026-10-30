import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
async function fixture(t) {
  const temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-stashes-')));t.after(()=>rm(temp,{recursive:true,force:true}));
  const root=join(temp,'project');await mkdir(root);
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['init','-q','-b','main']);git(['config','user.name','Stash Fixture']);git(['config','user.email','fixture@example.test']);
  for(const name of ['notes.md','deleted.txt','[literal].txt'])await writeFile(join(root,name),'base\n');
  git(['add','.']);git(['commit','-qm','initial']);
  const request=(action,extra={})=>gitRequest(root,{action,...extra});
  return {root,temp,git,request};
}
async function saved(f) {
  await writeFile(join(f.root,'notes.md'),'staged\n');f.git(['add','notes.md']);await writeFile(join(f.root,'notes.md'),'saved working\n');
  await rm(join(f.root,'deleted.txt'));await writeFile(join(f.root,'新增 文件.md'),'untracked saved\n');
  await writeFile(join(f.root,'[literal].txt'),'literal saved\n');
  f.git(['stash','push','-qu','-m','first saved changes']);return f.git(['rev-parse','refs/stash']);
}
test('stash listing/files/local diff preserve index, worktree and refs, including staged, deleted and untracked paths',async t=>{
  const f=await fixture(t);assert.deepEqual((await f.request('stash-list')).entries,[]);
  const id=await saved(f),entries=(await f.request('stash-list')).entries;
  assert.equal(entries[0].id,id);assert.equal(entries[0].ref,'stash@{0}');assert.match(entries[0].subject,/first saved changes/);
  const rows=(await f.request('stash-files',{stashId:id})).files;
  assert.deepEqual(rows.find(x=>x.path==='notes.md').areas,['working','staged']);
  assert.deepEqual(rows.find(x=>x.path==='新增 文件.md').areas,['untracked']);assert.equal(rows.find(x=>x.path==='deleted.txt').status,'D');
  await writeFile(join(f.root,'notes.md'),'local current\n');f.git(['add','notes.md']);await writeFile(join(f.root,'notes.md'),'local after staged\n');
  const before={status:f.git(['status','--porcelain=v1']),index:f.git(['write-tree']),stash:f.git(['rev-parse','refs/stash']),head:f.git(['rev-parse','HEAD'])};
  const diff=await f.request('stash-diff',{stashId:id,path:'notes.md',target:'local'});
  assert.match(diff.output,/-saved working/);assert.match(diff.output,/\+local after staged/);assert.equal(diff.saved.exists,true);assert.equal(diff.commit,'');
  const deleted=await f.request('stash-diff',{stashId:id,path:'deleted.txt',target:'local'});assert.equal(deleted.saved.exists,false);assert.equal(deleted.other.exists,true);assert.match(deleted.output,/\+base/);
  const untracked=await f.request('stash-diff',{stashId:id,path:'新增 文件.md',target:'local'});assert.equal(untracked.other.exists,false);assert.match(untracked.output,/-untracked saved/);
  assert.match((await f.request('stash-diff',{stashId:id,path:'[literal].txt',target:'local'})).output,/-literal saved/);
  assert.deepEqual({status:f.git(['status','--porcelain=v1']),index:f.git(['write-tree']),stash:f.git(['rev-parse','refs/stash']),head:f.git(['rev-parse','HEAD'])},before);
  assert.equal(await readFile(join(f.root,'notes.md'),'utf8'),'local after staged\n');
});
test('stable stash IDs survive numbering changes; removed stashes and arbitrary refs/paths are rejected',async t=>{
  const f=await fixture(t),id=await saved(f);await writeFile(join(f.root,'notes.md'),'second\n');f.git(['stash','push','-qm','second']);
  const rows=(await f.request('stash-list')).entries;assert.equal(rows[1].id,id);assert.equal((await f.request('stash-files',{stashId:id})).entry.ref,'stash@{1}');
  await assert.rejects(f.request('stash-files',{stashId:'HEAD'}),{code:'INVALID_STASH'});
  await assert.rejects(f.request('stash-files',{stashId:f.git(['rev-parse','HEAD'])}),{code:'STASH_CHANGED'});
  await assert.rejects(f.request('stash-diff',{stashId:id,path:'../outside',target:'local'}),{code:'INVALID_PATHS'});
  await assert.rejects(f.request('stash-diff',{stashId:id,path:'absent.md',target:'local'}),{code:'STASH_CHANGED'});
  await assert.rejects(f.request('stash-diff',{stashId:id,path:'notes.md',target:'cached'}),{code:'INVALID_TARGET'});
  f.git(['stash','drop','-q','stash@{1}']);await assert.rejects(f.request('stash-files',{stashId:id}),{code:'STASH_CHANGED'});
});
test('remote comparison fetches latest upstream and never falls back to stale cache on failure',async t=>{
  const f=await fixture(t),remote=join(f.temp,'origin.git');execFileSync('git',['init','--bare','-q',remote]);f.git(['remote','add','origin',remote]);f.git(['push','-qu','origin','main']);
  const id=await saved(f),team=join(f.temp,'team');execFileSync('git',['clone','-q','-b','main',remote,team]);
  const teamGit=args=>execFileSync('git',['-C',team,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  teamGit(['config','user.name','Team']);teamGit(['config','user.email','team@example.test']);await writeFile(join(team,'notes.md'),'latest from server\n');teamGit(['add','.']);teamGit(['commit','-qm','server advance']);teamGit(['push','-q']);
  const cached=f.git(['rev-parse','origin/main']),head=f.git(['rev-parse','HEAD']),index=f.git(['write-tree']);
  const result=await f.request('stash-diff',{stashId:id,path:'notes.md',target:'remote'});assert.equal(result.target,'origin/main');assert.notEqual(result.commit,cached);assert.equal(result.commit,teamGit(['rev-parse','HEAD']));assert.match(result.output,/\+latest from server/);
  assert.equal(f.git(['rev-parse','HEAD']),head);assert.equal(f.git(['write-tree']),index);assert.equal(f.git(['rev-parse','refs/stash']),id);assert.equal(f.git(['status','--porcelain']),'');
  f.git(['remote','set-url','origin',join(f.temp,'missing.git')]);await assert.rejects(f.request('stash-diff',{stashId:id,path:'notes.md',target:'remote'}),{code:'STASH_REMOTE_FAILED'});
});
test('binary, LFS, oversized and empty-file deletion comparisons report truthful summaries',async t=>{
  const f=await fixture(t);await writeFile(join(f.root,'binary.bin'),Buffer.from([1,0,2]));await writeFile(join(f.root,'large.txt'),'x'.repeat(1024*1024+1));await writeFile(join(f.root,'empty.txt'),'');
  await writeFile(join(f.root,'asset.lfs'),'version https://git-lfs.github.com/spec/v1\noid sha256:'+'a'.repeat(64)+'\nsize 9000000\n');f.git(['stash','push','-qu','-m','summaries']);const id=f.git(['rev-parse','refs/stash']);
  for(const name of ['binary.bin','large.txt','asset.lfs'])assert.equal((await f.request('stash-diff',{stashId:id,path:name,target:'local'})).summaryOnly,true,name);
  const empty=await f.request('stash-diff',{stashId:id,path:'empty.txt',target:'local'});assert.equal(empty.saved.exists,true);assert.equal(empty.other.exists,false);assert.match(empty.output,/空文件/);
});
test('online target uses server same-name branch or server default when there is no upstream',async t=>{
  const f=await fixture(t),remote=join(f.temp,'origin.git');execFileSync('git',['init','--bare','-q',remote]);f.git(['remote','add','origin',remote]);f.git(['push','-q','origin','main']);execFileSync('git',['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/main']);
  const id=await saved(f);f.git(['switch','-qc','art/current']);f.git(['push','-q','origin','art/current']);
  assert.equal((await f.request('stash-diff',{stashId:id,path:'notes.md',target:'remote'})).target,'origin/art/current');
  f.git(['switch','-qc','art/local-only']);assert.equal((await f.request('stash-diff',{stashId:id,path:'notes.md',target:'remote'})).target,'origin/main');
  f.git(['switch','-q','--detach']);assert.equal((await f.request('stash-diff',{stashId:id,path:'notes.md',target:'remote'})).target,'origin/main');
});
test('read-only stash inspection works during repair reservation, and local comparison never fetches',async t=>{
  const f=await fixture(t),id=await saved(f);await f.request('conflict-reserve',{operationId:'stash-readonly-reservation'});
  await mkdir(join(f.root,'.git','jixin-write.lock'));assert.equal((await f.request('stash-list')).entries[0].id,id);
  assert.equal((await f.request('stash-files',{stashId:id})).entry.id,id);assert.match((await f.request('stash-diff',{stashId:id,path:'notes.md',target:'local'})).output,/-saved working/);
  await assert.rejects(f.request('stash-diff',{stashId:id,path:'notes.md',target:'remote'}),{code:'OPERATION_LOCKED'});
});
test('stash local diff refuses symlinked paths', {skip:process.platform==='win32'},async t=>{
  const f=await fixture(t),id=await saved(f);await rm(join(f.root,'notes.md'));await writeFile(join(f.temp,'outside'),'outside secret');await symlink(join(f.temp,'outside'),join(f.root,'notes.md'));
  await assert.rejects(f.request('stash-diff',{stashId:id,path:'notes.md',target:'local'}),{code:'UNSUPPORTED_FILE'});
});
