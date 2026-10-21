const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const execute = require('node:util').promisify(require('node:child_process').execFile);
const fail = message => { throw Object.assign(new Error(message), {code:'SSH_IDENTITY_INVALID'}); };
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
async function keyInfo(file, env) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || /[\x00-\x1f\x7f]/.test(file)) fail('请选择本机 SSH 私钥文件。');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (process.getuid && stat.uid !== process.getuid()) || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('SSH 密钥必须是当前用户拥有且权限受限的普通文件。');
  const pub = await fs.lstat(file+'.pub');
  if (!pub.isFile() || pub.isSymbolicLink() || pub.size > 16384) fail('请确认对应公钥文件可用。');
  const {stdout} = await execute('ssh-keygen',['-lf',file+'.pub'],{env,timeout:5000,maxBuffer:16384,windowsHide:true});
  const fingerprint = stdout.trim().split(/\s+/)[1];
  if (!fingerprint?.startsWith('SHA256:')) fail('无法确认 SSH 公钥指纹。');
  return {file,fingerprint,identity:{dev:stat.dev,ino:stat.ino,size:stat.size,mtimeMs:stat.mtimeMs}};
}
async function location(ctx) { return path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path','jixin-ssh-identity.json'])).trim()); }
async function origin(ctx) { return (await ctx.run(['remote','get-url','origin'])).trim(); }
function sshRemote(remote) { return /^(?:git@[^: /]+:|ssh:\/\/[^ /]+\/)[^\x00-\x20]+$/.test(remote); }
async function bind(ctx,params) {
  if (params.confirmSshIdentity !== true) fail('请确认将此 SSH 密钥用于当前项目。');
  const remote = await origin(ctx);
  if (!sshRemote(remote)) fail('当前项目的 origin 不是 SSH 地址。');
  const key = await keyInfo(params.sshIdentityFile,ctx.env);
  const file = await location(ctx),temporary=file+'.'+randomUUID()+'.tmp';
  await fs.writeFile(temporary,JSON.stringify({version:1,root:ctx.root,remote,...key}),{flag:'wx',mode:0o600});
  await fs.rename(temporary,file);
  return {configured:true,keyName:path.basename(key.file),fingerprint:key.fingerprint};
}
async function load(ctx) {
  const file=await location(ctx);
  let stat;try {stat=await fs.lstat(file);} catch(e) {if(e.code==='ENOENT')return null;throw e;}
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size>16384 || (process.getuid && stat.uid!==process.getuid()) || (process.platform!=='win32' && (stat.mode & 0o077))) fail('项目 SSH 身份配置无法安全读取。');
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  if (saved.version!==1 || saved.root!==ctx.root || saved.remote!==await origin(ctx) || !sshRemote(saved.remote)) fail('项目目录或远端已变化，请重新确认 SSH 身份。');
  const key=await keyInfo(saved.file,ctx.env);
  if (key.fingerprint!==saved.fingerprint || JSON.stringify(key.identity)!==JSON.stringify(saved.identity)) fail('SSH 密钥已变化，请重新确认项目身份。');
  return {command:'ssh -i '+quote(key.file)+' -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes',keyName:path.basename(key.file),fingerprint:key.fingerprint};
}
module.exports={bind,load};
