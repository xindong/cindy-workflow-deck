import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {gitWithHost} from '../plugin/git-host.js';
const plugin=resolve(import.meta.dirname,'../plugin'),temp=await mkdtemp(join(tmpdir(),'jixin-readable-ui-'));
execFileSync('git',['init','-q',temp]);
const unit='规则 "路径" \\\n',body=unit.repeat(Math.floor(110000/Buffer.byteLength(unit)));let links='';
for(let i=0;i<9;i++){await writeFile(join(temp,'rule'+i+'.md'),body);links+='[规则](rule'+i+'.md)\n';}await writeFile(join(temp,'AGENTS.md'),links);
const worker=spawn(process.execPath,[join(plugin,'node/worker-entry.cjs')],{stdio:['pipe','pipe','pipe']}),pending=new Map(),lineBytes=[],actions=[];let id=0,browser,fail=true;
worker.stderr.resume();createInterface({input:worker.stdout}).on('line',line=>{lineBytes.push(Buffer.byteLength(line)+1);const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});
const host={request:async options=>{const n=++id,answer=new Promise(yes=>pending.set(n,yes));worker.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...options})+'\n');const r=await answer;return r.error?{ok:false,error:r.error}:{ok:true,result:r.result};}};
const server=createServer(async(req,res)=>{try{const name=join(plugin,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[extname(name)]||'application/octet-stream');res.end(await readFile(name));}catch{res.statusCode=404;res.end();}});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('gitTransport',async(method,params)=>{actions.push(params.action);if(fail)throw Object.assign(new Error('Node stdout 单行超过 1MB'),{code:'PROTOCOL_ERROR'});return gitWithHost(host,temp,params);});
 await page.route('**/settings.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/settings.html');
 // Simulate Host rejection at the boundary, retaining its actual error shape.
 await page.evaluate(async()=>{const {mountGit}=await import('/git-ui.js');mountGit({transport:{call:async(method,p)=>{try{return await window.gitTransport(method,p);}catch(e){throw Object.assign(new Error(e.message),{code:e.message.includes('Node stdout')?'PROTOCOL_ERROR':e.code});}}},context:()=>({projectId:'test',revision:1,ready:true}),notice:()=>{}});});
 await page.locator('#beginner-message').filter({hasText:'项目信息较多'}).waitFor();
 const message=await page.locator('#beginner-message').textContent();assert.match(message,/升级插件/);assert.doesNotMatch(message,/PROTOCOL_ERROR|stdout/);assert.match(await page.locator('#beginner-detail').textContent(),/PROTOCOL_ERROR/);
 assert.equal(await page.locator('#beginner-result-details').getAttribute('open'),null);
 const out=resolve(process.env.JIXIN_ERROR_EVIDENCE||'artifacts/readable-errors');await mkdir(out,{recursive:true});
 for(const [width,scheme] of [[320,'dark'],[860,'light']]){await page.setViewportSize({width,height:820});await page.emulateMedia({colorScheme:scheme});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,'错误说明-'+width+'-'+scheme+'.png'),fullPage:true});}
 fail=false;await page.locator('#git-refresh').click();await page.locator('#beginner-view:not(:disabled)').waitFor();
 assert.equal(await page.locator('#git-rules details').count(),10);assert.equal(await page.locator('#git-rules details pre').nth(1).textContent(),body);
 assert.ok(lineBytes.every(n=>n<1024*1024));assert.ok(actions.every(a=>a==='status'));
 await page.locator('#beginner-view').click();await page.locator('#beginner-refresh-changes:not(:disabled)').waitFor();assert.equal(await page.locator('#beginner-files .beginner-file').count(),10);
 assert.deepEqual(errors,[]);console.log('PASS: real HTML 320 dark / 860 light readable error; collapsed technical details; real worker large-rule refresh recovers all 10 rules and files; zero write requests. Initial Host rejection is simulated, not an installed Cindy test.');
}finally{await browser?.close();worker.kill();await new Promise(yes=>server.close(yes));await rm(temp,{recursive:true,force:true});}
