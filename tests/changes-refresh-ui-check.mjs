import assert from 'node:assert/strict';
import {_electron,chromium} from 'playwright-core';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm,realpath,readFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {gitWithHost} from '../plugin/git-host.js';
const root=resolve(import.meta.dirname,'..'),plugin=join(root,'plugin');
const temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-changes-ui-'))),project=join(temp,'project');await mkdir(project);
const git=a=>execFileSync('git',['-C',project,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);
await writeFile(join(project,'AGENTS.md'),'Keep project checks enabled.');git(['add','.']);git(['commit','-qm','initial']);const head=git(['rev-parse','HEAD']);
let app,browser,worker,server,id=0,failStatus=false,holdStatus=false,releaseStatus;const pending=new Map(),calls=[],errors=[];
const files=page=>page.locator('#beginner-files input').evaluateAll(items=>items.map(i=>i.value).sort());
const checked=page=>page.locator('#beginner-refresh-changes:not(:disabled)').waitFor();
try {
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[join(root,'desktop/main.cjs'),'--jixin-user-data',join(temp,'data')],cwd:root,env});
 const native=await app.firstWindow();native.on('pageerror',e=>errors.push(e.message));await native.locator('#quick-project:not(:disabled)').waitFor();
 await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);
 await native.locator('#quick-project').click();await native.locator('#beginner-view:not(:disabled)').waitFor();
 await writeFile(join(project,'新增角色.txt'),'external new file');
 await native.locator('#beginner-view').click();await checked(native);assert.deepEqual(await files(native),['新增角色.txt']);
 assert.match(await native.locator('#beginner-changes-status').textContent(),/已检查.*1 个/);
 await writeFile(join(project,'外部修改.txt'),'second');await native.locator('#beginner-refresh-changes').click();await checked(native);assert.equal((await files(native)).length,2);
 await native.locator('#beginner-files input[value="外部修改.txt"]').check();await rm(join(project,'新增角色.txt'));
 await native.locator('#beginner-refresh-changes').click();await checked(native);assert.deepEqual(await files(native),['外部修改.txt']);assert.equal(await native.locator('#beginner-files input:checked').count(),1);
 await native.locator('#beginner-cancel').click();await writeFile(join(project,'再次进入.txt'),'external');
 await native.locator('#beginner-submit').click();await checked(native);assert.equal((await files(native)).length,2);assert.equal(await native.locator('#beginner-manual').isChecked(),false);
 await app.close();app=null;
 worker=spawn(process.execPath,[join(plugin,'node/inspect-project.cjs')],{stdio:['pipe','pipe','pipe']});worker.stderr.resume();
 createInterface({input:worker.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});
 const host={request:args=>new Promise(yes=>{const n=++id;pending.set(n,r=>yes({ok:true,result:r.result}));worker.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...args})+'\n');})};
 server=createServer(async(req,res)=>{try{const file=join(plugin,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(yes=>server.listen(0,'127.0.0.1',yes));browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:320,height:720}});page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('gitTransport',async(method,p)=>{
  calls.push(p.action);
  if(p.action==='status'&&failStatus){failStatus=false;throw new Error('Read failed');}
  if(p.action==='status'&&holdStatus){holdStatus=false;await new Promise(yes=>{releaseStatus=yes;});}
  return gitWithHost(host,project,p);
 });
 await page.route('**/settings.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('**/panel.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');
 await page.evaluate(async()=>{const {mountGit}=await import('/git-ui.js');mountGit({transport:{call:window.gitTransport},context:()=>({projectId:'fixture',revision:1,ready:true}),notice:()=>{}});});
 await page.locator('#beginner-view:not(:disabled)').waitFor();const before=calls.length;
 await writeFile(join(project,'插件新增.txt'),'outside');await page.locator('#beginner-view').click();await checked(page);assert.equal(calls.length,before+1);assert.equal((await files(page)).length,3);
 holdStatus=true;await page.locator('#beginner-refresh-changes').click();await page.locator('#beginner-refresh-changes:disabled').waitFor();
 assert.equal(await page.locator('#beginner-files').isVisible(),false);assert.match(await page.locator('#beginner-changes-status').textContent(),/正在比对/);
 assert.equal(await page.locator('#beginner-confirm').isDisabled(),true);assert.equal(await page.locator('#beginner-all').isDisabled(),true);
 while(!releaseStatus)await new Promise(yes=>setTimeout(yes,10));releaseStatus();await checked(page);
 failStatus=true;await page.locator('#beginner-refresh-changes').click();await checked(page);assert.deepEqual(await files(page),[]);assert.match(await page.locator('#beginner-changes-status').textContent(),/比对失败/);
 await page.locator('#beginner-refresh-changes').click();await checked(page);assert.equal((await files(page)).length,3);assert.doesNotMatch(await page.locator('#beginner-changes-status').textContent(),/失败/);
 for(const width of [320,860]){await page.setViewportSize({width,height:720});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.ok(calls.every(action=>action==='status'),'file refresh must only read local status');
 assert.equal(git(['rev-parse','HEAD']),head);assert.equal(git(['diff','--cached','--name-only']),'');assert.deepEqual(errors,[]);
 const out=process.env.JIXIN_CHANGES_EVIDENCE||join(root,'artifacts');await mkdir(out,{recursive:true});await page.setViewportSize({width:400,height:720});await page.screenshot({path:join(out,'刷新改动-测试界面.png'),fullPage:true});
 console.log('PASS: real Electron and plugin worker detect external additions/deletions on entry and manual refresh; exactly one status read per entry; retained valid selection; cleared approval; loading hides stale list; read failure can retry with local button; 320/860 layout; zero writes or network actions.');
} finally {releaseStatus?.();await app?.close();await browser?.close();worker?.kill();if(server)await new Promise(yes=>server.close(yes));await rm(temp,{recursive:true,force:true});}
