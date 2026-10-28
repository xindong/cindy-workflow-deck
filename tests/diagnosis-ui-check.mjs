import assert from 'node:assert/strict';
import {_electron,chromium} from 'playwright-core';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(import.meta.dirname,'..'),temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-diagnosis-ui-'))),project=join(temp,'project');await mkdir(project);
const git=args=>execFileSync('git',['-C',project,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);
await writeFile(join(project,'AGENTS.md'),'Keep hooks enabled.');git(['add','.']);git(['commit','-qm','initial']);await writeFile(join(project,'asset.txt'),'local art');await writeFile(join(project,'.env'),'TOP_SECRET_ENV=never-send-this');
const head=git(['rev-parse','HEAD']),status=git(['status','--porcelain']);let app,browser,server;const errors=[];
const out=join(root,'artifacts/diagnosis');await mkdir(out,{recursive:true});
try{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:createRequire(import.meta.url)('electron'),args:[join(root,'desktop/main.cjs'),'--jixin-user-data',join(temp,'data')],cwd:root,env});
 const native=await app.firstWindow();native.on('pageerror',e=>errors.push(e.message));await native.locator('#quick-project:not(:disabled)').waitFor();
 await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);await native.locator('#quick-project').click();
 await native.locator('#beginner-diagnose:not(:disabled)').waitFor();await native.locator('#beginner-diagnose').click();
 await native.locator('#diagnosis-problem').fill('为什么不能更新项目？');await native.locator('#diagnosis-prepare').click();
 await native.locator('#diagnosis-preview:not([hidden])').waitFor();assert.match(await native.locator('#diagnosis-status').textContent(),/尚未接入 AI/);assert.equal(await native.locator('#diagnosis-send').isVisible(),false);
 const localPacket=JSON.parse(await native.locator('#diagnosis-packet').textContent());assert.equal(localPacket.project,project);assert.equal(localPacket.git.available,true);assert.equal(localPacket.git.changeCount,2);assert.equal(localPacket.git.changes.length,1);
 assert.ok(!(await native.locator('#diagnosis-packet').textContent()).includes('never-send-this'));
 await native.screenshot({path:join(out,'独立应用-本地诊断信息-AI未接入.png'),fullPage:true});
 assert.equal(git(['rev-parse','HEAD']),head);assert.equal(git(['status','--porcelain']),status);assert.equal(await readFile(join(project,'asset.txt'),'utf8'),'local art');await app.close();app=null;
 server=spawn('python3',['tests/serve-preview.py'],{cwd:root,stdio:['ignore','pipe','inherit']});const base=await new Promise((yes,no)=>{server.stdout.once('data',b=>yes(b.toString().trim()));server.once('error',no);});
 browser=await chromium.launch({headless:true});
 for(const lang of ['zh-CN','en']){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/app-context',r=>r.fulfill({json:{context:{locale:lang}}}));
  await page.goto(base+'/panel.html?direct=1');await page.locator('#quick-project:not(:disabled)').waitFor({state:'attached'});
  if(lang==='zh-CN')await page.locator('#quick-project').click();
  await page.locator('#beginner-diagnose:not(:disabled)').waitFor();assert.equal(await page.locator('.beginner-actions button').count(),4);
  for(const [width,theme]of [[320,'dark'],[860,'light']]){
   await page.setViewportSize({width,height:820});await page.goto(base+'/panel.html?direct=1&theme='+theme);await page.locator('#beginner-diagnose:not(:disabled)').waitFor();
   await page.locator('#beginner-diagnose').hover();await page.locator('#compact-tooltip:not([hidden])').waitFor();assert.match(await page.locator('#compact-tooltip').textContent(),lang==='en'?/No repairs/:/不会执行修复/);
   await page.locator('#beginner-diagnose').click();await page.locator('#diagnosis-problem').fill(lang==='en'?'Why did update fail?':'为什么更新失败？');
   await page.locator('#diagnosis-failure').fill('https://artist:password@example.test/repo?token=do-not-send API_KEY=private-test-key');
   await page.locator('#diagnosis-prepare').click();await page.locator('#diagnosis-preview:not([hidden])').waitFor();assert.equal(await page.evaluate(()=>mockHost.calls.inferences.length),0);
   const packet=await page.locator('#diagnosis-packet').textContent();assert.ok(!packet.includes('private-test-key'));assert.ok(!packet.includes('do-not-send'));assert.ok(!packet.includes('artist:password'));assert.ok(!packet.includes('mock-review-token'));
   assert.equal(await page.locator('#diagnosis-send').isEnabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const dock=await page.locator('#compact-footer .dock').boundingBox();assert.ok(Math.abs(dock.x+dock.width/2-width/2)<2);
   await page.screenshot({path:join(out,'AI诊断-发送前预览-'+lang+'-'+width+'-'+theme+'.png'),fullPage:true});
   await page.locator('#diagnosis-send').click();await page.locator('#diagnosis-result').filter({hasText:'已知事实'}).waitFor();assert.equal(await page.evaluate(()=>mockHost.calls.inferences.length),1);
   const request=await page.evaluate(()=>mockHost.calls.inferences[0]);assert.equal(request.kind,'oneshot_text');assert.equal(request.maxTokens,2500);assert.ok(request.prompt.includes(packet));
   assert.match(await page.locator('#diagnosis-ai').textContent(),/fixture-model-not-real-inference/);await page.locator('#diagnosis-check').click();await page.locator('#diagnosis-check:not(:disabled)').waitFor();assert.equal(await page.evaluate(()=>mockHost.calls.inferences.length),1);
   await page.screenshot({path:join(out,'AI诊断-模拟结果-'+lang+'-'+width+'-'+theme+'.png'),fullPage:true});
   assert.equal(await page.evaluate(()=>mockHost.calls.errands.length),0);assert.equal(await page.evaluate(()=>mockHost.calls.inspections.some(r=>r.method==='project/git'&&!['status','diagnosis-status','prepare'].includes(r.params.action))),false);
  }
  const inferenceCount=await page.evaluate(()=>mockHost.calls.inferences.length);
  await page.locator('#config-tab').click();await page.evaluate(()=>mockHost.options.pickPath='/preview/history-flows');
  await page.locator('#choose-workflow-directory').click();await page.locator('#notice').filter({hasText:lang==='en'?'Workflow folder saved':'流程目录已保存'}).waitFor();
  await page.locator('#git-tab').click();await page.locator('#beginner-diagnose:not(:disabled)').click();await page.locator('#diagnosis-check').click();
  await page.locator('#diagnosis-result').filter({hasText:'已知事实'}).waitFor();
  assert.match(await page.locator('#diagnosis-status').textContent(),lang==='en'?/snapshot from before/:/配置变更前的诊断快照/);
  assert.equal(await page.evaluate(()=>mockHost.calls.inferences.length),inferenceCount);
  // An explicit provider error is readable, while its code remains in details.
  await page.evaluate(()=>{mockHost.options.inferenceFailure='NO_CANDIDATE';});await page.locator('#diagnosis-prepare').click();await page.locator('#diagnosis-send:not(:disabled)').waitFor();await page.locator('#diagnosis-send').click();
  await page.locator('#diagnosis-status').filter({hasText:'没有可用的 AI'}).waitFor();assert.equal(await page.locator('#diagnosis-result').textContent(),'');assert.ok(!(await page.locator('#diagnosis-status').textContent()).includes('NO_CANDIDATE'));assert.match(await page.locator('#diagnosis-error-details').textContent(),/NO_CANDIDATE/);
  await page.evaluate(()=>{mockHost.options.inferenceFailure='';mockHost.options.inferenceLost=true;});await page.locator('#diagnosis-prepare').click();await page.locator('#diagnosis-send:not(:disabled)').waitFor();await page.locator('#diagnosis-send').click();await page.locator('#diagnosis-status').filter({hasText:'回执未确认'}).waitFor();
  const count=await page.evaluate(()=>mockHost.calls.inferences.length);await page.locator('#diagnosis-check').click();await page.locator('#diagnosis-check:not(:disabled)').waitFor();assert.equal(await page.evaluate(()=>mockHost.calls.inferences.length),count);
  await page.evaluate(()=>{mockHost.options.inferenceLost=false;mockHost.options.failNode=true;});
  await page.locator('#git-refresh').click();await page.locator('#diagnosis-from-error:not([hidden]):not(:disabled)').waitFor();
  assert.equal(await page.locator('#beginner-diagnose').isEnabled(),true);await page.locator('#diagnosis-from-error').click();assert.ok((await page.locator('#diagnosis-failure').inputValue()).length>0);
  await page.locator('#diagnosis-prepare').click();await page.locator('#diagnosis-send:not(:disabled)').waitFor();
  assert.equal(JSON.parse(await page.locator('#diagnosis-packet').textContent()).git.available,false);
  await page.evaluate(()=>document.dispatchEvent(new Event('configuration-invalidated')));assert.equal(await page.locator('#diagnosis-panel').isVisible(),false);assert.equal(await page.locator('#diagnosis-result').textContent(),'');
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: real standalone Electron + isolated Git local diagnosis/no AI degradation/no project writes; real plugin runtime/BroadcastChannel/oneshot request, confirmation/redaction/results/model/error/lost-reply no replay, 320 dark/860 light and zh/en. AI Host response is simulated, not a real inference or installed Cindy verification.');
}finally{await app?.close();await browser?.close();server?.kill();await rm(temp,{recursive:true,force:true});}
