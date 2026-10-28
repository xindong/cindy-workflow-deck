import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const server=spawn('python3',['tests/serve-preview.py'],{stdio:['ignore','pipe','inherit']});
let browser;
try {
 const base=await new Promise((yes,no)=>{server.stdout.once('data',b=>yes(b.toString().trim()));server.once('error',no);});
 browser=await chromium.launch({headless:true});await mkdir('artifacts',{recursive:true});
 for(const lang of ['zh-CN','en'])for(const width of [320,860])for(const theme of ['light','dark']) {
  const page=await browser.newPage({bypassCSP:true,viewport:{width,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.request.put(base+'/kv',{data:{projectConfiguration:{revision:1,configuration:{schemaVersion:1,activeProjectId:'p',projects:[{id:'p',directory:'/preview/selected-project',workflowDirectory:'/preview/flows',discovery:'auto'}]}}}});
  await page.route('**/app-context',r=>r.fulfill({json:{context:{locale:lang}}}));
  await page.goto(base+'/panel.html?direct=1&theme='+theme);await page.locator('#advanced-mode').click();
  const ue=page.locator('[data-workflow=ue-update]');await ue.waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-workflow=feature]').getAttribute('aria-disabled')==='false');
  assert.equal(await ue.getAttribute('aria-disabled'),'true');
  await ue.hover();await page.locator('#tooltip:not([hidden])').waitFor();
  assert.match(await page.locator('#tip-reason').textContent(),/UPDATE_UE5.md/);
  await ue.focus();assert.equal(await page.locator('#tooltip').isVisible(),true);
  // aria-disabled retains focus and tooltip events. Force only bypasses Playwright's disabled check.
  await ue.click({force:true});assert.equal(await page.evaluate(()=>mockHost.calls.errands.length),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'artifacts/ue-disabled-'+lang+'-'+width+'-'+theme+'.png',fullPage:true});
  await page.evaluate(()=>{mockHost.options.ueFile=true;});await page.locator('#refresh').click();
  await page.waitForFunction(()=>document.querySelector('[data-workflow=ue-update]').getAttribute('aria-disabled')==='false');
  await ue.hover();assert.match(await page.locator('#tip-action').textContent(),lang==='zh-CN'?/磁盘空间.*预计耗时.*确认/:/disk space.*duration.*confirmation/);
  await ue.click();await page.waitForFunction(()=>mockHost.calls.errands.length===1);
  const call=await page.evaluate(()=>mockHost.calls.errands[0]);assert.equal(call.workingDir,'/preview/selected-project');
  assert.ok(call.task.includes('/preview/flows/UPDATE_UE5.md'));assert.ok(call.task.includes('请求明确确认'));
  await page.evaluate(()=>{mockHost.options.jobStatus='done';mockHost.options.ueFile=false;mockHost.advanceTime();});
  await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('[data-workflow=feature]').getAttribute('aria-disabled')==='false');
  assert.equal(await ue.getAttribute('aria-disabled'),'true');await ue.click({force:true});
  assert.equal(await page.evaluate(()=>mockHost.calls.errands.length),1);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('UE UI passed: 320/860 light/dark zh/en, disabled hover/focus/click, root source, real service dispatch with simulated Host, refresh/removal, no duplicate tasks. No real engine update executed.');
} finally {await browser?.close();server.kill();}
