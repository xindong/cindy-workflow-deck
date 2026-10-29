// Durable across workers and both app forms; all changes hold jixin-write.lock.
const fs=require('node:fs/promises');
const path=require('node:path');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
async function location(ctx){return path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path','jixin-ai-repair.json'])).trim());}
async function read(ctx){
  try {
    const file=await location(ctx),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)fail('JOURNAL_INVALID','AI 处理记录无法读取，请联系负责人核对。');
    const record=JSON.parse(await fs.readFile(file,'utf8'));
    if(!/^[a-zA-Z0-9-]{16,60}$/.test(record.id||'')||record.directory!==ctx.root)fail('JOURNAL_INVALID','AI 处理记录与当前项目不匹配，请联系负责人核对。');
    return record;
  }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function reserve(ctx,id){
  if(!/^[a-zA-Z0-9-]{16,60}$/.test(id||''))fail('INVALID_REQUEST','处理编号无效。');
  const prior=await read(ctx);
  if(prior){if(prior.id===id)return prior;fail('AI_REPAIR_PENDING','AI 处理尚未结束或需要核对，请先到任务列表检查，再从恢复卡确认。');}
  const record={id,directory:ctx.root,state:'uncertain'};
  await fs.writeFile(await location(ctx),JSON.stringify(record),{flag:'wx',mode:0o600});
  return record;
}
async function release(ctx,params,state){
  const prior=await read(ctx);
  if(prior&&prior.id!==params.recordId)fail('STALE_REVIEW','处理任务已变化，请重新检查。');
  if(params.manual===true){
    if(params.confirmed!==true)fail('RULE_REVIEW_REQUIRED','请先确认任务已停止或结束，并核对文件和备份。');
    await require('./beginner-git.cjs').assertNoPendingGit(ctx,state);
    await require('./file-changes.cjs').assertSettled(ctx);
    if(!state.hooksReady||state.incomplete)fail('HOOKS_NOT_READY','请先完成项目规则与 hooks 检查。');
  }
  if(!prior)return {released:false};
  await fs.unlink(await location(ctx));
  return {released:true};
}
async function assertAvailable(ctx){if(await read(ctx))fail('AI_REPAIR_PENDING','AI 正在处理项目或处理结果待核对。请先到任务列表核对，再从恢复卡检查或确认解除限制。');}
module.exports={read,reserve,release,assertAvailable};
