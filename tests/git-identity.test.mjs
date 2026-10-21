import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,chmod,rm,realpath,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
async function fixture(t){
 const temp=await mkdtemp(join(tmpdir(),'jixin-identity-'));t.after(()=>rm(temp,{recursive:true,force:true}));const root=await realpath(temp);
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-qb','main']);git(['config','user.name','']);git(['config','user.email','']);git(['remote','add','origin','git@github.com:team/art.git']);
 await writeFile(join(root,'art.txt'),'original art');const bin=join(root,'.git/bin');await mkdir(bin);const data=join(root,'.git/account.json'),log=join(root,'.git/gh.log');
 await writeFile(data,JSON.stringify({login:'artist',id:123,name:'Artist Name'}));
 await writeFile(join(bin,'gh'),'#!/usr/bin/env node\nconst fs=require("node:fs");fs.appendFileSync('+JSON.stringify(log)+',JSON.stringify({args:process.argv.slice(2),host:process.env.GH_HOST,repo:process.env.GH_REPO})+"\\n");const user=JSON.parse(fs.readFileSync('+JSON.stringify(data)+'));if(user.fail)process.exit(1);console.log(JSON.stringify(user));\n');await chmod(join(bin,'gh'),0o755);
 const old={PATH:process.env.PATH,GH_HOST:process.env.GH_HOST,GH_REPO:process.env.GH_REPO};process.env.PATH=bin+':'+process.env.PATH;process.env.GH_HOST='wrong.example';process.env.GH_REPO='other/repo';t.after(()=>{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const prepare=()=>gitRequest(root,{action:'prepare',confirmProjectSetup:true}),fill=identity=>gitRequest(root,{action:'identity-fill',confirmIdentity:true,identity});
 return {root,git,prepare,fill,data,log};
}
test('detects signed-in account without writing; one click fills only local missing identity and is idempotent',async t=>{
 const f=await fixture(t),before=f.git(['status','--porcelain']),result=await f.prepare();
 assert.equal(result.identity.state,'available');assert.equal(result.identity.email,'123+artist@users.noreply.github.com');assert.equal(f.git(['config','user.name']),'');
 await assert.rejects(gitRequest(f.root,{action:'identity-fill',identity:result.identity}),{code:'IDENTITY_NOT_CONFIRMED'});
 const done=await f.fill(result.identity);assert.equal(done.state,'ready');assert.equal(f.git(['config','--local','user.name']),'Artist Name');assert.equal(f.git(['config','--local','user.email']),'123+artist@users.noreply.github.com');assert.equal(f.git(['status','--porcelain']),before);
 const log=await readFile(f.log,'utf8');assert.match(log,/github.com/);assert.doesNotMatch(log,/wrong.example|other[/]repo/);
 assert.equal((await f.fill(result.identity)).state,'ready');assert.equal(await readFile(f.log,'utf8'),log);
});
test('partial identity preserves existing field and falls back to authenticated login when name is private',async t=>{
 const f=await fixture(t);f.git(['config','user.email','my-own@example.test']);await writeFile(f.data,JSON.stringify({login:'artist',id:123,name:null}));const found=(await f.prepare()).identity;assert.deepEqual(found.missing,['name']);assert.equal(found.name,'artist');await f.fill(found);assert.equal(f.git(['config','user.email']),'my-own@example.test');
});
test('account switch, tampered candidate and network failure never write guessed identity',async t=>{
 const f=await fixture(t),found=(await f.prepare()).identity;await assert.rejects(f.fill({...found,email:'fake@example.test'}),{code:'IDENTITY_CHANGED'});
 await writeFile(f.data,JSON.stringify({login:'other',id:456}));await assert.rejects(f.fill(found),{code:'IDENTITY_CHANGED'});assert.equal(f.git(['config','user.name']),'');
 await writeFile(f.data,JSON.stringify({fail:true}));assert.equal((await f.prepare()).identity.state,'unavailable');await assert.rejects(f.fill(found),{code:'GIT_IDENTITY_REQUIRED'});assert.equal(f.git(['config','user.email']),'');
});
test('non-GitHub origin does not reuse an unrelated account and complete identity needs no network',async t=>{
 const f=await fixture(t);f.git(['remote','set-url','origin','https://gitlab.com/team/art.git']);assert.equal((await f.prepare()).identity.state,'unavailable');await assert.rejects(readFile(f.log),{code:'ENOENT'});
 f.git(['config','user.name','Existing']);f.git(['config','user.email','existing@example.test']);assert.equal((await f.prepare()).identity.state,'ready');await assert.rejects(readFile(f.log),{code:'ENOENT'});
});
