import assert from 'node:assert/strict';
import {_electron,chromium} from 'playwright-core';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,chmod,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'jixin-quick-ui-')),project=await realpath(temp);
const git=args=>execFileSync('git',['-C',project,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Art Setup']);git(['config','user.email','fixture@example.test']);
await mkdir(join(project,'.githooks'));await writeFile(join(project,'CONTRIBUTING.md'),'Required local setup:\ngit config core.hooksPath .githooks\nMain requires PR.');await writeFile(join(project,'.githooks/pre-commit'),'#!/bin/sh\necho do-not-run > hook-ran\nexit 1\n');await chmod(join(project,'.githooks/pre-commit'),0o755);git(['add','.']);git(['commit','-qm','chore: init']);await writeFile(join(project,'角色.txt'),'my art');const head=git(['rev-parse','HEAD']),before=git(['status','--porcelain']);
let app,browser,server;
try {
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:process.env.JIXIN_DESKTOP_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[...(process.env.JIXIN_DESKTOP_EXECUTABLE?[]:[join(root,'desktop/main.cjs')]),'--jixin-user-data',join(temp,'.git','app-data')],cwd:root,env});
 const page=await app.firstWindow();await page.locator('#quick-project:not(:disabled)').waitFor();assert.equal(await page.locator('#add').isVisible(),false);assert.equal(await page.locator('#directory').isVisible(),false);
 await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);
 await page.locator('#quick-project').click();await page.locator('#beginner-submit:not(:disabled)').waitFor();
 assert.equal(git(['config','--local','--get','core.hooksPath']),'.githooks');assert.equal(git(['rev-parse','HEAD']),head);assert.equal(git(['status','--porcelain']),before);assert.equal(await page.locator('#project-manager').evaluate(e=>e.open),false);
 await page.locator('#config-tab').click();assert.match(await page.locator('#setup-status').textContent(),/本地准备已完成/);await page.screenshot({path:join(root,'artifacts/auto-setup-desktop.png'),fullPage:true});
 await page.locator('#quick-project').click();await page.locator('#beginner-submit:not(:disabled)').waitFor();assert.equal(await page.locator('#project option').count(),1);
 await page.reload();await page.locator('#beginner-submit:not(:disabled)').waitFor();await app.close();app=null;
 server=spawn('python3',[join(root,'tests/serve-preview.py')],{stdio:['ignore','pipe','inherit']});const base=await new Promise((yes,no)=>{server.stdout.once('data',b=>yes(b.toString().trim()));server.once('error',no);});browser=await chromium.launch({headless:true});
 const panel=await browser.newPage({viewport:{width:400,height:720}});await panel.goto(base+'/panel.html?direct=1');await panel.locator('#quick-project:not(:disabled)').waitFor();assert.equal(await panel.locator('#add').isVisible(),false);await panel.screenshot({path:join(root,'artifacts/auto-setup-cindy-first.png'),fullPage:true});
 await panel.locator('#quick-project').click();await panel.locator('#beginner-submit:not(:disabled)').waitFor();
 assert.equal(await panel.evaluate(()=>mockHost.calls.inspections.filter(r=>r.method==='project/git'&&r.params.action==='prepare').length),1);
 assert.equal(await panel.evaluate(()=>mockHost.calls.errands.length),0);
 await panel.locator('#config-tab').click();await panel.screenshot({path:join(root,'artifacts/auto-setup-cindy-complete.png'),fullPage:true});
 assert.equal(await panel.locator('#project-manager').evaluate(e=>e.open),false);
 await panel.locator('#quick-project').click();await panel.locator('#beginner-submit:not(:disabled)').waitFor();assert.equal(await panel.locator('#project option').count(),1);
 for(const width of [120,320,860]) {await panel.setViewportSize({width,height:720});await panel.locator('#config-tab').click();assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await panel.locator('#config-tab').click();const r=await panel.locator('.dock').boundingBox();assert.ok(Math.abs(r.x+r.width/2-width/2)<2);}
 console.log('Passed: one folder choice auto-saves and prepares real native project hooks; no manual form/add/save, no hook execution or HEAD/index/worktree changes; repeated choice deduplicates; reload; simulated Cindy prepare RPC and zero AI, bottom capsule and narrow configuration.');
}finally{await app?.close();await browser?.close();server?.kill();await rm(temp,{recursive:true,force:true});}
