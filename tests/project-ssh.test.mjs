import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,chmod,rm,realpath,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const {gitRequest}=createRequire(import.meta.url)('../plugin/node/git-service.cjs');
async function fixture(t) {
  const temp=await mkdtemp(join(tmpdir(),'jixin-project-ssh-'));t.after(()=>rm(temp,{recursive:true,force:true}));
  const root=await realpath(temp),git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  git(['init','-q','-b','main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.test']);
  await writeFile(join(root,'file'),'original');git(['add','.']);git(['commit','-qm','initial']);
  git(['remote','add','origin','git@example.test:team/project.git']);
  const key=join(root,"identity key's file");execFileSync('ssh-keygen',['-q','-t','ed25519','-N','','-f',key]);
  const act=async(action,extra={})=>gitRequest(root,{action,token:(await gitRequest(root)).token,rulesConfirmed:true,...extra});
  return {root,git,key,act};
}
test('binds explicit identity to project and uses it in actual Git SSH invocation',async t=>{
  const f=await fixture(t);
  await f.act('ssh-identity-set',{confirmSshIdentity:true,sshIdentityFile:f.key});
  assert.equal((await gitRequest(f.root)).sshIdentity.configured,true);
  assert.throws(()=>f.git(['config','--get','core.sshCommand']));
  const bin=join(f.root,'bin');await mkdir(bin);const log=join(f.root,'ssh-args.json');
  await writeFile(join(bin,'ssh'),'#!/usr/bin/env node\nrequire("fs").writeFileSync(process.env.JIXIN_SSH_TEST_LOG,JSON.stringify(process.argv.slice(2)));process.exit(1);');await chmod(join(bin,'ssh'),0o700);
  const previous={PATH:process.env.PATH,JIXIN_SSH_TEST_LOG:process.env.JIXIN_SSH_TEST_LOG};
  process.env.PATH=bin+':'+previous.PATH;process.env.JIXIN_SSH_TEST_LOG=log;
  try {await assert.rejects(f.act('fetch'),{code:'GIT_OPERATION_FAILED'});}finally{process.env.PATH=previous.PATH;if(previous.JIXIN_SSH_TEST_LOG===undefined)delete process.env.JIXIN_SSH_TEST_LOG;else process.env.JIXIN_SSH_TEST_LOG=previous.JIXIN_SSH_TEST_LOG;}
  const args=JSON.parse(await readFile(log,'utf8'));assert.equal(args[args.indexOf('-i')+1],f.key);
  assert.ok(args.includes('IdentitiesOnly=yes'));
});
test('does not bind without confirmation and rejects remote changes',async t=>{
  const f=await fixture(t);await assert.rejects(f.act('ssh-identity-set',{sshIdentityFile:f.key}),{code:'SSH_IDENTITY_INVALID'});
  await f.act('ssh-identity-set',{confirmSshIdentity:true,sshIdentityFile:f.key});
  f.git(['remote','set-url','origin','git@example.test:other/project.git']);
  await assert.rejects(gitRequest(f.root),{code:'SSH_IDENTITY_INVALID'});
});
test('rejects loose key permissions and another project does not inherit a binding',async t=>{
  const a=await fixture(t),b=await fixture(t);await chmod(a.key,0o644);
  await assert.rejects(a.act('ssh-identity-set',{confirmSshIdentity:true,sshIdentityFile:a.key}),{code:'SSH_IDENTITY_INVALID'});
  await chmod(a.key,0o600);await a.act('ssh-identity-set',{confirmSshIdentity:true,sshIdentityFile:a.key});
  assert.equal((await gitRequest(b.root)).sshIdentity.configured,false);
});
