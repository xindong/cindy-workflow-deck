import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),{gitRequest}=require('../plugin/node/git-service.cjs'),execute=promisify(execFile);
async function fixture(t) {
  const temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-stash-restore-test-')));t.after(()=>rm(temp,{recursive:true,force:true}));
  const root=join(temp,'project');await mkdir(root);
  const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['init','-q','-b','main']);git(['config','core.autocrlf','false']);git(['config','user.name','Restore Fixture']);git(['config','user.email','fixture@example.test']);
  await writeFile(join(root,'notes.md'),'base\n');await writeFile(join(root,'other.txt'),'other base\n');git(['add','.']);git(['commit','-qm','initial']);
  await writeFile(join(root,'notes.md'),'staged saved\n');git(['add','notes.md']);await writeFile(join(root,'notes.md'),'working saved\n');await writeFile(join(root,'new.txt'),'saved new\n');git(['stash','push','-qu','-m','restore me']);const stashId=git(['rev-parse','refs/stash']);
  const status=()=>gitRequest(root),preview=()=>gitRequest(root,{action:'stash-restore-preview',stashId});
  const apply=async(p,extra={})=>gitRequest(root,{action:'stash-restore',stashId,confirmStashId:stashId,previewFingerprint:p.fingerprint,operationId:randomUUID(),token:(await status()).token,rulesConfirmed:true,...extra});
  return {root,temp,git,stashId,status,preview,apply};
}
test('preflight leaves files/index/stash unchanged; restore preserves unrelated work, staged state and original stash with durable backups',async t=>{
  const f=await fixture(t);await writeFile(join(f.root,'other.txt'),'other current\n');
  const before={status:f.git(['status','--porcelain']),index:f.git(['write-tree']),stash:f.git(['stash','list','--format=%H']),head:f.git(['rev-parse','HEAD'])};
  const preview=await f.preview();assert.equal(preview.files.length,2);
  assert.deepEqual({status:f.git(['status','--porcelain']),index:f.git(['write-tree']),stash:f.git(['stash','list','--format=%H']),head:f.git(['rev-parse','HEAD'])},before);
  const record=await f.apply(preview);assert.equal(record.state,'restored',JSON.stringify(record));
  assert.equal(await readFile(join(f.root,'notes.md'),'utf8'),'working saved\n');assert.equal(f.git(['show',':notes.md']),'staged saved');assert.equal(await readFile(join(f.root,'new.txt'),'utf8'),'saved new\n');
  assert.equal(await readFile(join(f.root,'other.txt'),'utf8'),'other current\n');assert.equal(f.git(['show',':other.txt']),'other base');assert.equal(f.git(['stash','list','--format=%H']),before.stash);assert.equal(f.git(['rev-parse','HEAD']),before.head);
  const backup=JSON.parse(await readFile(join(record.backup,'before.json'),'utf8')),saved=backup.files.find(f=>f.path==='notes.md');assert.equal(saved.exists,true);assert.equal(await readFile(join(record.backup,saved.backupFile),'utf8'),'base\n');await access(join(record.backup,'index'));assert.match(await readFile(join(record.backup,'worktree.patch'),'utf8'),/other current/);
  const replay=await f.apply(preview,{operationId:record.id});assert.equal(replay.id,record.id);assert.equal(replay.state,'restored');assert.equal(await readFile(join(f.root,'notes.md'),'utf8'),'working saved\n');
  await assert.rejects(f.preview(),{code:'STASH_ALREADY_RESTORED'});
});
test('conflicting tracked changes and untracked collisions stop preflight without modifying originals or creating a restore journal',async t=>{
  const f=await fixture(t);await writeFile(join(f.root,'notes.md'),'local conflicting\n');const before=f.git(['status','--porcelain']);
  await assert.rejects(f.preview(),{code:'STASH_RESTORE_CONFLICT'});assert.equal(await readFile(join(f.root,'notes.md'),'utf8'),'local conflicting\n');assert.equal(f.git(['status','--porcelain']),before);assert.equal((await f.status()).stashRestoreReceipt,null);
  f.git(['restore','notes.md']);await writeFile(join(f.root,'new.txt'),'local untracked\n');await assert.rejects(f.preview(),{code:'STASH_RESTORE_CONFLICT'});assert.equal(await readFile(join(f.root,'new.txt'),'utf8'),'local untracked\n');
});
test('fresh preview, exact stash confirmation and rules acknowledgement are required; stale preview and locks prevent writes',async t=>{
  const f=await fixture(t),preview=await f.preview();
  await assert.rejects(f.apply(preview,{confirmStashId:'wrong'}),{code:'STASH_CONFIRMATION_REQUIRED'});
  await assert.rejects(f.apply(preview,{rulesConfirmed:false}),{code:'RULE_REVIEW_REQUIRED'});
  await writeFile(join(f.root,'other.txt'),'changed after preview\n');await assert.rejects(f.apply(preview),{code:'STALE_REVIEW'});assert.equal(await readFile(join(f.root,'notes.md'),'utf8'),'base\n');
  await mkdir(join(f.root,'.git','jixin-write.lock'));await assert.rejects(f.preview(),{code:'OPERATION_LOCKED'});
});
test('uncertain apply persists across workers, blocks future writes, never replays and requires explicit recovery without pending Git',async t=>{
  const f=await fixture(t),preview=await f.preview(),state=await f.status(),id=randomUUID();let applies=0;
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_')));
  const ctx={root:f.root,binary:'git',env,run:async(args,options={})=>{
    const result=await execute('git',['--no-optional-locks','-C',f.root,...args],{env,encoding:options.raw?'buffer':'utf8',maxBuffer:16*1024*1024,windowsHide:true});
    if(args[0]==='stash'&&args[1]==='apply'){applies++;throw Object.assign(new Error('injected lost apply response'),{code:'EPIPE'});}return result.stdout;
  }};
  const service=require('../plugin/node/stash-restore.cjs');const record=await service.restore(ctx,state,{operationId:id,stashId:f.stashId,confirmStashId:f.stashId,previewFingerprint:preview.fingerprint},f.status);assert.equal(record.state,'needs-verification');assert.equal(applies,1);
  assert.equal((await f.status()).stashRestoreReceipt.state,'needs-verification');
  await assert.rejects(gitRequest(f.root,{action:'stage',paths:['notes.md'],token:(await f.status()).token,rulesConfirmed:true}),{code:'STASH_RESTORE_UNCONFIRMED'});
  const replay=await f.apply(preview,{operationId:id});assert.equal(replay.state,'needs-verification');assert.equal(applies,1);
  const ack=async extra=>gitRequest(f.root,{action:'stash-restore-acknowledge',recordId:id,token:(await f.status()).token,rulesConfirmed:true,...extra});
  await assert.rejects(ack({confirmed:false}),{code:'RULE_REVIEW_REQUIRED'});
  await writeFile(join(f.root,'.git','MERGE_HEAD'),f.git(['rev-parse','HEAD'])+'\n');await assert.rejects(ack({confirmed:true}),{code:'PROJECT_CONFLICT'});await rm(join(f.root,'.git','MERGE_HEAD'));
  const actual=await readFile(join(f.root,'notes.md'),'utf8'),index=f.git(['write-tree']);const acknowledged=await ack({confirmed:true});assert.equal(acknowledged.state,'acknowledged');assert.equal(await readFile(join(f.root,'notes.md'),'utf8'),actual);assert.equal(f.git(['write-tree']),index);assert.equal(f.git(['rev-parse','refs/stash']),f.stashId);
});
