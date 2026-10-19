import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const entry=fileURLToPath(new URL('../plugin/node/worker-entry.cjs',import.meta.url));
test('Host-style require starts stdio listener and replies without being require.main',()=>{
 const dir=mkdtempSync(join(tmpdir(),'workflow-boot-'));
 try {
  const input=[{jsonrpc:'2.0',id:1,method:'project/inspect',params:{dir}},{jsonrpc:'2.0',id:2,method:'unknown'}].map(JSON.stringify).join(String.fromCharCode(10))+String.fromCharCode(10);
  const result=spawnSync(process.execPath,['-e','require(process.argv[1])',entry],{input,encoding:'utf8',timeout:3000});
  assert.equal(result.status,0,result.stderr);assert.equal(result.error,undefined);
  const replies=result.stdout.trim().split(String.fromCharCode(10)).map(JSON.parse);
  assert.equal(replies.length,2);assert.equal(replies.find(r=>r.id===1).result.workflows.feature.ok,false);assert.equal(replies.find(r=>r.id===2).error.code,-32601);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('installed-style package without package.json resolves shared config and custom paths',()=>{
 const root=mkdtempSync(join(tmpdir(),'jixin-installed-'));
 try {
  const script =
   "const fs=require('node:fs'),p=require('node:path');" +
   "fs.cpSync(process.argv[1],p.join(process.argv[2],'plugin'),{recursive:true,filter:s=>!s.endsWith('.cindy')});" +
   "const dir=p.join(process.argv[2],'project');fs.mkdirSync(dir);fs.writeFileSync(p.join(dir,'custom.md'),'instructions');" +
   "const config={id:'one',name:'Project',directory:dir,workflows:Object.fromEntries(['experiment','feature','tooling','pr','merge'].map(id=>[id,{path:id==='feature'?'custom.md':'',external:false}]))};" +
   "require(p.join(process.argv[2],'plugin/node/inspect-project.cjs')).inspectProject(dir,process.argv[2],config).then(r=>console.log(JSON.stringify(r)));";
  const result=spawnSync(process.execPath,['-e',script,fileURLToPath(new URL('../plugin',import.meta.url)),root],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).workflows.feature.ok,true);
 }finally{rmSync(root,{recursive:true,force:true});}
});
