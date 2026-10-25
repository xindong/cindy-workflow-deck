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
await writeFile(join(temp,'角色.txt'),'fixture');
const worker=spawn(process.execPath,[join(plugin,'node/worker-entry.cjs')],{stdio:['pipe','pipe','pipe']}),pending=new Map(),lineBytes=[],actions=[];let id=0,browser;
worker.stderr.resume();createInterface({input:worker.stdout}).on('line',line=>{lineBytes.push(Buffer.byteLength(line)+1);const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});
const host={request:async options=>{const n=++id,answer=new Promise(yes=>pending.set(n,yes));worker.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...options})+'\n');const r=await answer;return r.error?{ok:false,error:r.error}:{ok:true,result:r.result};}};
const server=createServer(async(req,res)=>{try{const name=join(plugin,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[extname(name)]||'application/octet-stream');res.end(await readFile(name));}catch{res.statusCode=404;res.end();}});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('gitTransport',async(method,params)=>{actions.push(params.action);return gitWithHost(host,temp,params);});
 await page.route('**/settings.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/panel.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');
 await page.evaluate(async()=>{const {mountGit}=await import('/git-ui.js');mountGit({transport:{call:async(method,p)=>{try{return await window.gitTransport(method,p);}catch(e){throw Object.assign(new Error(e.message),{code:e.message.includes('Node stdout')?'PROTOCOL_ERROR':e.code});}}},context:()=>({projectId:'test',revision:1,ready:true}),notice:()=>{}});});
 await page.locator('#beginner-view:not(:disabled)').waitFor();
 const out=resolve(process.env.JIXIN_AVAILABILITY_EVIDENCE||'artifacts/availability');await mkdir(out,{recursive:true});
 for(const [width,scheme] of [[320,'dark'],[860,'light']]) {
  await page.setViewportSize({width,height:720});
  await page.addStyleTag({content:':root{--text-primary:'+(scheme==='dark'?'#ededed':'#262626')+';--text-secondary:'+(scheme==='dark'?'#a3a3a3':'#737373')+';--surface-elevated:'+(scheme==='dark'?'#242424':'#fff')+';--surface:'+(scheme==='dark'?'#191919':'#f7f7f5')+';--panel-bg:var(--surface);--border-default:'+(scheme==='dark'?'#454545':'#ddd')+';--surface-chip:'+(scheme==='dark'?'#383838':'#eee')+';color-scheme:'+scheme+'}'});
  const styles=()=>page.locator('#compact-footer .compact-icon:visible').evaluateAll(items=>items.map(e=>({id:e.id,color:getComputedStyle(e).color,opacity:getComputedStyle(e).opacity,disabled:e.disabled})));
  let buttons=await styles(),advanced=buttons.find(b=>b.id==='advanced-mode');
  for(const button of buttons.filter(b=>!b.disabled)){assert.equal(button.color,advanced.color,button.id);assert.equal(button.opacity,'1',button.id);}
  await page.mouse.move(0,0);await page.locator('#compact-footer').screenshot({path:join(out,'可用按钮同亮-'+width+'-'+scheme+'.png')});
  // Use real status refresh to verify loading disables controls, then restores brightness.
  await page.evaluate(()=>document.getElementById('beginner-update').disabled=true);
  buttons=await styles();const disabled=buttons.find(b=>b.id==='beginner-update');
  assert.equal(disabled.opacity,'0.35');assert.notEqual(disabled.color,advanced.color);
  await page.locator('#git-refresh').click();await page.locator('#beginner-update:not(:disabled)').waitFor();
  buttons=await styles();assert.equal(buttons.find(b=>b.id==='beginner-update').color,advanced.color);
  assert.equal(buttons.find(b=>b.id==='beginner-update').opacity,'1');
  await page.locator('#beginner-view').click();await page.locator('#beginner-refresh-changes:not(:disabled)').waitFor();
  buttons=await styles();for(const button of buttons.filter(b=>!b.disabled))assert.equal(button.color,advanced.color);
  await page.locator('#beginner-cancel').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 assert.ok(actions.every(a=>a==='status'));assert.deepEqual(errors,[]);
 console.log('PASS: real panel modules and worker; all enabled icons match Advanced color and full opacity, disabled icons dim, status refresh restores enabled brightness; 320 dark / 860 light no overflow. Simulated Host boundary, not installed Cindy.');
}finally{await browser?.close();worker.kill();await new Promise(yes=>server.close(yes));await rm(temp,{recursive:true,force:true});}
