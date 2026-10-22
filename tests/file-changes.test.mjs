import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm,realpath,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{gitRequest}=require('../plugin/node/git-service.cjs');
async function fixture(t) {
 const base=await realpath(await mkdtemp(join(tmpdir(),'jixin-file-')));t.after(()=>rm(base,{recursive:true,force:true}));
 const root=join(base,'local'),remote=join(base,'remote.git'),team=join(base,'team');await mkdir(root);
 const git=(args,dir=root)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-q','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);
 await writeFile(join(root,'a.txt'),'base\n');await writeFile(join(root,'other.txt'),'other\n');git(['add','.']);git(['commit','-qm','initial']);
 execFileSync('git',['init','--bare','-q','--initial-branch=main',remote]);git(['remote','add','origin',remote]);git(['push','-qu','origin','main']);
 execFileSync('git',['clone','-q',remote,team]);git(['config','user.name','Team'],team);git(['config','user.email','team@example.test'],team);
 const status=()=>gitRequest(root);
 const revert=async(path,extra={})=>gitRequest(root,{action:'file-revert',token:(await status()).token,rulesConfirmed:true,path,confirmPath:path,...extra});
 return {root,base,team,git,status,revert};
}
test('fresh online single-file comparison includes staged and working changes without touching index, HEAD or other files',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'a.txt'),'staged\n');f.git(['add','a.txt']);await writeFile(join(f.root,'a.txt'),'local\n');await writeFile(join(f.root,'other.txt'),'keep\n');
 await writeFile(join(f.team,'a.txt'),'online\n');f.git(['commit','-qam','online'],f.team);f.git(['push','-q'],f.team);
 const head=f.git(['rev-parse','HEAD']),index=f.git(['diff','--cached','--binary']);
 const d=await gitRequest(f.root,{action:'file-diff',path:'a.txt',preview:true});assert.equal(d.target,'origin/main');assert.match(d.output,/-online\n\+local/);assert.equal(d.commit,f.git(['rev-parse','HEAD'],f.team));
 assert.equal(f.git(['rev-parse','HEAD']),head);assert.equal(f.git(['diff','--cached','--binary']),index);assert.equal(await readFile(join(f.root,'other.txt'),'utf8'),'keep\n');
 const page=await fetch(d.url);assert.equal(page.status,200);assert.match(await page.text(),/a.txt/);assert.match(page.headers.get('content-security-policy'),/default-src 'none'/);assert.equal((await fetch(d.url+'/other')).status,404);assert.equal((await fetch(d.url,{method:'POST'})).status,404);
});
test('untracked files are included even when only the remote now tracks that path; default origin target is explicit',async t=>{
 const f=await fixture(t);f.git(['config','--unset','branch.main.remote']);f.git(['config','--unset','branch.main.merge']);
 await writeFile(join(f.root,'new.txt'),'local new\n');await writeFile(join(f.team,'new.txt'),'remote new\n');f.git(['add','.'],f.team);f.git(['commit','-qm','new'],f.team);f.git(['push','-q'],f.team);
 const d=await gitRequest(f.root,{action:'file-diff',path:'new.txt'});assert.equal(d.target,'origin/main');assert.match(d.output,/-remote new/);assert.match(d.output,/\+local new/);
 await writeFile(join(f.root,'only.txt'),'<script>bad()</script>');const fresh=await gitRequest(f.root,{action:'file-diff',path:'only.txt',preview:true});const html=await(await fetch(fresh.url)).text();assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
});
test('restore backs up both index and working changes; only chosen file is reset to local HEAD, never online',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'a.txt'),'staged\n');f.git(['add','a.txt']);await writeFile(join(f.root,'a.txt'),'work\n');await writeFile(join(f.root,'other.txt'),'keep\n');f.git(['add','other.txt']);
 const before=f.git(['rev-parse','HEAD']);const result=await f.revert('a.txt');assert.equal(await readFile(join(f.root,'a.txt'),'utf8'),'base\n');assert.equal(f.git(['diff','--cached','--name-only']),'other.txt');assert.equal(await readFile(join(f.root,'other.txt'),'utf8'),'keep\n');assert.equal(f.git(['rev-parse','HEAD']),before);
 assert.match(await readFile(join(result.backup,'staged.patch'),'utf8'),/\+staged/);assert.match(await readFile(join(result.backup,'worktree.patch'),'utf8'),/\+work/);assert.equal(await readFile(join(result.backup,'local-file'),'utf8'),'work\n');assert.equal(JSON.parse(await readFile(join(result.backup,'record.json'),'utf8')).state,'restored');
});
test('restore deleted files, staged additions and untracked files with backups',async t=>{
 const f=await fixture(t);await rm(join(f.root,'a.txt'));await f.revert('a.txt');assert.equal(await readFile(join(f.root,'a.txt'),'utf8'),'base\n');
 for(const staged of [false,true]) {await writeFile(join(f.root,'new.txt'),'new\n');if(staged)f.git(['add','new.txt']);const r=await f.revert('new.txt');await assert.rejects(readFile(join(f.root,'new.txt')),{code:'ENOENT'});assert.equal(await readFile(join(r.backup,'local-file'),'utf8'),'new\n');assert.equal((await f.status()).changes.length,0);}
});
test('stale tickets, missing path confirmation, traversal, symlinks and renames cannot restore',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'a.txt'),'one\n');const ticket=(await f.status()).token;await writeFile(join(f.root,'a.txt'),'two\n');
 await assert.rejects(gitRequest(f.root,{action:'file-revert',token:ticket,rulesConfirmed:true,path:'a.txt',confirmPath:'a.txt'}),{code:'STALE_REVIEW'});await assert.rejects(f.revert('a.txt',{confirmPath:''}),{code:'FILE_CONFIRMATION_REQUIRED'});await assert.rejects(f.revert('../outside'),{code:'INVALID_PATHS'});
 if(process.platform!=='win32'){await symlink(join(f.root,'a.txt'),join(f.root,'link'));await assert.rejects(f.revert('link'),{code:'UNSUPPORTED_FILE'});}
 f.git(['mv','other.txt','renamed.txt']);await assert.rejects(f.revert('renamed.txt'),{code:'UNSUPPORTED_FILE'});assert.equal(await readFile(join(f.root,'a.txt'),'utf8'),'two\n');
});
test('uncertain restore record blocks new writes while status and local review stay recoverable',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'a.txt'),'local');await writeFile(join(f.root,'.git/jixin-file-revert.json'),JSON.stringify({state:'needs-verification',backup:'backup-location'}));
 assert.equal((await f.status()).changes.length,1);await assert.rejects(f.revert('a.txt'),{code:'REVERT_UNCONFIRMED'});await assert.rejects(gitRequest(f.root,{action:'stage',paths:['a.txt'],rulesConfirmed:true,token:(await f.status()).token}),{code:'REVERT_UNCONFIRMED'});assert.equal(await readFile(join(f.root,'a.txt'),'utf8'),'local');
});
test('a lost restore result keeps its journal and blocks later writes instead of replaying',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'a.txt'),'local\n');const state=await f.status();
 const ctx={root:f.root,run:async args=>{const value=execFileSync('git',['-C',f.root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});if(args[0]==='restore')throw new Error('Result lost after actual restore');return value;}};
 await assert.rejects(require('../plugin/node/file-changes.cjs').revert(ctx,state,{path:'a.txt',confirmPath:'a.txt'},f.status),{code:'REVERT_UNCONFIRMED'});
 assert.equal(await readFile(join(f.root,'a.txt'),'utf8'),'base\n');const record=JSON.parse(await readFile(join(f.root,'.git/jixin-file-revert.json'),'utf8'));assert.equal(record.state,'needs-verification');assert.equal(await readFile(join(record.backup,'local-file'),'utf8'),'local\n');
 await writeFile(join(f.root,'a.txt'),'new work\n');await assert.rejects(f.revert('a.txt'),{code:'REVERT_UNCONFIRMED'});assert.equal(await readFile(join(f.root,'a.txt'),'utf8'),'new work\n');
});
test('explicit verification acknowledges the exact pending restore without replay and permits a new action',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'a.txt'),'keep current work\n');await writeFile(join(f.root,'.git/jixin-file-revert.json'),JSON.stringify({state:'needs-verification',backup:'exact-backup'}));
 await assert.rejects(gitRequest(f.root,{action:'file-revert-acknowledge',token:(await f.status()).token,rulesConfirmed:true,recordId:'wrong'}),{code:'STALE_REVIEW'});
 await gitRequest(f.root,{action:'file-revert-acknowledge',token:(await f.status()).token,rulesConfirmed:true,recordId:'exact-backup'});assert.equal(await readFile(join(f.root,'a.txt'),'utf8'),'keep current work\n');assert.equal((await f.status()).fileRevertReceipt.state,'acknowledged');
 await gitRequest(f.root,{action:'stage',token:(await f.status()).token,rulesConfirmed:true,paths:['a.txt']});assert.equal(f.git(['diff','--cached','--name-only']),'a.txt');
});
test('comparison uses the actual file even after staged deletion and handles binary or empty file changes',async t=>{
 const f=await fixture(t);f.git(['rm','--cached','-q','a.txt']);await writeFile(join(f.root,'a.txt'),'actual working content\n');let d=await gitRequest(f.root,{action:'file-diff',path:'a.txt'});assert.match(d.output,/\+actual working content/);assert.match(d.output,/-base/);
 await writeFile(join(f.root,'binary.bin'),Buffer.from([0,1,2,3]));d=await gitRequest(f.root,{action:'file-diff',path:'binary.bin'});assert.match(d.output,/Binary files differ/);
 await writeFile(join(f.root,'empty.txt'),'');d=await gitRequest(f.root,{action:'file-diff',path:'empty.txt'});assert.match(d.output,/Empty file added/);
});
