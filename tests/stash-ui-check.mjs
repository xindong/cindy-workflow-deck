import assert from 'node:assert/strict';
import {chromium,_electron} from 'playwright-core';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {gitWithHost} from '../plugin/git-host.js';
import {createConfigurationController} from '../plugin/configuration-controller.js';
import {updateConfiguration,newProject} from '../plugin/core/project-config.mjs';
const root=resolve(import.meta.dirname,'..'),plugin=join(root,'plugin'),temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-stash-ui-'))),project=join(temp,'project'),origin=join(temp,'origin.git');await mkdir(project);
const git=a=>execFileSync('git',['-C',project,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Stash UI']);git(['config','user.email','fixture@example.test']);
await writeFile(join(project,'notes.md'),'base\n');await writeFile(join(project,'unchanged.txt'),'untouched\n');git(['add','.']);git(['commit','-qm','initial']);
execFileSync('git',['init','--bare','-q',origin]);git(['remote','add','origin',origin]);git(['push','-qu','origin','main']);
await writeFile(join(project,'notes.md'),'saved in stash\n');git(['add','notes.md']);await writeFile(join(project,'notes.md'),'saved final working\n');await writeFile(join(project,'新增 文件.md'),'new file\n');git(['stash','push','-qu','-m','UI saved changes']);const stashId=git(['rev-parse','refs/stash']);
await writeFile(join(project,'notes.md'),'local after stash\n');git(['add','notes.md']);await writeFile(join(project,'notes.md'),'current local working\n');
const team=join(temp,'team');execFileSync('git',['clone','-q','-b','main',origin,team]);const tg=a=>execFileSync('git',['-C',team,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();tg(['config','user.name','Team']);tg(['config','user.email','team@example.test']);await writeFile(join(team,'notes.md'),'server newest\n');tg(['add','.']);tg(['commit','-qm','advance server']);tg(['push','-q']);const remoteCommit=tg(['rev-parse','HEAD']);
const baseline={head:git(['rev-parse','HEAD']),index:git(['write-tree']),status:git(['status','--porcelain=v1']),stash:git(['stash','list','--format=%H']),bytes:await readFile(join(project,'notes.md'),'utf8')};
const configuration=updateConfiguration({},0,{projects:[{...newProject('one'),directory:project}],activeProjectId:'one'});
let worker,server,browser,app,rpcId=0,delay=false;const pending=new Map(),errors=[],calls=[],out=join(root,'artifacts/stash-browser');await mkdir(out,{recursive:true});
async function inspect(page,english,compact) {
  await page.locator('#beginner-stashes:not(:disabled)').waitFor();assert.match(await page.locator('#beginner-branch').textContent(),/main/);
  await page.screenshot({path:join(out,(compact?'panel-':'desktop-')+(english?'en':'zh')+'-branch.png'),fullPage:true});
  if(compact){assert.equal(await page.locator('#beginner-stashes svg').count(),1);await page.locator('#beginner-stashes').hover();await page.locator('#compact-tooltip:not([hidden])').waitFor();await page.keyboard.press('Escape');}
  await page.locator('#beginner-stashes').click();await page.locator('.stash-entry').waitFor();assert.equal(await page.locator('.stash-entry').count(),1);
  await page.locator('.stash-entry').click();await page.locator('.stash-file[data-path="notes.md"] button').first().waitFor();assert.equal(await page.locator('.stash-file').count(),2);
  const row=page.locator('.stash-file[data-path="notes.md"]');
  await row.locator('[data-target="local"]').click();await page.locator('#stash-diff').filter({hasText:'+current local working'}).waitFor();assert.match(await page.locator('#stash-diff').textContent(),/-saved final working/);
  await row.locator('[data-target="remote"]').click();await page.locator('#stash-diff').filter({hasText:'+server newest'}).waitFor();assert.match(await page.locator('#stash-diff-info').textContent(),new RegExp(remoteCommit.slice(0,12)));assert.match(await page.locator('#stash-diff-info').textContent(),/origin\/main/);
  for(const width of [320,860])for(const scheme of ['light','dark']) {
    await page.setViewportSize({width,height:820});await page.emulateMedia({colorScheme:scheme});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await page.locator('#beginner-branch').isVisible(),true);
    await page.locator('#git-view').evaluate(e=>e.scrollTop=0);
    await page.screenshot({path:join(out,(compact?'panel-':'desktop-')+(english?'en':'zh')+'-'+width+'-'+scheme+'.png'),fullPage:true});
  }
}
try {
  worker=spawn(process.execPath,[join(plugin,'node/inspect-project.cjs')],{stdio:['pipe','pipe','pipe']});worker.stderr.resume();
  createInterface({input:worker.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});
  const host={request:args=>new Promise(yes=>{const id=++rpcId;pending.set(id,r=>yes({ok:true,result:r.result}));worker.stdin.write(JSON.stringify({jsonrpc:'2.0',id,...args})+'\n');})};
  const controller=createConfigurationController({store:{read:async()=>({projectConfiguration:configuration})},git:(dir,p)=>gitWithHost(host,dir,p)});
  server=createServer(async(req,res)=>{try {const file=join(plugin,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'");res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
  browser=await chromium.launch({headless:true,...(process.env.JIXIN_BROWSER_EXECUTABLE?{executablePath:process.env.JIXIN_BROWSER_EXECUTABLE}:{})});
  for(const english of [false,true]) {
    const page=await browser.newPage({viewport:{width:320,height:820}});page.on('pageerror',e=>errors.push(e.message));
    await page.exposeFunction('fixtureRequest',async(method,p)=>{calls.push(p.action||method);if(delay&&p.action==='stash-diff')await new Promise(yes=>setTimeout(yes,250));try{return {ok:true,result:await controller(method,p)};}catch(e){return {ok:false,code:e.code,message:e.message};}});
    await page.route('**/settings.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('**/panel.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/fixture-theme.css',r=>r.fulfill({contentType:'text/css',body:':root{--panel-bg:#f8f8f6;--surface:#fff;--surface-elevated:#fff;--surface-chip:#eee;--text-primary:#262626;--text-secondary:#737373;--border-default:#d7d7d4;color-scheme:light}@media(prefers-color-scheme:dark){:root{--panel-bg:#1f1f1e;--surface:#292928;--surface-elevated:#292928;--surface-chip:#444;--text-primary:#ededed;--text-secondary:#aaa;--border-default:#525252;color-scheme:dark}}'}));
    await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');
    await page.evaluate(()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/fixture-theme.css';document.head.append(link);});
    await page.evaluate(async({english})=>{document.documentElement.lang=english?'en':'zh-CN';const {mountGit}=await import('/git-ui.js');mountGit({english,transport:{call:async(m,p)=>{const r=await window.fixtureRequest(m,p);if(!r.ok)throw Object.assign(new Error(r.message),{code:r.code});return r.result;}},context:()=>({projectId:'one',revision:1,ready:true}),notice:()=>{}});},{english});
    await inspect(page,english,true);assert.equal(page.context().pages().length,1);
    if(!english) {
      git(['remote','set-url','origin',join(temp,'missing.git')]);await page.locator('.stash-file[data-path="notes.md"] [data-target="remote"]').click();await page.locator('#stash-status').filter({hasText:'暂时无法获取服务器最新版本'}).waitFor();assert.equal(await page.locator('#stash-comparison').isVisible(),false);git(['remote','set-url','origin',origin]);
      delay=true;await page.locator('.stash-file[data-path="notes.md"] [data-target="local"]').click();await page.evaluate(()=>document.dispatchEvent(new Event('configuration-invalidated')));await page.locator('#beginner-stashes:disabled').waitFor();assert.equal(await page.locator('#beginner-branch').isVisible(),false);assert.equal(await page.locator('#stash-browser').isVisible(),false);delay=false;
      await page.evaluate(()=>document.dispatchEvent(new Event('configuration-ready')));await page.locator('#beginner-stashes:not(:disabled)').waitFor();assert.equal(await page.locator('#stash-comparison').isVisible(),false);
      git(['switch','-qc','feature/branch-visible']);await page.locator('#git-refresh').click();await page.locator('#beginner-branch').filter({hasText:'feature/branch-visible'}).waitFor();git(['switch','-q','main']);
    }
    await page.close();
  }
  const data=join(temp,'desktop-data');await mkdir(data);await writeFile(join(data,'projects.json'),JSON.stringify({projectConfiguration:configuration}));
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:process.env.JIXIN_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[join(root,'desktop/main.cjs'),'--jixin-user-data',data],cwd:root,env});const desktop=await app.firstWindow();desktop.on('pageerror',e=>errors.push(e.message));await inspect(desktop,false,false);assert.equal((await app.windows()).length,1);await app.close();app=null;
  assert.deepEqual({head:git(['rev-parse','HEAD']),index:git(['write-tree']),status:git(['status','--porcelain=v1']),stash:git(['stash','list','--format=%H']),bytes:await readFile(join(project,'notes.md'),'utf8')},baseline);
  assert.equal(calls.some(a=>['beginner-update','beginner-submit','stage','unstage','branch-switch','branch-create','file-open'].includes(a)),false);assert.deepEqual(errors,[]);
  console.log('PASS: production panel/compact UI + real worker/controller; actual Electron IPC; branch refresh; stash files/local and latest-remote diff; network failure clears old diff; config invalidation discards late results; Chinese/English; 320/860 light/dark; no extra windows or Git state mutations.');
} finally {await app?.close();await browser?.close();worker?.kill();if(server)await new Promise(yes=>server.close(yes));await rm(temp,{recursive:true,force:true});}
