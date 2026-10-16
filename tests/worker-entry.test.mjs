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
