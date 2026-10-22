const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
async function journal(ctx){return path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path','jixin-file-revert.json'])).trim());}
async function readReceipt(ctx) {
  try {
    const file=await journal(ctx),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024)fail('REVERT_UNCONFIRMED','文件还原记录无法核对，请联系项目负责人');
    const record=JSON.parse(await fs.readFile(file,'utf8'));
    return record;
  } catch(e){if(e.code!=='ENOENT')throw e;return null;}
}
async function assertSettled(ctx) {
  const record=await readReceipt(ctx);
  if(record&&!['restored','acknowledged'].includes(record.state))fail('REVERT_UNCONFIRMED','上次文件还原结果需要核对，已保留备份。请刷新并核对文件与备份后确认，不会重放原还原：'+(record.backup||''));
}
async function acknowledge(ctx,params) {
  const record=await readReceipt(ctx);
  if(!record||record.backup!==params.recordId||!['prepared','needs-verification'].includes(record.state))fail('STALE_REVIEW','还原记录已变化，请刷新后核对');
  record.state='acknowledged';record.acknowledgedAt=new Date().toISOString();
  const file=await journal(ctx),temp=file+'.'+randomUUID()+'.tmp';
  await fs.writeFile(temp,JSON.stringify(record),{flag:'wx',mode:0o600});await fs.rename(temp,file);
  return {message:'已记录人工核对，允许后续新操作；不会重放上次还原。备份：'+record.backup};
}
async function selected(ctx,state,name) {
  if(typeof name!=='string'||!name||name.includes('\0')||name.split(/[\\/]/).some(p=>p==='..'||p.toLowerCase()==='.git')||path.isAbsolute(name))fail('INVALID_PATHS','请选择当前改动列表中的单个文件');
  const item=state.changes.find(c=>c.path===name);
  if(!item)fail('STALE_REVIEW','文件已不在改动列表，请刷新后重试');
  let cursor=ctx.root;
  for(const part of name.split('/')) {
    cursor=path.join(cursor,part);
    try {const stat=await fs.lstat(cursor);if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))fail('UNSUPPORTED_FILE','暂不支持链接或特殊文件，请联系项目负责人');}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  try {const stat=await fs.lstat(path.join(ctx.root,name));if(!stat.isFile())fail('UNSUPPORTED_FILE','暂不支持目录或子模块，请联系项目负责人');if(stat.size>1024*1024)fail('FILE_TOO_LARGE','此文件超过1MB，请使用项目专业工具查看或还原');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const modes=await ctx.run(['ls-files','--stage','--',':(literal)'+name]);
  if(/^160000 /m.test(modes))fail('UNSUPPORTED_FILE','暂不支持子模块文件操作');
  return item;
}
async function compare(ctx,state,params) {
  const item=await selected(ctx,state,params.path);
  // Resolve an actual remote branch, never mistake a stale local ref for online.
  let branch='',target='';
  const upstream=state.branch?(await ctx.run(['for-each-ref','--format=%(upstream:remotename)%00%(upstream:remoteref)','refs/heads/'+state.branch])).trim().split('\0'):[];
  if(upstream[0]) {
    if(upstream[0]!=='origin'||!upstream[1]?.startsWith('refs/heads/'))fail('REMOTE_NOT_SUPPORTED','当前跟踪分支不是 origin，请联系项目负责人确认线上对比目标');
    branch=upstream[1].slice(11);
  } else {
    const lines=(await ctx.run(['ls-remote','--symref','origin','HEAD'])).split('\n');
    const match=lines.find(l=>l.startsWith('ref: refs/heads/'))?.match(/^ref: refs\/heads\/(.+)\tHEAD$/);
    if(!match)fail('TEAM_NOT_CONFIGURED','无法确定线上默认分支，请先配置 origin');
    branch=match[1];
  }
  await ctx.run(['check-ref-format','refs/heads/'+branch]);
  target='origin/'+branch;
  await ctx.run(['fetch','--no-tags','--no-recurse-submodules','origin','+refs/heads/'+branch+':refs/remotes/origin/'+branch]);
  const commit=(await ctx.run(['rev-parse','--verify','refs/remotes/origin/'+branch+'^{commit}'])).trim();
  const remoteEntry=await ctx.run(['ls-tree','-z',commit,'--',':(literal)'+item.path]);
  if(remoteEntry&&!remoteEntry.startsWith('100'))fail('UNSUPPORTED_FILE','线上对应路径是链接、目录或子模块，请使用专业工具对比');
  const before=remoteEntry?await ctx.run(['show',commit+':'+item.path],{raw:true}):Buffer.alloc(0);
  let local;try {await selected(ctx,state,item.path);local=await fs.readFile(path.join(ctx.root,item.path));}catch(e){if(e.code!=='ENOENT')throw e;}
  const temp=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'jixin-diff-'));
  let output='';
  try {
    const left=path.join(temp,'online'),right=path.join(temp,'local');
    await fs.writeFile(left,before,{mode:0o600});await fs.writeFile(right,local||Buffer.alloc(0),{mode:0o600});
    try {output=await ctx.run(['diff','--no-index','--no-ext-diff','--no-textconv','--',left,right]);}
    catch(e){if(e.code===1)output=e.stdout;else throw e;}
    output=output.split('\n').map(line=>line.startsWith('diff --git ')?'diff --git '+JSON.stringify('online/'+item.path)+' '+JSON.stringify('local/'+item.path):line.startsWith('--- ')?'--- '+(remoteEntry?'online/'+item.path:'/dev/null'):line.startsWith('+++ ')?'+++ '+(local!==undefined?'local/'+item.path:'/dev/null'):line.startsWith('Binary files ')?'Binary files differ: '+item.path:line).join('\n');
    if(!output&&!remoteEntry&&local!==undefined)output='新增空文件 / Empty file added: '+item.path;
    if(!output&&remoteEntry&&local===undefined)output='删除空文件 / Empty file deleted: '+item.path;
  } finally {await fs.rm(temp,{recursive:true,force:true});}
  const result={path:item.path,target,commit,checkedAt:new Date().toISOString(),output:output||'该文件内容与线上一致（权限或暂存状态可能不同）。'};
  if(params.preview===true)result.url=await require('./diff-preview.cjs').open(result,params.english===true);
  return result;
}
async function revert(ctx,state,params,verify) {
  const batch=Array.isArray(params.paths),names=batch?params.paths:[params.path];
  if(!names.length||names.length>200||new Set(names).size!==names.length||Buffer.byteLength(JSON.stringify(names))>100000)fail('INVALID_PATHS','一次请选择1至200个不同文件；文件名列表过长时请分批还原。');
  const confirmed=batch?params.confirmPaths:[params.confirmPath];
  if(JSON.stringify(names)!==JSON.stringify(confirmed))fail('FILE_CONFIRMATION_REQUIRED','请确认要还原的准确文件清单');
  const items=[];
  for(const name of names){const item=await selected(ctx,state,name);if(!state.head||/[URC]/.test(item.status)||['AA','DD'].includes(item.status))fail('UNSUPPORTED_FILE','清单含冲突、改名或未初始化项目，整批未还原，请交由负责人处理');items.push(item);}
  const service=require('./beginner-git.cjs'),prior=await service.readReceipt(ctx);
  if(prior&&!prior.retryable&&['running','blocked','needs-verification'].includes(prior.state))fail('OPERATION_LOCKED','上次操作还需负责人核对，暂不能还原文件');
  const base=path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path','jixin-file-backups'])).trim());
  await fs.mkdir(base,{recursive:true,mode:0o700});
  if((await fs.lstat(base)).isSymbolicLink())fail('UNSAFE_BACKUP','备份目录不能是符号链接');
  const backup=path.join(base,randomUUID());await fs.mkdir(backup,{mode:0o700});
  const args=['--binary','--no-ext-diff','--no-textconv','--no-renames'],prepared=[];
  // Validate and back up every file before changing any selected file or index entry.
  for(const [index,item] of items.entries()) {
    const location=batch?path.join(backup,String(index)):backup;
    if(batch)await fs.mkdir(location,{mode:0o700});
    const literal=':(literal)'+item.path,entry=await ctx.run(['ls-tree','-z','HEAD','--',literal]);
    if(entry&&!entry.startsWith('100'))fail('UNSUPPORTED_FILE','最近提交对应路径是链接、目录或子模块，整批未还原');
    await fs.writeFile(path.join(location,'staged.patch'),await ctx.run(['diff','--cached',...args,'HEAD','--',literal]),{mode:0o600});
    await fs.writeFile(path.join(location,'worktree.patch'),await ctx.run(['diff',...args,'--',literal]),{mode:0o600});
    let content;try{content=await fs.readFile(path.join(ctx.root,item.path));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(content!==undefined)await fs.writeFile(path.join(location,'local-file'),content,{mode:0o600});
    const file={path:item.path,status:item.status,workingFilePresent:content!==undefined,mode:content===undefined?null:(await fs.lstat(path.join(ctx.root,item.path))).mode};
    if(batch)await fs.writeFile(path.join(location,'record.json'),JSON.stringify(file),{mode:0o600});
    prepared.push({...file,literal,entry});
  }
  const record={...(batch?{paths:names,completed:[]}:prepared[0]),head:state.head,createdAt:new Date().toISOString(),backup,state:'prepared'};
  delete record.literal;delete record.entry;
  const log=await journal(ctx),write=async()=>{
    await fs.writeFile(path.join(backup,'record.json'),JSON.stringify(record),{mode:0o600});
    const temp=log+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(record),{flag:'wx',mode:0o600});await fs.rename(temp,log);
  };
  if((await verify()).fingerprint!==state.fingerprint)fail('STALE_REVIEW','备份期间项目文件或规则发生变化，请刷新后重新确认；整批未还原');
  await write();
  try {
    for(const item of prepared) {
      if(item.entry)await ctx.run(['restore','--source=HEAD','--staged','--worktree','--',item.literal]);
      else {
        if(item.status!=='??')await ctx.run(['rm','--cached','--force','--',item.literal]);
        if(item.workingFilePresent)await fs.unlink(path.join(ctx.root,item.path));
      }
      if(batch){record.completed.push(item.path);await write();}
    }
    record.state='restored';await write();
  } catch(e) {record.state='needs-verification';await write();fail('REVERT_UNCONFIRMED','还原已停止，结果需要核对，请勿重复操作。全部所选文件的备份：'+backup+'\n'+(e.stderr||e.message));}
  return {...(batch?{paths:names}:{path:names[0]}),backup,message:'已还原 '+(batch?names.length+' 个所选文件':names[0])+' 到本机最近提交（HEAD），含所选文件的暂存改动；其他文件保持原样，未拉取线上版本。备份：'+backup};
}
module.exports={compare,revert,assertSettled,readReceipt,acknowledge};
