import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {gitWithHost} from '../plugin/git-host.js';
const plugin=resolve(import.meta.dirname,'../plugin'),temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-restore-recovery-'))),project=join(temp,'project'),remote=join(temp,'remote.git'),team=join(temp,'team');
await mkdir(project);
const git=(args,dir=project)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);
await writeFile(join(project,'AGENTS.md'),'Keep project checks enabled.');git(['add','.']);git(['commit','-qm','initial']);
execFileSync('git',['init','--bare','-q','--initial-branch=main',remote]);git(['remote','add','origin',remote]);git(['push','-qu','origin','main']);execFileSync('git',['clone','-q',remote,team]);git(['config','user.name','Team'],team);git(['config','user.email','team@example.test'],team);
await writeFile(join(team,'team.txt'),'team update');git(['add','.'],team);git(['commit','-qm','team'],team);git(['push','-q'],team);
const paths=[];await mkdir(join(project,'Developer/plugin-file-list-test/group-01'),{recursive:true});
for(let i=0;i<75;i++)for(const ext of ['json','txt','csv','md']){const path='Developer/plugin-file-list-test/group-01/sample-'+String(i).padStart(3,'0')+'.'+ext;await writeFile(join(project,path),'fixture '+i);if(ext==='json')paths.push(path);}
git(['add','-N','Developer/plugin-file-list-test/group-01/sample-000.txt']);
const worker=spawn(process.execPath,[join(plugin,'node/worker-entry.cjs')],{stdio:['pipe','pipe','pipe']}),pending=new Map(),calls=[];let id=0,browser,failRestore=false,failStatus=false,loseResult=false;
worker.stderr.resume();createInterface({input:worker.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});
const host={request:async options=>{const n=++id,p=new Promise(yes=>pending.set(n,yes));worker.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...options})+'\n');const r=await p;return r.error?{ok:false,error:r.error}:{ok:true,result:r.result};}};
const status=()=>gitWithHost(host,project,{action:'status'});
const s=await status(),failed=await gitWithHost(host,project,{action:'beginner-update',token:s.token,rulesConfirmed:true,operationId:randomUUID()});assert.equal(failed.step,'preflight');assert.equal(failed.state,'blocked');assert.match(failed.detail,/not uptodate|Cannot save/);
const server=createServer(async(req,res)=>{try{const name=join(plugin,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[extname(name)]||'application/octet-stream');res.end(await readFile(name));}catch{res.statusCode=404;res.end();}});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:320,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('gitTransport',async(method,p)=>{calls.push(p);try{
  if(p.action==='status'&&failStatus){failStatus=false;throw Object.assign(new Error('Fixture read unavailable'),{code:'NETWORK_ERROR'});}
  if(p.action==='file-revert'&&failRestore){failRestore=false;failStatus=true;throw Object.assign(new Error('Fixture request lost before write; check result first'),{code:'RESPONSE_UNCONFIRMED'});}
  if(p.action==='file-revert')await new Promise(yes=>setTimeout(yes,250));
  const value=await gitWithHost(host,project,p);
  if(p.action==='file-revert'&&loseResult){loseResult=false;throw Object.assign(new Error('Fixture final result lost after real restore'),{code:'RESPONSE_UNCONFIRMED'});}
  return {ok:true,value};
 }catch(e){return {ok:false,code:e.code,message:e.message};}});
 await page.route('**/settings.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('**/panel.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');
 await page.evaluate(async()=>{const {mountGit}=await import('/git-ui.js');mountGit({transport:{call:async(...args)=>{const r=await window.gitTransport(...args);if(!r.ok)throw Object.assign(new Error(r.message),{code:r.code});return r.value;}},context:()=>({projectId:'fixture',revision:1,ready:true}),notice:()=>{}});});
 const ready=()=>page.locator('#beginner-refresh-changes:not(:disabled)').waitFor(),feedback=page.locator('#file-action-status'),recheck=page.locator('#file-action-recheck');
 await page.locator('#beginner-view:not(:disabled)').click();await ready();await page.locator('#beginner-file-type').selectOption('.json');assert.equal(await page.locator('#beginner-files .beginner-file:visible').count(),75);
 const restore=page.locator('#beginner-restore-filtered'),confirm=page.locator('dialog').getByRole('button',{name:'确认还原这 75 个文件',exact:true});
 await restore.click();await page.locator('dialog').getByRole('button',{name:'取消',exact:true}).click();assert.equal(calls.filter(p=>p.action==='file-revert').length,0);
 failRestore=true;await restore.click();await page.locator('dialog input').check();await confirm.click();await ready();await feedback.filter({hasText:'状态读取也未完成'}).waitFor();assert.equal(await recheck.isEnabled(),true);assert.equal(calls.filter(p=>p.action==='file-revert').length,1);
 for(const name of paths)assert.match(await readFile(join(project,name),'utf8'),/^fixture /);
 await recheck.click();await ready();assert.equal(calls.filter(p=>p.action==='file-revert').length,1);assert.equal(await restore.isEnabled(),true);assert.equal(await page.locator('#file-action-details').isVisible(),false);
 loseResult=true;await restore.click();await page.locator('dialog input').check();await confirm.click();await feedback.filter({hasText:'正在备份并还原 75'}).waitFor();await ready();await feedback.filter({hasText:'结果尚未确认'}).waitFor();assert.equal(calls.filter(p=>p.action==='file-revert').length,2);
 assert.equal(await page.locator('#beginner-files .beginner-file:visible').count(),225);assert.equal(await recheck.isEnabled(),true);
 await recheck.click();await ready();assert.equal(calls.filter(p=>p.action==='file-revert').length,2);assert.equal((await status()).changes.length,225);
 const receipt=JSON.parse(await readFile(join(project,'.git/jixin-file-revert.json'),'utf8'));assert.equal(receipt.state,'restored');assert.deepEqual(receipt.completed,paths);
 for(const [i,name] of paths.entries()){await assert.rejects(readFile(join(project,name)),{code:'ENOENT'});assert.equal(await readFile(join(receipt.backup,String(i),'local-file'),'utf8'),'fixture '+i);}
 await writeFile(join(project,'.git/jixin-beginner.json'),JSON.stringify({...failed,step:'restore',state:'needs-verification'}));await page.locator('#beginner-refresh-changes').click();await ready();assert.equal(await page.locator('.file-actions [data-restore]').first().isDisabled(),true);assert.equal(await restore.isDisabled(),true);
 await writeFile(join(project,'.git/jixin-beginner.json'),JSON.stringify(failed));await writeFile(join(project,'.git/jixin-file-revert.json'),JSON.stringify({...receipt,state:'needs-verification'}));await page.locator('#beginner-refresh-changes').click();await ready();await page.locator('#beginner-file-type').selectOption('.txt');assert.equal(await restore.isDisabled(),true);await page.locator('#file-revert-recovery').waitFor();
 const out=resolve('artifacts/file-restore-recovery');await mkdir(out,{recursive:true});
 for(const [width,scheme] of [[320,'dark'],[860,'light']]){await page.setViewportSize({width,height:820});await page.emulateMedia({colorScheme:scheme});await page.addStyleTag({content:':root{--text-primary:'+(scheme==='dark'?'#eee':'#262626')+';--text-secondary:'+(scheme==='dark'?'#aaa':'#737373')+';--surface:'+(scheme==='dark'?'#262626':'#fff')+';--panel-bg:var(--surface);--surface-elevated:var(--surface);--surface-chip:var(--surface);--border-default:'+(scheme==='dark'?'#555':'#ccc')+';color-scheme:'+scheme+'}'});await feedback.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,'还原结果核对-'+width+'-'+scheme+'.png')});}
 assert.deepEqual(errors,[]);console.log('PASS: real Git preflight failure, 300 changes / 75 JSON precise backed-up restores; cancel zero writes; request/read failure local recovery; actual restore result loss, READ-only checks, no replay; uncertain journal remains locked; 320 dark / 860 light. Simulated Host boundary, not installed Cindy or Windows acceptance.');
} finally {await browser?.close();worker.kill();await new Promise(yes=>server.close(yes));await rm(temp,{recursive:true,force:true});}
