import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosisPacket,diagnosisPrompt,redactDiagnosis} from '../plugin/core/diagnosis.mjs';
import {createDiagnosisService} from '../plugin/diagnosis-service.js';
import {mkdtemp,writeFile,mkdir,readFile,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
test('real diagnostic Git read skips SSH and corrupt operation journals, creates no ticket or write lock',async t=>{
 const temp=await realpath(await mkdtemp(join(tmpdir(),'jixin-diagnosis-read-')));t.after(()=>rm(temp,{recursive:true,force:true}));
 const git=args=>execFileSync('git',['-C',temp,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-qb','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);await writeFile(join(temp,'AGENTS.md'),'Keep hooks.');git(['add','.']);git(['commit','-qm','initial']);
 await writeFile(join(temp,'.env'),'DO_NOT_READ=private');await writeFile(join(temp,'art.txt'),'local');
 for(const name of ['jixin-ssh-identity.json','jixin-file-revert.json'])await writeFile(join(temp,'.git',name),'invalid private journal');
 const before=git(['status','--porcelain']),head=git(['rev-parse','HEAD']),result=await gitRequest(temp,{action:'diagnosis-status'});
 for(const key of ['token','sshIdentity','fileRevertReceipt','beginnerReceipt'])assert.equal(result[key],undefined);
 assert.equal(result.operationLocked,false);await assert.rejects(readFile(join(temp,'.git/jixin-write.lock')),{code:'ENOENT'});
 await mkdir(join(temp,'.git/jixin-write.lock'));assert.equal((await gitRequest(temp,{action:'diagnosis-status'})).operationLocked,true);
 assert.equal(git(['rev-parse','HEAD']),head);assert.equal(git(['status','--porcelain']),before);assert.equal(await readFile(join(temp,'art.txt'),'utf8'),'local');
});
function fixture(){
 let data={projectConfiguration:{revision:1,configuration:{schemaVersion:1,activeProjectId:'p',projects:[{id:'p',directory:'/project',discovery:'auto'}]}}},time=1000;
 const calls=[],store={read:async()=>structuredClone(data),update:async fn=>{data={...data,...fn(data)};}},options={};
 const git=async(dir,params)=>{calls.push({dir,params});if(options.gitError)throw options.gitError;return {branch:'main',head:'abc',token:'ONE_USE_TICKET',changes:[{path:'art/a.txt',status:' M'},{path:'.env',status:'??'}],sources:[{path:'AGENTS.md',content:'Keep hooks. api_key=secretvalue'}],hooksReady:true};};
 const prompts=[],askText=async prompt=>{prompts.push(prompt);if(options.wait)await options.wait;if(options.throw)throw new Error('lost');return options.reply||{ok:true,text:'已知事实：当前 main 有修改。可能原因：还需错误信息。建议处理：先查看错误。如何验证：重新检查。',model:'fixture-model'};};
 const service=()=>createDiagnosisService({store,git,askText:options.unavailable?undefined:askText,now:()=>time,newId:()=>String(++time)});let handle=service();
 return {run:(method,params={})=>handle(method,{projectId:'p',revision:1,...params}),calls,prompts,options,store,restart:()=>{handle=service();},tick:ms=>{time+=ms;},get data(){return data;},get time(){return time;}};
}
test('diagnostic preview reads only status, excludes tickets/credential files and redacts known secrets',async()=>{
 const f=fixture(),preview=await f.run('diagnosis-prepare',{problem:'无法更新',failure:'https://user:pass@example.test/repo?token=hiddenvalue Authorization: Bearer bearer-secret'});
 assert.equal(f.prompts.length,0);assert.deepEqual(f.calls,[{dir:'/project',params:{action:'diagnosis-status'}}]);assert.equal(preview.available,true);
 const text=JSON.stringify(preview.packet);for(const secret of ['ONE_USE_TICKET','secretvalue','bearer-secret','user:pass','hiddenvalue','"path":".env"'])assert.ok(!text.includes(secret),secret);
 assert.equal(preview.packet.git.omittedChanges,1);assert.equal(preview.packet.rules[0].path,'AGENTS.md');
});
test('diagnosis sends the reviewed snapshot once, persists completion and can read after restart',async()=>{
 const f=fixture(),preview=await f.run('diagnosis-prepare',{problem:'更新失败'});
 const params={token:preview.token,operationId:'diagnosis-request-0001'},result=await f.run('diagnosis-run',params);
 assert.equal(result.state,'completed');assert.equal(result.model,'fixture-model');assert.ok(f.prompts[0].includes(JSON.stringify(preview.packet,null,2)));assert.match(f.prompts[0],/不执行修复/);
 await f.run('diagnosis-run',params);assert.equal(f.prompts.length,1);assert.equal(f.calls.length,1);
 f.restart();assert.equal((await f.run('diagnosis-read')).text,result.text);await f.run('diagnosis-run',params);assert.equal(f.prompts.length,1);
});
test('expired preview, wrong project, stale revision and missing preview never call AI',async()=>{
 const f=fixture(),preview=await f.run('diagnosis-prepare',{problem:'test'}),params={token:preview.token,operationId:'diagnosis-request-0002'};
 await assert.rejects(f.run('diagnosis-run',{...params,projectId:'other'}),{code:'CONFIG_CONFLICT'});
 await assert.rejects(f.run('diagnosis-run',{...params,revision:2}),{code:'CONFIG_CONFLICT'});
 f.tick(300001);await assert.rejects(f.run('diagnosis-run',params),{code:'DIAGNOSIS_EXPIRED'});assert.equal(f.prompts.length,0);
});
test('in-flight double click and lost inference reply cannot auto replay or fabricate diagnosis',async()=>{
 const f=fixture(),preview=await f.run('diagnosis-prepare',{problem:'test'});let release;f.options.wait=new Promise(yes=>{release=yes;});
 const running=f.run('diagnosis-run',{token:preview.token,operationId:'diagnosis-request-0003'});
 while(!f.prompts.length)await new Promise(yes=>setTimeout(yes,0));
 assert.equal((await f.run('diagnosis-run',{token:preview.token,operationId:'diagnosis-request-0003'})).state,'running');
 await assert.rejects(f.run('diagnosis-run',{token:preview.token,operationId:'diagnosis-request-0004'}),{code:'BUSY'});
 f.options.throw=true;release();await assert.rejects(running,{code:'RESPONSE_UNCONFIRMED'});f.restart();assert.equal((await f.run('diagnosis-read')).state,'uncertain');
 await f.run('diagnosis-run',{token:preview.token,operationId:'diagnosis-request-0003'});assert.equal(f.prompts.length,1);
});
test('no model or missing standalone AI preserves local information without fabricated output',async()=>{
 const f=fixture();f.options.reply={ok:false,errorCode:'NO_CANDIDATE'};const preview=await f.run('diagnosis-prepare',{problem:'test'});
 assert.equal((await f.run('diagnosis-run',{token:preview.token,operationId:'diagnosis-request-0005'})).state,'failed');assert.equal(f.data.diagnosisReceipt.text,undefined);
 f.options.unavailable=true;f.restart();assert.equal((await f.run('diagnosis-prepare',{problem:'test'})).available,false);
 await assert.rejects(f.run('diagnosis-run',{operationId:'diagnosis-request-0006'}),{code:'AI_UNAVAILABLE'});
});
test('non-Git project and failed Git reads remain diagnosable; prompts and results are bounded',async()=>{
 const f=fixture();f.options.gitError=Object.assign(new Error('不是 Git 项目'),{code:'NOT_GIT_PROJECT'});const preview=await f.run('diagnosis-prepare',{problem:'打不开'});assert.equal(preview.packet.git.available,false);
 const packet=diagnosisPacket({project:{directory:'/project'},problem:'a'.repeat(2000),failure:'x'.repeat(10000),snapshot:{changes:Array.from({length:300},()=>({path:'x'.repeat(500),status:' M'})),sources:Array.from({length:100},()=>({path:'AGENTS.md',content:'q'.repeat(10000)}))}});
 assert.ok(diagnosisPrompt(packet).length<32768);
 const secret='-----BEGIN OPENSSH PRIVATE KEY-----'+String.fromCharCode(10)+'private-secret'+String.fromCharCode(10)+'-----END OPENSSH PRIVATE KEY-----';assert.ok(!redactDiagnosis(secret).includes('private-secret'));
 assert.ok(!redactDiagnosis(JSON.stringify({Authorization:'Bearer json-header-secret'})).includes('json-header-secret'));
 assert.ok(!redactDiagnosis('postgresql://artist:database-secret@db.example.test/project').includes('database-secret'));
 assert.ok(!redactDiagnosis('https://example.test?X-Amz-Signature=signed-url-secret').includes('signed-url-secret'));
});
