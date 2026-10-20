import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { _electron, chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright-core');
async function awaitCondition(page, fn) {
  const end = Date.now() + 15000;
  while (Date.now() < end) { if (await page.evaluate(fn)) return; await new Promise(resolve => setTimeout(resolve, 40)); }
  throw new Error('Timed out waiting for page state: ' + fn);
}
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const root = resolve(import.meta.dirname,'..');
const temporary = await mkdtemp(join(tmpdir(),'jixin-dual-ui-'));
const project = join(await realpath(temporary),'project'); await mkdir(project);
await mkdir(join(project,'instructions')); await writeFile(join(project,'instructions/start.md'),'Do not execute project commands.');
execFileSync('git',['init','-q',project]);await writeFile(join(project,'AGENTS.md'),'Respect project hooks and rules.');
await mkdir(join(root,'artifacts'),{recursive:true});
let app, browser, server;
const errors=[];
try {
  const executablePath = process.env.JIXIN_DESKTOP_EXECUTABLE || createRequire(import.meta.url)('electron');
  const args=process.env.JIXIN_DESKTOP_EXECUTABLE ? ['--jixin-user-data',join(temporary,'app-data')] : [join(root,'desktop/main.cjs'),'--jixin-user-data',join(temporary,'app-data')];
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath,args,cwd:root,env,timeout:30000});
  if (process.env.JIXIN_DESKTOP_EXECUTABLE) {
    assert.equal(await app.evaluate(({app})=>app.getVersion()),JSON.parse(await readFile(join(root,'package.json'),'utf8')).version);
    assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
  }
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#add:not(:disabled)').waitFor();
  assert.equal(await page.evaluate(()=>typeof globalThis.cindy),'undefined');
  assert.equal(await page.evaluate(()=>typeof globalThis.require),'undefined');
  await page.locator('#add').click();await page.locator('#project-name').fill('独立项目');await page.locator('#directory').fill(project);
  for(const id of ['experiment','feature','tooling','pr','merge'])await page.locator('#flow-'+id).fill(id==='feature'?'instructions/start.md':'');
  await page.locator('#save').click();await awaitCondition(page,()=>!document.getElementById('inspect').disabled);
  await page.locator('#inspect').click();await awaitCondition(page,()=>document.getElementById('inspection').textContent.split(String.fromCharCode(92)).join('/').includes('instructions/start.md'));
  assert.ok((await page.locator('#inspection').textContent()).includes('AGENTS.md'));
  const inspection = await page.evaluate(async () => {
    const state = await globalThis.jixinDesktop.request('config-read');
    return globalThis.jixinDesktop.request('config-inspect', {projectId: state.configuration.activeProjectId});
  });
  assert.equal(inspection.git.available,true,JSON.stringify(inspection));
  assert.equal(inspection.workflows.feature.source,join(project,'instructions','start.md'));
  await page.reload();await page.locator('#project-name').waitFor();await awaitCondition(page,()=>document.getElementById('project-name').value==='独立项目');
  assert.equal(await page.locator('#flow-feature').inputValue(),'instructions/start.md');
  await page.locator('#flow-feature').fill('../escape.md');await page.locator('#save').click();await awaitCondition(page,()=>document.getElementById('notice').textContent.includes('INVALID_CONFIGURATION'));
  assert.equal(JSON.parse(await readFile(join(temporary,'app-data/projects.json'),'utf8')).projectConfiguration.revision,1);
  await page.locator('#flow-feature').fill('instructions/start.md');await page.locator('#save').click();await awaitCondition(page,()=>!document.getElementById('inspect').disabled);
  await page.screenshot({path:join(root,'artifacts/standalone-configuration.png'),fullPage:true});
  await app.close();app=null;
  console.log('Native desktop: no Cindy bridge, sandboxed UI, real Git inspection, persisted/reloaded config and traversal rejection passed.');
  assert.deepEqual(errors,[]);
  await writeFile(join(root,'artifacts/desktop-smoke.json'),JSON.stringify({platform:process.platform,arch:process.arch,version:JSON.parse(await readFile(join(root,'package.json'),'utf8')).version,packaged:!!process.env.JIXIN_DESKTOP_EXECUTABLE,checks:['launch','no-cindy-bridge','no-renderer-node','git-inspection','configuration-save','configuration-reload','traversal-rejected'],passed:true},null,2));
  if (!process.env.JIXIN_NATIVE_ONLY) {
  server=spawn('python3',[join(root,'tests/serve-preview.py')],{stdio:['ignore','pipe','inherit']});
  const base=await new Promise((yes,no)=>{server.stdout.once('data',data=>yes(data.toString().trim()));server.once('error',no);});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:400,height:780}});
  const panel=await context.newPage();panel.on('pageerror',e=>errors.push(e.message));await panel.goto(base+'/panel.html');await panel.locator('#source-card button').waitFor();
  const settings=await context.newPage();settings.on('pageerror',e=>errors.push(e.message));await settings.goto(base+'/settings.html');await settings.locator('#add:not(:disabled)').waitFor();
  await settings.locator('#add').click();await settings.locator('#project-name').fill('Cindy配置');await settings.locator('#pick-directory').click();await awaitCondition(settings,()=>document.getElementById('directory').value==='/preview/selected-project');
  await settings.locator('#flow-feature').fill('instructions/custom.md');await settings.locator('#save').click();await awaitCondition(settings,()=>!document.getElementById('inspect').disabled);
  assert.equal(await panel.evaluate(()=>mockHost.calls.agentRuns.length),0);
  const second=await context.newPage();await second.goto(base+'/settings.html');await awaitCondition(second,()=>document.getElementById('project-name').value==='Cindy配置');
  await settings.locator('#project-name').fill('配置更新');await settings.locator('#save').click();await awaitCondition(settings,()=>!document.getElementById('inspect').disabled);
  await second.locator('#project-name').fill('冲突版本');await second.locator('#save').click();await awaitCondition(second,()=>document.getElementById('notice').textContent.includes('CONFIG_CONFLICT'));
  await settings.reload();await awaitCondition(settings,()=>document.getElementById('project-name').value==='配置更新');
  assert.equal(await settings.locator('#flow-feature').inputValue(),'instructions/custom.md');
  await settings.screenshot({path:join(root,'artifacts/cindy-settings-configuration.png'),fullPage:true});
  assert.equal(await settings.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await panel.locator('#source-card button').click();await panel.locator('#binding-result-1').waitFor();
  await settings.locator('#inspect').click();await awaitCondition(settings,()=>document.getElementById('inspection').textContent.includes('/preview/selected-project'));
  assert.equal(await panel.evaluate(()=>mockHost.calls.inspections.at(-1).params.project.workflows.feature.path),'instructions/custom.md');
  await settings.emulateMedia({colorScheme:'dark'});await settings.setViewportSize({width:280,height:780});
  assert.equal(await settings.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await settings.screenshot({path:join(root,'artifacts/cindy-settings-narrow-dark.png'),fullPage:true});
  const english=await context.newPage();await english.route('**/app-context',route=>route.fulfill({json:{context:{locale:'en'}}}));await english.goto(base+'/settings.html');await awaitCondition(english,()=>document.documentElement.lang==='en');assert.equal(await english.locator('#save').textContent(),'Save configuration');
  assert.deepEqual(errors,[]);
  console.log('Cindy settings (mock Host): real runtime/BroadcastChannel, directory picking, reload, concurrent conflict, custom-path dispatch inspection, zh/en and narrow/dark passed.');
  }
} finally {if(app)await app.close();if(browser)await browser.close();if(server)server.kill();await rm(temporary,{recursive:true,force:true});}
