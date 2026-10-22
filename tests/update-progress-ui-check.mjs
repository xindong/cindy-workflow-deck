import assert from 'node:assert/strict';
import {_electron,chromium} from 'playwright-core';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,chmod,rm,realpath,readFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {gitWithHost} from '../plugin/git-host.js';
const root=resolve(import.meta.dirname,'..'),plugin=join(root,'plugin');
const temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-progress-ui-'))),project=join(temp,'project'),remote=join(temp,'origin.git');await mkdir(project);
const git=a=>execFileSync('git',['-C',project,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Progress Fixture']);git(['config','user.email','fixture@example.test']);
await writeFile(join(project,'AGENTS.md'),'Preserve project checks.');git(['add','.']);git(['commit','-qm','initial']);
execFileSync('git',['init','-q','--bare',remote]);git(['remote','add','origin',remote]);git(['push','-qu','origin','main']);
const slow=join(project,'.git/slow-upload-pack');await writeFile(slow,'#!/bin/sh\nsleep 3\nexec git-upload-pack "$@"\n');await chmod(slow,0o755);git(['config','remote.origin.uploadpack',slow]);
const out=process.env.JIXIN_PROGRESS_EVIDENCE||join(root,'artifacts/update-progress');await mkdir(out,{recursive:true});
let app,browser,worker,server,id=0,queryFailure=false;const pending=new Map(),calls=[],errors=[];
try {
 // Real standalone IPC must allow progress queries while a write is in flight.
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[join(root,'desktop/main.cjs'),'--jixin-user-data',join(temp,'data')],cwd:root,env});
 const native=await app.firstWindow();native.on('pageerror',e=>errors.push(e.message));
 await native.locator('#quick-project:not(:disabled)').waitFor();
 await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);
 await native.locator('#quick-project').click();await native.locator('#beginner-update:not(:disabled)').waitFor();
 await native.locator('#beginner-update').click();await native.locator('#beginner-confirm').click();
 await native.locator('#update-progress-title').filter({hasText:'正在获取'}).waitFor();
 assert.equal(await native.locator('#update-progress-bar').getAttribute('value'),null);
 assert.equal(await native.locator('#beginner-confirm').isDisabled(),true);
 await native.screenshot({path:join(out,'独立桌面-更新进行中.png'),fullPage:true});
 await native.locator('#update-progress[data-state=done]').waitFor();assert.equal(await native.locator('#update-progress-bar').getAttribute('value'),'1');
 await app.close();app=null;
 // Official plugin worker protocol with the real compact panel and live journal.
 worker=spawn(process.execPath,[join(plugin,'node/inspect-project.cjs')],{stdio:['pipe','pipe','pipe']});worker.stderr.resume();
 createInterface({input:worker.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});
 const host={request:args=>new Promise(yes=>{const n=++id;pending.set(n,r=>yes({ok:true,result:r.result}));worker.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...args})+'\n');})};
 server=createServer(async(req,res)=>{try{const file=join(plugin,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(yes=>server.listen(0,'127.0.0.1',yes));browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:400,height:720},colorScheme:'dark'});page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('gitTransport',async(method,p)=>{calls.push(p.action);if(p.action==='operation-progress'&&queryFailure)throw new Error('Progress disconnected');return gitWithHost(host,project,p);});
 await page.route('**/settings.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/panel.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');
 await page.evaluate(async()=>{const {mountGit}=await import('/git-ui.js');mountGit({transport:{call:window.gitTransport},context:()=>({projectId:'fixture',revision:1,ready:true}),notice:()=>{}});});
 await page.locator('#beginner-update:not(:disabled)').waitFor();await page.locator('#beginner-update').click();await page.locator('#beginner-confirm').click();
 await page.locator('#update-progress-title').filter({hasText:'正在获取'}).waitFor();
 for(const width of [320,860]) {
  await page.setViewportSize({width,height:720});await page.emulateMedia({colorScheme:width===320?'dark':'light'});
  await page.evaluate(dark=>{const values=dark?{'--panel-bg':'#1f1f1e','--surface':'#1f1f1e','--surface-elevated':'#2c2c2a','--surface-chip':'#3c3c3a','--border-default':'#3c3c3a','--text-primary':'#d4d4d4','--text-secondary':'#a3a3a3'}:{'--panel-bg':'#f8f8f6','--surface':'#f8f8f6','--surface-elevated':'#fff','--surface-chip':'#e5e5e5','--border-default':'#d7d7d4','--text-primary':'#262626','--text-secondary':'#737373'};for(const [key,value] of Object.entries(values))document.documentElement.style.setProperty(key,value);document.documentElement.style.colorScheme=dark?'dark':'light';},width===320);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const dock=await page.locator('#compact-footer .dock').boundingBox();assert.ok(Math.abs(dock.x+dock.width/2-width/2)<2);
  await page.screenshot({path:join(out,width===320?'插件-320暗色-更新进度.png':'插件-860亮色-更新进度.png'),fullPage:true});
 }
 await page.locator('#update-progress[data-state=done]').waitFor();assert.equal(calls.filter(a=>a==='beginner-update').length,1);
 // Observation failure must not declare success, unlock controls or repeat writes.
 await page.locator('#beginner-update:not(:disabled)').waitFor();queryFailure=true;
 await page.locator('#beginner-update').click();await page.locator('#beginner-confirm').click();
 await page.locator('#update-progress-time').filter({hasText:'进度暂不可用'}).waitFor();
 assert.equal(await page.locator('#beginner-confirm').isDisabled(),true);assert.equal(await page.locator('#update-progress-bar').getAttribute('value'),null);
 await page.locator('#update-progress[data-state=done]').waitFor();assert.equal(calls.filter(a=>a==='beginner-update').length,2);queryFailure=false;
 // A failed update stops its progress and remains recoverable after inspection.
 git(['config','remote.origin.uploadpack','/missing-upload-pack']);
 await page.locator('#beginner-update:not(:disabled)').waitFor();await page.locator('#beginner-update').click();await page.locator('#beginner-confirm').click();
 await page.locator('#update-progress[data-state=attention]').waitFor();assert.equal(await page.locator('#update-progress-bar').getAttribute('value'),'0');
 await page.locator('#git-refresh:not(:disabled)').waitFor();assert.deepEqual(errors,[]);assert.equal(git(['status','--porcelain']),'');
 console.log('PASS: live progress during real desktop IPC and plugin worker fetch; 320/860 dark/light; elapsed timer; completion only from write result; observation failures do not replay/unlock; failure stops progress; clean fixture.');
} finally {await app?.close();await browser?.close();worker?.kill();if(server)await new Promise(yes=>server.close(yes));await rm(temp,{recursive:true,force:true});}
