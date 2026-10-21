import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
async function fixture(t) {
 const temp=await mkdtemp(join(tmpdir(),'jixin-issue-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const root=join(await realpath(temp),'project'),remote=join(temp,'origin.git');await mkdir(root);
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();git(['init','-qb','main']);git(['config','user.name','Artist']);git(['config','user.email','artist@example.test']);await writeFile(join(root,'AGENTS.md'),'Conventional Commits. DCO required. Main requires PR.');git(['add','.']);git(['commit','-qm','chore: initial']);
 execFileSync('git',['init','--bare','-q',remote]);git(['remote','add','origin',remote]);git(['push','-qu','origin','main']);git(['remote','set-url','origin','git@github.com:team/art.git']);git(['config','remote.origin.pushurl',remote]);const main=git(['rev-parse','HEAD']);
 const data=join(root,'.git/issues.json'),log=join(root,'.git/gh-args.json');const defaultIssue={number:12,title:'调整角色颜色',html_url:'https://github.com/team/art/issues/12',url:'https://api.github.com/repos/team/art/issues/12',state:'open',user:{login:'lead'},assignees:[{login:'artist'}]};
 await writeFile(data,JSON.stringify(defaultIssue));const bin=join(root,'.git/bin');await mkdir(bin);
 await writeFile(join(bin,'gh'),'#!'+process.execPath+'\n'+
 'const fs=require("node:fs"),args=process.argv.slice(2),file='+JSON.stringify(data)+',log='+JSON.stringify(log)+';const rows=fs.existsSync(log)?JSON.parse(fs.readFileSync(log)):[];rows.push({args,repo:process.env.GH_REPO,host:process.env.GH_HOST});fs.writeFileSync(log,JSON.stringify(rows));const value=JSON.parse(fs.readFileSync(file));if(value.fail)process.exit(1);if(args[0]==="auth")process.exit(0);if(args[1]==="user"){console.log(JSON.stringify({login:value.login||"artist"}));}else if(args[0]==="issue"){console.log(JSON.stringify(value.rows||[{number:12,title:"调整角色颜色",url:"https://github.com/team/art/issues/12",author:{login:"lead"},assignees:[{login:"artist"}]}]));}else if(args[0]==="api"){console.log(JSON.stringify(value));}else{console.log("https://github.com/team/art/pull/20");}\n');await chmod(join(bin,'gh'),0o755);
 const old={PATH:process.env.PATH,GH_REPO:process.env.GH_REPO,GH_HOST:process.env.GH_HOST};process.env.PATH=bin+':'+old.PATH;process.env.GH_REPO='wrong/elsewhere';process.env.GH_HOST='wrong.example';t.after(()=>{for(const [key,val] of Object.entries(old)){if(val===undefined)delete process.env[key];else process.env[key]=val;}});
 const status=()=>gitRequest(root),submit=async extra=>gitRequest(root,{action:'beginner-submit',paths:['hero.png'],summary:'调整配色',token:(await status()).token,operationId:randomUUID(),rulesConfirmed:true,...extra});
 return {root,git,main,data,log,defaultIssue,status,submit,issue:{number:12,repository:'team/art'}};
}
test('my open issues are repository/account scoped, optional listing is read-only, environment cannot redirect it',async t=>{
 const f=await fixture(t);const result=await gitRequest(f.root,{action:'issues-list'});assert.equal(result.repository,'team/art');assert.equal(result.login,'artist');assert.equal(result.issues[0].number,12);
 const rows=JSON.parse(await readFile(f.log,'utf8'));assert.ok(rows.some(r=>r.args.includes('--assignee')&&r.args.includes('artist')));assert.ok(rows.every(r=>!r.repo&&!r.host));assert.equal(f.git(['rev-parse','HEAD']),f.main);assert.equal((await f.status()).beginnerReceipt,null);
 const created=await gitRequest(f.root,{action:'issues-list',scope:'created'});assert.equal(created.issues.length,0);await writeFile(f.data,JSON.stringify({...f.defaultIssue,rows:[{number:12,title:'My issue',url:'https://github.com/team/art/issues/12',author:{login:'artist'},assignees:[]}]}));assert.equal((await gitRequest(f.root,{action:'issues-list',scope:'created'})).issues[0].number,12);await assert.rejects(gitRequest(f.root,{action:'issues-list',scope:'everyone'}),{code:'ISSUE_INVALID'});
});
test('verified issue reference reaches commit, exact PR repo/body, persistent receipt and never adds closing keywords',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'hero.png'),'art');const result=await f.submit({issue:f.issue});assert.equal(result.state,'awaiting-review');assert.equal(result.issue.number,12);assert.equal(f.git(['rev-parse','main']),f.main);
 assert.match(f.git(['log','-1','--format=%B']),/Refs: https:\/\/github.com\/team\/art\/issues\/12/);const row=JSON.parse(await readFile(f.log,'utf8')).find(r=>r.args[0]==='pr');assert.equal(row.args[row.args.indexOf('--repo')+1],'github.com/team/art');assert.match(row.args[row.args.indexOf('--body')+1],/关联事项：https:\/\/github.com\/team\/art\/issues\/12/);assert.doesNotMatch(row.args.join(' '),/closes|fixes|resolves/i);assert.equal((await f.status()).beginnerReceipt.issue.number,12);
});
test('changed issue state, wrong repo, different account and PR objects block before branching or staging',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'hero.png'),'art');
 await assert.rejects(f.submit({issue:{number:12,repository:'someone/else'}}),{code:'ISSUE_INVALID'});
 for(const value of [{...f.defaultIssue,state:'closed'},{...f.defaultIssue,assignees:[]},{...f.defaultIssue,login:'different'},{...f.defaultIssue,pull_request:{url:'x'}}]) {
  await writeFile(f.data,JSON.stringify(value));await assert.rejects(f.submit({issue:f.issue}),{code:'ISSUE_UNAVAILABLE'});assert.equal(f.git(['branch','--show-current']),'main');assert.equal(f.git(['diff','--cached','--name-only']),'');assert.equal(await readFile(join(f.root,'hero.png'),'utf8'),'art');
 }
});
test('network/account error never submits and does not expose raw credential errors',async t=>{
 const f=await fixture(t);await writeFile(f.data,JSON.stringify({fail:true}));await assert.rejects(gitRequest(f.root,{action:'issues-list'}),e=>e.code==='ISSUE_READ_FAILED'&&e.message.includes('网络'));await writeFile(join(f.root,'hero.png'),'art');await assert.rejects(f.submit({issue:f.issue}),{code:'ISSUE_READ_FAILED'});assert.equal(f.git(['branch','--show-current']),'main');
});
test('origin URL change and unsupported non-GitHub origin are rejected instead of trusting selection URLs',async t=>{
 const f=await fixture(t);f.git(['remote','set-url','origin','https://github.com/other/repository.git']);await writeFile(join(f.root,'hero.png'),'art');await assert.rejects(f.submit({issue:f.issue}),{code:'ISSUE_INVALID'});f.git(['remote','set-url','origin','https://gitlab.com/team/art.git']);await assert.rejects(gitRequest(f.root,{action:'issues-list'}),{code:'ISSUE_REPOSITORY_REQUIRED'});
});

test('both PR entry points ignore unrelated GH_REPO and GH_HOST even without an issue',async t=>{
 const f=await fixture(t);await writeFile(join(f.root,'hero.png'),'art');
 assert.equal((await f.submit({})).state,'awaiting-review');
 let rows=JSON.parse(await readFile(f.log,'utf8'));assert.ok(rows.every(r=>!r.repo&&!r.host));
 let pr=rows.find(r=>r.args[0]==='pr');assert.equal(pr.args[pr.args.indexOf('--repo')+1],'github.com/team/art');
 const state=await f.status();await gitRequest(f.root,{action:'pr',token:state.token,rulesConfirmed:true,title:'chore: review',body:'Verified',base:'main'});
 rows=JSON.parse(await readFile(f.log,'utf8'));assert.ok(rows.every(r=>!r.repo&&!r.host));
 pr=rows.at(-1);assert.equal(pr.args[pr.args.indexOf('--repo')+1],'github.com/team/art');
});
