import assert from 'node:assert/strict';
import {_electron,chromium} from 'playwright-core';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,chmod,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'jixin-art-ui-')),project=join(await realpath(temp),'art-project');await mkdir(project);
const git=args=>execFileSync('git',['-C',project,...args],{encoding:'utf8'}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Art UI']);git(['config','user.email','fixture@example.test']);
await writeFile(join(project,'AGENTS.md'),'Use Conventional Commits. DCO required. Main requires PR. Art lead must approve.');git(['add','.']);git(['commit','-qm','chore: initial']);const main=git(['rev-parse','HEAD']);
const origin=join(temp,'origin.git');execFileSync('git',['init','--bare','-q',origin]);git(['remote','add','origin',origin]);git(['push','-qu','origin','main']);
await writeFile(join(project,'角色.png'),'art');await writeFile(join(project,'别人.txt'),'leave untouched');
const bin=join(temp,'bin');await mkdir(bin);await writeFile(join(bin,'gh'),'#!/bin/sh\nif [ "$1" = auth ]; then exit 0; fi\nprintf "https://example.test/team/repo/pull/1\\n"\n');await chmod(join(bin,'gh'),0o755);
await mkdir(join(root,'artifacts'),{recursive:true});const env={...process.env,PATH:bin+':'+process.env.PATH};delete env.ELECTRON_RUN_AS_NODE;
let app,browser,server;const errors=[];
try {
 app=await _electron.launch({executablePath:process.env.JIXIN_DESKTOP_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[...(process.env.JIXIN_DESKTOP_EXECUTABLE?[]:[join(root,'desktop/main.cjs')]),'--jixin-user-data',join(temp,'data')],cwd:root,env});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 if(process.env.JIXIN_DESKTOP_EXECUTABLE)assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
 await page.locator('#add:not(:disabled)').waitFor();await page.locator('#add').click();await page.locator('#directory').fill(project);await page.locator('#save').click();await page.locator('#notice').filter({hasText:'项目已保存'}).waitFor();await page.locator('#git-tab').click();await page.locator('#beginner-submit:not(:disabled)').waitFor();
 assert.equal(await page.locator('[data-git="stage"]').isVisible(),false);assert.equal(await page.locator('#git-branch').isVisible(),false);
 await page.locator('#beginner-submit').click();assert.equal(await page.locator('#beginner-confirm').isDisabled(),true);await page.locator('#beginner-cancel').click();assert.equal(git(['rev-parse','HEAD']),main);
 await page.locator('#beginner-view').click();assert.equal(await page.locator('#beginner-confirm').isVisible(),false);
 await page.locator('#beginner-submit').click();
 await page.locator('#beginner-files input').evaluateAll(items=>{const c=items.find(c=>c.value==='角色.png');c.click();});await page.locator('#beginner-summary').fill('调整角色颜色');assert.equal(await page.locator('#beginner-confirm').isDisabled(),true);
 await page.locator('#beginner-team-rules').evaluate(e=>e.open=true);assert.match(await page.locator('#beginner-rules').textContent(),/Art lead must approve/);await page.locator('#beginner-manual').check();await page.locator('#beginner-confirm').click();
 await page.locator('#beginner-message').filter({hasText:'等待团队审核'}).waitFor();assert.equal(git(['rev-parse','main']),main);assert.match(git(['branch','--show-current']),/^work\/change-/);assert.equal(git(['-c','core.quotePath=false','diff-tree','--no-commit-id','--name-only','-r','HEAD']),'角色.png');assert.match(git(['status','--porcelain']),/\?\?/);assert.match(git(['log','-1','--format=%B']),/Signed-off-by/);
 await page.screenshot({path:join(root,'artifacts/beginner-desktop-review.png'),fullPage:true});await page.reload();await page.locator('#beginner-message').filter({hasText:'等待团队审核'}).waitFor();
 for(const width of [320,860])for(const colorScheme of ['light','dark']){await page.setViewportSize({width,height:820});await page.emulateMedia({colorScheme});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(root,'artifacts/beginner-desktop-'+width+'-'+colorScheme+'.png'),fullPage:true});}
 await app.close();app=null;
 server=spawn('python3',[join(root,'tests/serve-preview.py')],{stdio:['ignore','pipe','inherit']});const base=await new Promise((yes,no)=>{server.stdout.once('data',b=>yes(b.toString().trim()));server.once('error',no);});browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:320,height:820}});const panel=await context.newPage();panel.on('pageerror',e=>errors.push(e.message));await panel.goto(base+'/panel.html?direct=1');await panel.locator('#add:not(:disabled)').waitFor();await panel.locator('#add').click();await panel.locator('#pick-directory').click();await panel.locator('#save').click();await panel.locator('#notice').filter({hasText:'项目已保存'}).waitFor();await panel.locator('#git-tab').click();await panel.locator('#beginner-submit:not(:disabled)').waitFor();
 assert.equal(await panel.locator('#git-expert').isVisible(),false);await panel.locator('#beginner-submit').click();await panel.locator('#beginner-files input').check();await panel.locator('#beginner-summary').fill('调整颜色');await panel.locator('#beginner-manual').check();await panel.locator('#beginner-confirm').click();await panel.locator('#beginner-message').filter({hasText:'等待团队审核'}).waitFor();
 assert.equal(await panel.evaluate(()=>mockHost.calls.errands.length),0);assert.equal(await panel.evaluate(()=>mockHost.calls.inspections.filter(r=>r.method==='project/git'&&r.params.action==='beginner-submit').length),1);
 await panel.locator('#advanced-mode').click();await panel.locator('.tool[aria-disabled="false"]').nth(4).waitFor();await panel.locator('#basic-mode').click();
 for(const width of [320,860])for(const theme of ['light','dark']){await panel.setViewportSize({width,height:820});await panel.goto(base+'/panel.html?direct=1&theme='+theme);await panel.locator('#beginner-submit:not(:disabled)').waitFor();assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await panel.screenshot({path:join(root,'artifacts/beginner-cindy-'+width+'-'+theme+'.png'),fullPage:true});}
 const english=await context.newPage();await english.route('**/app-context',r=>r.fulfill({json:{context:{locale:'en'}}}));await english.goto(base+'/settings.html');await english.locator('#beginner-submit:not(:disabled)').waitFor();assert.match(await english.locator('#beginner-submit').textContent(),/Submit my changes/);assert.deepEqual(errors,[]);
 console.log('Passed: '+(process.env.JIXIN_DESKTOP_EXECUTABLE?'packaged':'source')+' Electron beginner selection/summary/confirm, auto branch/DCO/local-origin push/mock PR, durable receipt, cancellation; mock Cindy compound RPC/no AI; advanced workflows; 320/860 light/dark and English.');
} finally {await app?.close();await browser?.close();server?.kill();await rm(temp,{recursive:true,force:true});}
