import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {gitWithHost} from '../plugin/git-host.js';
import {createConflictService} from '../plugin/conflict-service.js';
import {updateConfiguration,newProject} from '../plugin/core/project-config.mjs';
const root=resolve(import.meta.dirname,'..'),plugin=join(root,'plugin');
const temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-conflict-ui-'))),project=join(temp,'project'),remote=join(temp,'origin.git');await mkdir(project);
const git=a=>execFileSync('git',['-C',project,...a],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
git(['init','-q','-b','main']);git(['config','user.name','Conflict Fixture']);git(['config','user.email','fixture@example.test']);
await writeFile(join(project,'AGENTS.md'),'Preserve project checks.');await writeFile(join(project,'hero.txt'),'base\n');git(['add','.']);git(['commit','-qm','initial']);
execFileSync('git',['init','-q','--bare',remote]);git(['remote','add','origin',remote]);git(['push','-qu','origin','main']);
const team=join(temp,'team');execFileSync('git',['clone','-q','-b','main',remote,team]);const teamGit=a=>execFileSync('git',['-C',team,...a],{encoding:'utf8'});
teamGit(['config','user.name','Team']);teamGit(['config','user.email','team@example.test']);await writeFile(join(team,'hero.txt'),'team\n');teamGit(['add','.']);teamGit(['commit','-qm','team update']);teamGit(['push','-q']);await writeFile(join(project,'hero.txt'),'local\n');
let worker,browser,server,id=0,taskState='running',loseDispatch=false;const pending=new Map(),calls=[],errors=[],aiCalls=[];
const out=join(root,'artifacts/conflict-guidance');await mkdir(out,{recursive:true});
try {
 worker=spawn(process.execPath,[join(plugin,'node/inspect-project.cjs')],{stdio:['pipe','pipe','pipe']});worker.stderr.resume();
 createInterface({input:worker.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});
 const host={request:args=>new Promise(yes=>{const n=++id;pending.set(n,r=>yes({ok:true,result:r.result}));worker.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,...args})+'\n');})};
 let data={projectConfiguration:updateConfiguration({},0,{projects:[{...newProject('one'),directory:project}],activeProjectId:'one'})};
 const service=createConflictService({store:{read:async()=>data,update:async fn=>Object.assign(data,fn(data))},git:(dir,p)=>gitWithHost(host,dir,p),agent:{errand:async args=>{aiCalls.push(args);if(loseDispatch)throw new Error('lost dispatch response');return {ok:true,jobId:'job',sessionId:'session'};},queryErrand:async()=>({ok:true,status:taskState})}});
 server=createServer(async(req,res)=>{try{const file=join(plugin,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(yes=>server.listen(0,'127.0.0.1',yes));browser=await chromium.launch({headless:true,...(process.env.JIXIN_BROWSER_EXECUTABLE?{executablePath:process.env.JIXIN_BROWSER_EXECUTABLE}:{})});const page=await browser.newPage({viewport:{width:320,height:760},colorScheme:'dark'});page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('transport',async(method,p)=>{calls.push(p.action||method);return method==='git-request'?gitWithHost(host,project,p):service(method,p);});
 await page.route('**/settings.js',r=>r.fulfill({contentType:'text/javascript',body:''}));await page.route('**/panel.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');await page.evaluate(async()=>{const {mountGit}=await import('/git-ui.js');mountGit({transport:{call:window.transport},context:()=>({projectId:'one',revision:1,ready:true}),notice:()=>{}});});
 await page.addStyleTag({content:':root{--panel-bg:#1f1f1e;--surface:#292928;--text-primary:#ededed;--text-secondary:#a3a3a3;--border-default:#525252; color-scheme:dark}'});
 await page.locator('#beginner-update:not(:disabled)').waitFor();await page.locator('#beginner-update').click();await page.locator('#beginner-confirm').click();
 await page.locator('#conflict-assist:not(:disabled)').waitFor();assert.equal(await readFile(join(project,'hero.txt'),'utf8'),'local\n');assert.equal(git(['diff','--name-only','--diff-filter=U']),'');
 // The conflict is real, but in the isolated rehearsal; no working-tree U exists.
 await page.locator('#conflict-assist').click();await page.locator('#conflict-dialog[open]').waitFor();await page.locator('#conflict-instructions').fill('美术资源先询问我');
 assert.equal(aiCalls.length,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:join(out,'320暗色-冲突处理选择.png'),fullPage:true});
 await page.locator('#conflict-cancel').click();assert.equal(aiCalls.length,0);
 await page.locator('#conflict-assist').click();await page.locator('#conflict-send').click();await page.locator('#conflict-status').filter({hasText:'任务已创建'}).waitFor();assert.equal(aiCalls.length,1);assert.equal(aiCalls[0].workingDir,project);assert.match(aiCalls[0].task,/美术资源先询问我/);
 await page.locator('#beginner-update:not(:disabled)').waitFor();await page.locator('#beginner-update').click();assert.equal(await page.locator('#beginner-confirm').isDisabled(),true);
 assert.equal(await page.locator('#conflict-acknowledge').isDisabled(),true);taskState='done';
 const before=calls.filter(c=>c==='beginner-update').length;
 await page.locator('#conflict-continue').click();await page.locator('#beginner-confirm:not(:disabled)').waitFor();assert.equal(calls.filter(c=>c==='beginner-update').length,before);
 // Clicking continue is not proof of repair; fresh preflight must still block.
 await page.locator('#beginner-confirm').click();await page.locator('#update-recovery').filter({hasText:'有冲突'}).waitFor();assert.equal(await readFile(join(project,'hero.txt'),'utf8'),'local\n');
 // Simulate the explicitly approved external repair. Preserve a real backup.
 await writeFile(join(project,'.git/hero-before-repair.txt'),await readFile(join(project,'hero.txt')));await writeFile(join(project,'hero.txt'),'team\n');
 await page.locator('#conflict-continue').click();await page.locator('#beginner-confirm:not(:disabled)').waitFor();await page.locator('#beginner-confirm').click();await page.locator('#update-progress[data-state=done]').waitFor();
 assert.equal(git(['status','--porcelain']),'');assert.equal(await readFile(join(project,'.git/hero-before-repair.txt'),'utf8'),'local\n');assert.equal(aiCalls.length,1);assert.equal(await page.locator('#update-recovery').isVisible(),false);
 // A lost dispatch survives page reload and has an explicit no-replay recovery.
 loseDispatch=true;const lost=await service('conflict-start',{projectId:'one',revision:1,operationId:randomUUID(),strategy:'ask',instructions:''});assert.equal(lost.state,'uncertain');
 await page.reload();await page.evaluate(async()=>{const {mountGit}=await import('/git-ui.js');mountGit({transport:{call:window.transport},context:()=>({projectId:'one',revision:1,ready:true}),notice:()=>{}});});
 await page.locator('#conflict-verify').waitFor();assert.equal(await page.locator('#conflict-acknowledge').isDisabled(),true);
 await page.locator('#conflict-verify').check();await page.locator('#conflict-acknowledge:not(:disabled)').click();
 await page.locator('#conflict-status').filter({hasText:'已记录人工核对'}).waitFor();assert.equal(aiCalls.length,2);
 assert.equal((await gitWithHost(host,project,{action:'status'})).aiRepair,null);assert.equal(git(['status','--porcelain']),'');
 await page.evaluate(async()=>{const {createUpdateProgress}=await import('/update-progress.js');const p=createUpdateProgress({call:async()=>null,kind:'submit'});p.start('draft');p.finish({id:'draft',state:'review-draft'});window.draftProgress=p;});
 assert.match(await page.locator('#submit-progress-title').first().textContent(),/草稿待完善/);
 await page.evaluate(()=>{window.draftProgress.start('draft');window.draftProgress.fail({message:'lost'});window.draftProgress.sync({id:'draft',state:'review-draft'});});
 assert.match(await page.locator('#submit-progress-title').first().textContent(),/草稿待完善.*已核对/);
 await page.setViewportSize({width:860,height:760});await page.emulateMedia({colorScheme:'light'});await page.addStyleTag({content:':root{--panel-bg:#f8f8f6;--surface:#fff;--text-primary:#262626;--text-secondary:#737373;--border-default:#d7d7d4;color-scheme:light}'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(out,'860亮色-检查后更新完成.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: real isolated conflict preflight; 320/860; dialog cancel zero dispatch; mocked AI task scoped to selected directory; fresh check does not replay; unresolved conflict blocks; repaired fixture updates with backup preserved.');
} finally {await browser?.close();worker?.kill();if(server)await new Promise(yes=>server.close(yes));await rm(temp,{recursive:true,force:true});}
