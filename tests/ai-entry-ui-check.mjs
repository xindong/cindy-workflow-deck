import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');let server,browser;
try {
 server=spawn('python3',['tests/serve-preview.py'],{cwd:root,stdio:['ignore','pipe','inherit']});const base=await new Promise((yes,no)=>{server.stdout.once('data',b=>yes(b.toString().trim()));server.once('error',no);});
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.goto(base+'/panel.html?direct=1');await page.locator('#beginner-diagnose:not(:disabled)').waitFor();
 await page.evaluate(()=>mockHost.deliver({type:'tool-call',tool:'diagnose_issue',callId:'real-diagnosis-entry',args:{requestId:'diagnosis-entry-0001',problem:'为什么更新失败？'}}));
 await page.waitForFunction(()=>mockHost.calls.results.some(r=>r.callId==='real-diagnosis-entry'));
 const diagnosis=await page.evaluate(()=>mockHost.calls.results.find(r=>r.callId==='real-diagnosis-entry'));
 assert.equal(diagnosis.ok,true);assert.equal(diagnosis.result.state,'completed');assert.match(diagnosis.result.text,/原因/);assert.equal(diagnosis.result.packet,undefined);
 await page.evaluate(()=>mockHost.deliver({type:'tool-call',tool:'assist_update_conflict',callId:'real-conflict-entry',args:{action:'start',requestId:'conflict-entry-0001',instructions:'只读检查，不修改文件。'}}));
 await page.waitForFunction(()=>mockHost.calls.results.some(r=>r.callId==='real-conflict-entry'));
 const repair=await page.evaluate(()=>mockHost.calls.results.find(r=>r.callId==='real-conflict-entry'));
 assert.equal(repair.ok,true);assert.equal(repair.result.state,'running');
 const request=await page.evaluate(()=>mockHost.calls.errands.at(-1));assert.equal(request.callId,'real-conflict-entry');assert.ok(request.workingDir);assert.match(request.task,/只读检查，不修改文件/);
 await page.evaluate(()=>mockHost.deliver({type:'tool-call',tool:'assist_update_conflict',callId:'retry-conflict-entry',args:{action:'start',requestId:'conflict-entry-0001',instructions:'只读检查，不修改文件。'}}));
 await page.waitForFunction(()=>mockHost.calls.results.some(r=>r.callId==='retry-conflict-entry'));assert.equal(await page.evaluate(()=>mockHost.calls.errands.length),1);
 console.log('PASS: public diagnosis/repair tools use production runtime; no snapshot in diagnosis result; exact Host callId and project forwarded; duplicate request does not dispatch again. Host SDK replies simulated; live installation validated separately.');
} finally {await browser?.close();server?.kill();}
