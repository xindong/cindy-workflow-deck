import assert from 'node:assert/strict';
import {_electron,chromium} from 'playwright-core';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),temp=await mkdtemp(join(tmpdir(),'jixin-git-ui-')),project=join(await realpath(temp),'project');await mkdir(project);
const git=args=>execFileSync('git',['-C',project,...args],{encoding:'utf8'}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Git UI Fixture']);git(['config','user.email','fixture@example.test']);
await writeFile(join(project,'AGENTS.md'),'Use Conventional Commits. DCO required. Main requires PR.');git(['add','.']);git(['commit','-qm','chore: initial']);
await writeFile(join(project,'new.txt'),'working copy');
await mkdir(join(root,'artifacts'),{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app,browser,server;const errors=[];
try {
 app=await _electron.launch({executablePath:process.env.JIXIN_DESKTOP_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[...(process.env.JIXIN_DESKTOP_EXECUTABLE?[]:[join(root,'desktop/main.cjs')]),'--jixin-user-data',join(temp,'data')],cwd:root,env});
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.locator('#add:not(:disabled)').waitFor();await page.locator('#add').click();await page.locator('#directory').fill(project);await page.locator('#save').click();await page.locator('#notice').filter({hasText:'项目已保存'}).waitFor();
 await page.locator('#git-tab').click();await page.locator('#git-refresh').click();await page.locator('#git-state').filter({hasText:'main'}).waitFor();
 await page.locator('#git-confirm').check();assert.equal(await page.locator('[data-git="commit"]').isDisabled(),true);assert.equal(await page.locator('[data-git="push"]').isDisabled(),true);
 await page.screenshot({path:join(root,'artifacts/git-main-protected.png'),fullPage:true});
 await page.locator('#git-branch').fill('feature/ui');await page.locator('[data-git="branch-create"]').click();await page.locator('#git-state').filter({hasText:'feature/ui'}).waitFor();
 await page.locator('#git-confirm').check();await page.locator('#git-files input').check();await page.locator('[data-git="stage"]').click();await page.locator('#git-files span').filter({hasText:'A  new.txt'}).waitFor();
 await page.locator('#git-confirm').check();await page.locator('#git-message').fill('feat: git UI acceptance');await page.locator('[data-git="commit"]').click();await page.locator('#git-state').filter({hasText:'0 个改动'}).waitFor();
 assert.match(git(['log','-1','--format=%B']),/Signed-off-by: Git UI Fixture/);
 await page.setViewportSize({width:320,height:780});await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(root,'artifacts/git-narrow-dark.png'),fullPage:true});
 await app.close();app=null;
 server=spawn('python3',[join(root,'tests/serve-preview.py')],{stdio:['ignore','pipe','inherit']});const base=await new Promise((yes,no)=>{server.stdout.once('data',b=>yes(b.toString().trim()));server.once('error',no);});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:360,height:780}});const panel=await context.newPage();panel.on('pageerror',e=>errors.push(e.message));await panel.goto(base+'/panel.html?direct=1');await panel.locator('#add:not(:disabled)').waitFor();
 assert.equal(await panel.locator('#basic-view').isVisible(),true);await panel.locator('#add').click();await panel.locator('#pick-directory').click();await panel.locator('#save').click();await panel.locator('#notice').filter({hasText:'项目已保存'}).waitFor();
 await panel.locator('#advanced-mode').click();await panel.locator('.tool[aria-disabled="false"]').nth(4).waitFor();await panel.locator('#basic-mode').click();await panel.locator('#git-tab').click();await panel.locator('#git-refresh').click();await panel.locator('#git-state').filter({hasText:'main'}).waitFor();assert.equal(await panel.locator('[data-git="commit"]').isDisabled(),true);assert.equal(await panel.evaluate(()=>mockHost.calls.errands.length),0);
 for(const width of [320,860]) {await panel.setViewportSize({width,height:780});for(const colorScheme of ['light','dark']) {await panel.emulateMedia({colorScheme});assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await panel.screenshot({path:join(root,'artifacts/git-cindy-'+width+'-'+colorScheme+'.png'),fullPage:true});}}
 assert.deepEqual(errors,[]);console.log('Passed: real Electron Git branch/stage/commit + DCO, main gate, Cindy basic/advanced and status RPC, no AI dispatch, light/dark 320/860px.');
} finally {await app?.close();await browser?.close();server?.kill();await rm(temp,{recursive:true,force:true});}
