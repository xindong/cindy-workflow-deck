import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
const plugin=resolve(process.env.JIXIN_PLUGIN_DIR || join(import.meta.dirname,'../plugin'));
const {gitWithHost}=await import(join(plugin,'git-host.js'));
const temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-recovery-ui-'))),project=join(temp,'project'),remote=join(temp,'origin.git');await mkdir(project);
const git=a=>execFileSync('git',['-C',project,...a],{encoding:'utf8'}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Recovery UI']);git(['config','user.email','test@example.test']);
await writeFile(join(project,'AGENTS.md'),'Keep hooks enabled.');git(['add','.']);git(['commit','-qm','initial']);
execFileSync('git',['init','-q','--bare',remote]);git(['remote','add','origin',remote]);git(['push','-qu','origin','main']);
let worker,id=0;const pending=new Map(),calls=[],errors=[];let failNext=false;
function start(){worker=spawn(process.execPath,[join(plugin,'node/inspect-project.cjs')],{stdio:['pipe','pipe','pipe']});worker.stderr.resume();createInterface({input:worker.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});}
function request(args){return new Promise(yes=>{const n=++id;pending.set(n,yes);worker.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...args})+'\n');});}
start();
const host={request:async args=>{const r=await request(args);assert.equal(r.error,undefined);return {ok:true,result:r.result};}};
const server=createServer(async(req,res)=>{try{let file=join(plugin,new URL(req.url,'http://local').pathname);const bytes=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end();}});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('gitTransport',async(method,p)=>{calls.push(p.action);if(failNext&&p.action==='beginner-update'){failNext=false;throw new Error('Simulated response uncertainty');}return gitWithHost(host,project,p);});
 // Load the real HTML unchanged; block only its automatic settings bootstrap.
 await page.route('**/settings.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/settings.html');
 await page.evaluate(async()=>{const {mountGit}=await import('/git-ui.js');mountGit({transport:{call:window.gitTransport},context:()=>({projectId:'test',revision:1,ready:true}),notice:()=>{}});});
 const ready=()=>page.locator('#git-refresh:not(:disabled)').waitFor();await page.locator('#beginner-update:not(:disabled)').waitFor();
 // An idle worker restart loses its in-memory tickets. Confirmation must refresh before writing.
 worker.kill();start();await page.locator('#beginner-update').click();await page.locator('#beginner-confirm').click();
 await page.locator('#beginner-message').filter({hasText:'已是团队最新版本'}).waitFor();await ready();assert.deepEqual(calls.slice(-3),['status','beginner-update','status']);
 // A changed rule must stop the write, not silently accept the new rules.
 await page.locator('#beginner-update').click();await writeFile(join(project,'AGENTS.md'),'New approval required.');let before=calls.filter(x=>x==='beginner-update').length;
 await page.locator('#beginner-confirm').click();await page.locator('#beginner-detail').filter({hasText:'STALE_REVIEW'}).waitFor({state:'attached'});assert.equal(calls.filter(x=>x==='beginner-update').length,before);
 await page.locator('#git-refresh').click();await ready();await page.locator('#beginner-confirm:not(:disabled)').waitFor();assert.doesNotMatch(await page.locator('#beginner-detail').textContent(),/STALE_REVIEW|PROTOCOL_ERROR/);
 // Repeated recoverable pre-write failures do not wedge the UI or automatically retry writes.
 for(let n=0;n<2;n++){failNext=true;await page.locator('#beginner-confirm').click();await page.locator('#beginner-detail').filter({hasText:'Simulated response uncertainty'}).waitFor({state:'attached'});await ready();before=calls.filter(x=>x==='beginner-update').length;await page.locator('#git-refresh').click();await ready();assert.equal(calls.filter(x=>x==='beginner-update').length,before);await page.locator('#beginner-confirm:not(:disabled)').waitFor();}
 await page.locator('#beginner-confirm').click();await page.locator('#beginner-message').filter({hasText:'已是团队最新版本'}).waitFor();await ready();
 // A real failed fetch is settled and before mutation: repair it, refresh, start a NEW attempt.
 git(['remote','set-url','origin',join(temp,'missing.git')]);await page.locator('#beginner-update').click();await page.locator('#beginner-confirm').click();
 await page.locator('#beginner-message').filter({hasText:'尚未暂存或修改本地文件'}).waitFor();await ready();assert.equal(JSON.parse(await readFile(join(project,'.git/jixin-beginner.json'),'utf8')).state,'blocked');
 git(['remote','set-url','origin',remote]);await page.locator('#git-refresh').click();await ready();await page.locator('#beginner-update').click();await page.locator('#beginner-confirm:not(:disabled)').waitFor();await page.locator('#beginner-confirm').click();await page.locator('#beginner-message').filter({hasText:'已是团队最新版本'}).waitFor();await ready();
 // Unknown post-mutation outcomes stay blocked after refresh.
 await writeFile(join(project,'.git/jixin-beginner.json'),JSON.stringify({id:randomUUID(),action:'beginner-update',state:'needs-verification',step:'restore',completed:['fetch','stash','merge'],stash:'backup'}));
 await page.locator('#git-refresh').click();await ready();await page.locator('#beginner-update').click();assert.equal(await page.locator('#beginner-confirm').isDisabled(),true);
 assert.equal(git(['status','--porcelain']),'M AGENTS.md');assert.equal(await readFile(join(project,'AGENTS.md'),'utf8'),'New approval required.');assert.deepEqual(errors,[]);console.log('PASS: worker restart; changed rules block writes; repeated failure/check/recovery; no automatic write replay; real fetch failure repair; uncertain restore remains blocked.');
}finally{await browser?.close();worker?.kill();await new Promise(yes=>server.close(yes));await rm(temp,{recursive:true,force:true});}
