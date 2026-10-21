import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { resolveSshAuthSock } = createRequire(import.meta.url)('../plugin/node/ssh-agent-env.cjs');
const fixture = (output = '/private/tmp/agent.sock\n', stat = {uid:501,isSocket:()=>true}) => ({
  platform:'darwin', uid:501, execute:async (file,args,options)=>{
    assert.equal(file,'/bin/launchctl');assert.deepEqual(args,['getenv','SSH_AUTH_SOCK']);
    assert.equal(options.timeout,2000);return {stdout:output};
  },lstat:async()=>stat,
});
test('preserves an inherited SSH agent without querying the system',async()=>{
  assert.equal(await resolveSshAuthSock({SSH_AUTH_SOCK:'/existing'}, {execute:()=>{throw Error('unexpected');}}),'/existing');
});
test('recovers the current user socket when the worker omitted it',async()=>{
  assert.equal(await resolveSshAuthSock({},fixture()),'/private/tmp/agent.sock');
});
test('does not query launchctl outside macOS',async()=>{
  assert.equal(await resolveSshAuthSock({}, {...fixture(),platform:'win32',execute:()=>{throw Error('unexpected');}}),undefined);
});
test('rejects invalid paths, regular files and sockets owned by other users',async()=>{
  for(const value of ['', 'relative', '/tmp/a\n/tmp/b']) assert.equal(await resolveSshAuthSock({},fixture(value)),undefined);
  for(const stat of [{uid:501,isSocket:()=>false},{uid:0,isSocket:()=>true}]) assert.equal(await resolveSshAuthSock({},fixture('/tmp/agent',stat)),undefined);
});
test('query failures leave Git environment unchanged',async()=>{
  assert.equal(await resolveSshAuthSock({}, {...fixture(),execute:async()=>{throw Error('unavailable');}}),undefined);
});
