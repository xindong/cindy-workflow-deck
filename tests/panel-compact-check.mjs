import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const server=spawn('python3',['tests/serve-preview.py'],{stdio:['ignore','pipe','inherit']});
let browser;
try {
 const base=await new Promise((yes,no)=>{server.stdout.once('data',b=>yes(b.toString().trim()));server.once('error',no);});
 browser=await chromium.launch({headless:true});
 await mkdir('artifacts',{recursive:true});
 for(const lang of ['zh-CN','en']) {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/app-context',r=>r.fulfill({json:{context:{locale:lang}}}));
  await page.goto(base+'/panel.html?direct=1');await page.locator('#add:not(:disabled)').waitFor({state:'attached'});
  if(lang==='zh-CN') {if(!await page.locator('#config-view').isVisible())await page.locator('#config-tab').click();await page.locator('#project-manager').evaluate(e=>e.open=true);await page.locator('#project-manager').evaluate(e=>e.open=true);await page.locator('#add').click();await page.locator('#pick-directory').click();await page.locator('#save').click();}
  if(await page.locator('#git-tab').isVisible())await page.locator('#git-tab').click();await page.locator('#beginner-submit:not(:disabled)').waitFor();
  for(const width of [120,320,860])for(const theme of ['light','dark']) {
   await page.setViewportSize({width,height:820});await page.goto(base+'/panel.html?direct=1&theme='+theme);
   await page.locator('#beginner-submit:not(:disabled)').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const dock=await page.locator('#compact-footer .dock').boundingBox();
   assert.equal(await page.locator('.dock').count(),1);
   assert.ok(dock.y+dock.height>780&&dock.height<180,JSON.stringify(dock));
   assert.ok(Math.abs(dock.x+dock.width/2-width/2)<2,JSON.stringify(dock));
   assert.equal(await page.locator('#basic-view>nav').isVisible(),false);
   for(const id of ['advanced-mode','config-tab','beginner-update','beginner-view','beginner-submit','git-refresh']) {
    assert.equal(await page.locator('#'+id+' svg').count(),1);
    const r=await page.locator('#'+id).boundingBox();assert.ok(r.width<=36&&r.height<=36);
    await page.locator('#'+id).hover();await page.locator('#compact-tooltip:not([hidden])').waitFor();
    const t=await page.locator('#compact-tooltip').boundingBox();assert.ok(t.x>=0&&t.x+t.width<=width+1);
    assert.ok(t.y+t.height<=r.y+1,JSON.stringify({tip:t,button:r}));
    if(id==='beginner-submit'&&width===320&&lang==='zh-CN')await page.screenshot({path:'artifacts/bottom-capsule-tooltip-'+theme+'.png',fullPage:true});
    await page.keyboard.press('Escape');assert.equal(await page.locator('#compact-tooltip').isVisible(),false);
   }
   assert.equal(await page.evaluate(()=>mockHost.calls.errands.length),0);
   assert.equal(await page.evaluate(()=>mockHost.calls.inspections.some(r=>r.method==='project/git'&&['beginner-update','beginner-submit'].includes(r.params.action))),false);
   await page.screenshot({path:'artifacts/compact-dock-'+lang+'-'+width+'-'+theme+'.png',fullPage:true});
  }
  await page.locator('#beginner-submit').click();await page.locator('#beginner-all').click();await page.locator('#beginner-none').click();assert.equal(await page.locator('#beginner-files input:checked').count(),0);await page.locator('#beginner-cancel').click();
  await page.locator('#advanced-mode').click();assert.equal(await page.locator('#toolbar .tool').count(),5);
  assert.equal(await page.locator('#toolbar').isVisible(),true);assert.equal(await page.locator('.beginner-actions').isVisible(),false);
  const advancedDock=await page.locator('#compact-footer .dock').boundingBox();assert.ok(advancedDock.y>720);
  await page.locator('#basic-mode').hover();await page.locator('#compact-tooltip:not([hidden])').waitFor();
  await page.screenshot({path:'artifacts/compact-advanced-'+lang+'.png',fullPage:true});
  await page.locator('#basic-mode').click();
  await page.locator('#config-tab').click();await page.locator('#project-manager').evaluate(e=>e.open=true);assert.equal(await page.locator('#config-view').isVisible(),true);
  await page.locator('#config-tab').click();await page.locator('#project-manager').evaluate(e=>e.open=true);assert.equal(await page.locator('#git-view').isVisible(),true);
  await page.locator('#beginner-submit').focus();await page.locator('#compact-tooltip:not([hidden])').waitFor();
  assert.match(await page.locator('#compact-tooltip').textContent(),lang==='en'?/Choose files/:/文件选择/);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Passed: single bottom-centred capsule geometry, compact icon sizes, 120/320/860 light/dark, Chinese/English hover/focus/Escape, no hover writes/tasks, bulk selection and five advanced icons.');
}finally{await browser?.close();server.kill();}
