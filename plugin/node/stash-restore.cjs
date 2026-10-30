const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const execute=require('node:util').promisify(require('node:child_process').execFile);
const browser=require('./stash-browser.cjs');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const unsettled=record=>record&&!['restored','acknowledged'].includes(record.state);
const idValid=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{16,60}$/.test(id);
async function location(ctx){return path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path','jixin-stash-restore.json'])).trim());}
async function read(ctx) {
  try {
    const file=await location(ctx),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)fail('STASH_RESTORE_UNCONFIRMED','暂存取回记录无法读取，请联系项目负责人核对。');
    const record=JSON.parse(await fs.readFile(file,'utf8'));
    if(!idValid(record.id)||record.root!==ctx.root||!Array.isArray(record.paths))fail('STASH_RESTORE_UNCONFIRMED','暂存取回记录与项目不匹配，请联系负责人核对。');
    return record;
  }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function write(ctx,record) {
  const file=await location(ctx),temporary=file+'.'+randomUUID()+'.tmp';
  await fs.writeFile(temporary,JSON.stringify(record),{flag:'wx',mode:0o600});await fs.rename(temporary,file);
}
async function assertSettled(ctx) {
  if(unsettled(await read(ctx)))fail('STASH_RESTORE_UNCONFIRMED','上次暂存取回结果需要核对。请先检查实际文件、暂存区和备份，再确认解除限制；不会重复取回。');
}
async function check(ctx,state) {
  await require('./beginner-git.cjs').assertNoPendingGit(ctx,state);
  const previous=await require('./beginner-git.cjs').readReceipt(ctx);
  if(previous&&!require('./beginner-git.cjs').retryableFailure(previous)&&['running','blocked','needs-verification'].includes(previous.state))fail('PREVIOUS_OPERATION_PENDING','上次项目操作还需要核对，请先从恢复卡检查。');
  if(!state.head||!state.branch)fail('DETACHED_HEAD','请先切回项目的命名分支，再取回暂存记录。');
  if(!state.hooksReady||state.incomplete)fail('HOOKS_NOT_READY','请先完成项目规则与 hooks 检查，再取回暂存记录。');
}
async function local(ctx,name) {
  browser.validPath(name);let target=ctx.root;
  for(const part of name.split('/')) {
    target=path.join(target,part);
    try {const stat=await fs.lstat(target);if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory()))fail('UNSUPPORTED_FILE','取回涉及链接或特殊文件，请使用项目专业工具处理。');}
    catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return null;throw error;}
  }
  const stat=await fs.lstat(target);
  if(!stat.isFile())fail('UNSUPPORTED_FILE','取回路径对应本地目录，请先由负责人处理路径冲突。');
  return {size:stat.size,mode:stat.mode};
}
async function selection(ctx,state,stashId) {
  const entry=await browser.selected(ctx,stashId),files=await browser.files(ctx,entry);
  if(!files.length)fail('EMPTY_STASH','这条记录没有可取回的文件。');
  if(Buffer.byteLength(JSON.stringify(files))>512*1024)fail('STASH_TOO_LARGE','这条暂存记录的文件清单过长，请使用项目专业工具查看。');
  for(const file of files)browser.validPath(file.path);
  // Restore does not follow symlinks/submodules from any of the stash trees.
  const affected=new Set(files.map(f=>f.path));
  for(const tree of [entry.base,entry.id,entry.index,entry.untracked].filter(Boolean)) {
    const rows=(await ctx.run(['ls-tree','-r','-z',tree],{filenameList:true})).split('\0');
    for(const row of rows)if(row){const tab=row.indexOf('\t');if(affected.has(row.slice(tab+1))&&!/^(100644|100755) blob /.test(row))fail('UNSUPPORTED_FILE','暂存记录包含链接或子模块变化，请使用项目专业工具取回。');}
  }
  const normalized=name=>process.platform==='win32'?name.toLowerCase():name;
  const paths=files.map(f=>normalized(f.path)),overlap=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
  const ignored=(await ctx.run(['ls-files','--others','--ignored','--exclude-standard','-z'],{filenameList:true})).split('\0').filter(Boolean);
  const untracked=[...state.changes.filter(f=>f.status==='??').map(f=>f.path),...ignored];
  const collisions=untracked.filter(name=>paths.some(p=>overlap(p,normalized(name))));
  if(collisions.length)fail('STASH_RESTORE_CONFLICT','本地新增或忽略文件与暂存记录重名，未修改原项目：'+collisions.slice(0,10).join('、'));
  for(const file of files)await local(ctx,file.path);
  return {entry,files};
}
async function rehearse(ctx,state,entry) {
  let tracked='';
  try {tracked=(await ctx.run(['stash','create','jixin-stash-restore-preflight'])).trim();}
  catch(error){fail('STASH_RESTORE_CONFLICT','当前本地修改暂时无法建立预检快照，请先核对暂存区；未修改原项目。\n'+(error.stderr||error.message));}
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'jixin-stash-restore-'));
  try {
    const empty=path.join(temp,'empty-template'),copy=path.join(temp,'trial');await fs.mkdir(empty);
    const options={env:{...ctx.env,GIT_LFS_SKIP_SMUDGE:'1'},timeout:90000,maxBuffer:2*1024*1024,windowsHide:true};
    await execute(ctx.binary||'git',['clone','--shared','--no-checkout','--no-hardlinks','--template='+empty,'--',ctx.root,copy],options);
    const run=args=>execute(ctx.binary||'git',['--no-optional-locks','-c','core.fsmonitor=false','-c','core.hooksPath='+empty,'-C',copy,...args],options);
    await run(['read-tree','--reset','-u',state.head]);await run(['update-ref','HEAD',state.head]);
    try {if(tracked)await run(['stash','apply','--index',tracked]);await run(['stash','apply','--index',entry.id]);}
    catch(error){fail('STASH_RESTORE_CONFLICT','暂存记录与当前本地文件或暂存区存在冲突，未修改原项目。请先对比内容，再由负责人协助合并。\n'+(error.stderr||error.message));}
  } finally {await fs.rm(temp,{recursive:true,force:true});}
  return tracked;
}
async function preview(ctx,state,params) {
  await check(ctx,state);
  const previous=await read(ctx);
  if(previous?.state==='restored'&&previous.stashId===params.stashId&&previous.afterFingerprint===state.fingerprint)fail('STASH_ALREADY_RESTORED','这条记录已经取回到当前项目，无需重复操作。原 Stash 仍保留。');
  const {entry,files}=await selection(ctx,state,params.stashId);await rehearse(ctx,state,entry);
  return {entry,files,fingerprint:state.fingerprint,requiresRules:state.sources.length>0,checkedAt:new Date().toISOString()};
}
async function backup(ctx,state,files,id,tracked) {
  const base=path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path','jixin-stash-backups'])).trim());
  await fs.mkdir(base,{recursive:true,mode:0o700});if((await fs.lstat(base)).isSymbolicLink())fail('UNSAFE_BACKUP','备份目录不能是符号链接。');
  const index=path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path','index'])).trim()),indexStat=await fs.lstat(index);
  if(!indexStat.isFile()||indexStat.isSymbolicLink())fail('UNSAFE_BACKUP','暂存区索引不是普通文件，请联系项目负责人核对。');
  const info=[];let required=32*1024*1024+indexStat.size;
  for(const file of files){const stat=await local(ctx,file.path);info.push({path:file.path,exists:!!stat,size:stat?.size||0,mode:stat?.mode||0,backupFile:stat?String(info.length):null});required+=stat?.size||0;}
  const disk=await fs.statfs(base,{bigint:true});if(disk.bavail*disk.bsize<BigInt(Math.ceil(required)))fail('STASH_BACKUP_SPACE','备份所在磁盘空间不足，尚未取回，请先释放空间。');
  const directory=path.join(base,id);await fs.mkdir(directory,{mode:0o700});
  for(const item of info)if(item.exists)await fs.copyFile(path.join(ctx.root,item.path),path.join(directory,item.backupFile));
  await fs.copyFile(index,path.join(directory,'index'));
  await fs.writeFile(path.join(directory,'staged.patch'),await ctx.run(['diff','--cached','--binary','--no-ext-diff','--no-textconv',state.head,'--']),{mode:0o600});
  await fs.writeFile(path.join(directory,'worktree.patch'),await ctx.run(['diff','--binary','--no-ext-diff','--no-textconv','--']),{mode:0o600});
  await fs.writeFile(path.join(directory,'before.json'),JSON.stringify({head:state.head,branch:state.branch,fingerprint:state.fingerprint,trackedSnapshot:tracked,files:info}),{mode:0o600});
  return directory;
}
async function restore(ctx,state,params,verify) {
  if(!idValid(params.operationId))fail('INVALID_REQUEST','取回操作编号无效。');
  if(params.confirmStashId!==params.stashId)fail('STASH_CONFIRMATION_REQUIRED','请先确认要取回的具体暂存记录。');
  if(params.previewFingerprint!==state.fingerprint)fail('STALE_REVIEW','预检后文件或项目规则已变化，请重新预检再确认。');
  await check(ctx,state);
  const previous=await read(ctx);
  if(previous?.state==='restored'&&previous.stashId===params.stashId&&previous.afterFingerprint===state.fingerprint)fail('STASH_ALREADY_RESTORED','这条记录已经取回到当前项目，无需重复操作。原 Stash 仍保留。');
  const {entry,files}=await selection(ctx,state,params.stashId),tracked=await rehearse(ctx,state,entry);
  const directory=await backup(ctx,state,files,params.operationId,tracked);
  if((await verify()).fingerprint!==state.fingerprint)fail('STALE_REVIEW','备份期间项目内容发生变化，尚未取回，请重新检查。备份：'+directory);
  await browser.selected(ctx,entry.id);
  const record={id:params.operationId,root:ctx.root,stashId:entry.id,ref:entry.ref,paths:files.map(f=>f.path),backup:directory,state:'prepared',createdAt:new Date().toISOString()};
  await write(ctx,record);
  try {
    record.state='applying';await write(ctx,record);
    await ctx.run(['stash','apply','--index',entry.id]);
    record.afterFingerprint=(await verify()).fingerprint;record.state='restored';record.completedAt=new Date().toISOString();record.message='已取回 '+files.length+' 个文件到本地，恢复记录中的暂存状态；原 Stash 保留，未提交或上传。';await write(ctx,record);
  } catch(error) {
    record.state='needs-verification';record.message='取回未全部完成或结果待核对，请检查文件、暂存区和备份，勿重复取回。原 Stash 保留。';record.detail=(error.stderr||error.message||'').slice(0,3000);await write(ctx,record);
  }
  return record;
}
async function acknowledge(ctx,state,params) {
  const record=await read(ctx);
  if(!record||record.id!==params.recordId)fail('STALE_REVIEW','取回记录已变化，请重新检查。');
  if(params.confirmed!==true)fail('RULE_REVIEW_REQUIRED','请先核对实际文件、暂存区和备份，再确认。');
  await check(ctx,state);await require('./file-changes.cjs').assertSettled(ctx);
  if(!unsettled(record))return record;
  record.previousState=record.state;record.state='acknowledged';record.acknowledgedAt=new Date().toISOString();record.message='已记录人工核对，仅解除后续操作限制，不会重复取回。';await write(ctx,record);return record;
}
module.exports={read,assertSettled,preview,restore,acknowledge};
