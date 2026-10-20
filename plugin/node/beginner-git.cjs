const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const fail = (code,message) => {throw Object.assign(new Error(message),{code});};
async function receiptPath(ctx) {
  return path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path','jixin-beginner.json'])).trim());
}
async function readReceipt(ctx) {
  try {
    const file=await receiptPath(ctx),stat=await fs.lstat(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64000) fail('JOURNAL_INVALID','上一次操作记录无法读取，请联系项目负责人核对。');
    return JSON.parse(await fs.readFile(file,'utf8'));
  } catch(e) {if(e.code==='ENOENT')return null;throw e;}
}
async function writeReceipt(ctx,record) {
  const file=await receiptPath(ctx),temporary=file+'.'+randomUUID()+'.tmp';
  await fs.writeFile(temporary,JSON.stringify(record),{flag:'wx',mode:0o600});
  await fs.rename(temporary,file);
}
async function baseBranch(ctx,state) {
  for(const branch of state.protectedBranches) {
    try {await ctx.run(['rev-parse','--verify','refs/remotes/origin/'+branch]);return branch;}
    catch(e) {if(typeof e.code!=='number')throw e;}
  }
  fail('TEAM_NOT_CONFIGURED','还没找到团队的正式版本。请让项目负责人连接团队仓库，再进行更新或提交。');
}
function friendlyFailure(error,step,completed) {
  if(error.code==='ENOENT') return '这台电脑缺少团队送审组件，请联系项目负责人配置。';
  if(error.code==='DIRTY_WORKTREE') return error.message;
  const saved=completed.includes('commit'),uploaded=completed.includes('push');
  if(saved && !uploaded) return '修改已保存在这台电脑，但还没有确认上传成功。请联系项目负责人核对，不要再次提交。';
  if(uploaded) return '修改已上传，但送审结果还没有确认。请联系项目负责人核对审核列表，不要重复送审。';
  if(step==='commit') return '项目提交检查未通过，修改仍保留在电脑中。请按下方检查结果处理，或交给项目负责人。';
  if(step==='merge') return '团队版本和你的本地版本暂时不能安全更新。工具没有覆盖你的修改，请联系项目负责人处理。';
  return '操作没有全部完成，你的文件已保留。请联系项目负责人核对后再继续。';
}
async function runBeginner(ctx,state,params,env) {
  const prior=await readReceipt(ctx);
  if(prior?.id===params.operationId) return prior;
  if(prior && ['running','needs-verification','blocked'].includes(prior.state)) fail('PREVIOUS_OPERATION_PENDING','上一次操作还需要核对。请把操作详情交给项目负责人，暂时不要再次提交。');
  if(typeof params.operationId!=='string'||!/^[a-zA-Z0-9-]{16,60}$/.test(params.operationId)) fail('INVALID_REQUEST','操作编号无效，请重新检查项目。');
  if(state.changes.some(c=>/U/.test(c.status)||['AA','DD'].includes(c.status))) fail('PROJECT_CONFLICT','项目里有尚未处理的文件冲突。请联系项目负责人处理，工具不会替你覆盖文件。');
  for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply']) {
    const file=path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-path',name])).trim());
    try {await fs.lstat(file);fail('PROJECT_CONFLICT','项目有一项尚未完成的版本操作，请联系负责人先处理。');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const base=await baseBranch(ctx,state);
  const submit=params.action==='beginner-submit';
  let selected,message;
  if(submit) {
    if(!Array.isArray(params.paths)||!params.paths.length||params.paths.length>200||params.paths.some(p=>typeof p!=='string'||!state.changes.some(c=>c.path===p))) fail('SELECT_FILES','请先勾选这次要提交的文件。');
    if(typeof params.summary!=='string'||!params.summary.trim()||params.summary.length>160||/[\r\n]/.test(params.summary)) fail('WRITE_SUMMARY','请用一句话说明这次改了什么。');
    if(state.changes.some(c=>c.status[0]!==' '&&c.status[0]!=='?')) fail('EXISTING_STAGED_CHANGES','项目里还有之前准备提交的内容。为了不把其它人的修改一起提交，请让负责人先核对。');
    const ahead=(await ctx.run(['rev-list','refs/remotes/origin/'+base+'..HEAD'])).trim();
    if(ahead) fail('UNREVIEWED_COMMITS','电脑里还有尚未进入团队正式版本的记录。请先等待已有审核或让负责人核对，避免把其它修改一起送审。');
    selected=[...new Set(params.paths)];
    message=state.requirements.conventional ? 'chore: '+params.summary.trim() : params.summary.trim();
    if(/^Claude-Session:/mi.test(message)) fail('WRITE_SUMMARY','请只填写修改内容，不要填写会话链接。');
    if(state.sources.filter(s=>/pull_request_template/i.test(s.path)).length>1) fail('REVIEW_TEMPLATE_AMBIGUOUS','团队有多种送审模板，需要负责人确认本次使用哪一种。文件未提交或上传。');
    // Verify the review component before creating branches or touching the index.
    try {await execute('gh',['auth','status'],{cwd:ctx.root,env,timeout:20000,maxBuffer:256*1024,windowsHide:true});}
    catch {fail('REVIEW_ACCOUNT_REQUIRED','这台电脑还没有连接团队审核账号。请联系项目负责人完成连接；本次没有提交或上传。');}
  } else if(state.changes.length) fail('DIRTY_WORKTREE','你还有未提交的修改。请先提交，或者请负责人协助保留修改后再更新；工具不会覆盖它们。');
  const record={id:params.operationId,action:params.action,state:'running',completed:[],step:'prepare',base,createdAt:new Date().toISOString()};
  async function step(name,work) {
    record.step=name;process.stderr.write('beginner-step: '+name+'\n');await writeReceipt(ctx,record);
    const result=await work();record.completed.push(name);await writeReceipt(ctx,record);return result;
  }
  // Write before the first side effect. A crashed/uncertain receipt never replays.
  await writeReceipt(ctx,record);
  try {
    if(!submit) {
      await step('fetch',()=>ctx.run(['fetch','origin']));
      await step('merge',()=>ctx.run(['merge','--ff-only','refs/remotes/origin/'+base]));
      record.message='项目已更新，可以继续工作。';record.state='updated';
    } else {
      const branch='work/change-'+Date.now().toString(36)+'-'+randomUUID().slice(0,8);record.branch=branch;
      await step('branch',()=>ctx.run(['switch','-c',branch]));
      await step('stage',()=>ctx.run(['add','--',...selected.map(p=>':(literal)'+p)]));
      await step('commit',()=>ctx.run(['commit',...(state.requirements.signoff?['--signoff']:[]),'-m',message]));
      record.commit=(await ctx.run(['rev-parse','HEAD'])).trim();
      await step('push',()=>ctx.run(['push','--set-upstream','origin','HEAD:refs/heads/'+branch]));
      const templates=state.sources.filter(s=>/pull_request_template/i.test(s.path));
      // Templates with team-specific checklists cannot be truthfully completed by a generic Git service.
      const body=params.summary.trim()+'\n\n本次提交的文件：\n'+selected.map(p=>'- '+p).join('\n')+(templates.length===1?'\n\n'+templates[0].content:'');
      if(templates.length) record.templateNotice='项目有审核模板，请审核人在送审详情中核对其要求。';
      const result=await step('review',()=>execute('gh',['pr','create',...(templates.length?['--draft']:[]),'--base',base,'--head',branch,'--title',message,'--body',body],{cwd:ctx.root,env,timeout:60000,maxBuffer:256*1024,windowsHide:true}));
      record.reviewUrl=result.stdout.trim();record.message=templates.length?'修改已上传，送审草稿需要负责人按模板完善。':'修改已提交，等待团队审核。';record.state=templates.length?'review-draft':'awaiting-review';
    }
    record.step='finished';await writeReceipt(ctx,record);return record;
  } catch(error) {
    record.state=error.killed||['push','review','merge','stage'].includes(record.step)?'needs-verification':'blocked';
    record.message=friendlyFailure(error,record.step,record.completed);
    record.detail=(error.stderr||error.message||'').replace(/(https?:\/\/)[^/\s@]+@/gi,'$1[redacted]@').replace(/(token|password|secret)=([^\s&]+)/gi,'$1=[redacted]').slice(0,3000);
    await writeReceipt(ctx,record);return record;
  }
}
async function acknowledge(ctx,prior) {await writeReceipt(ctx,{...prior,state:'acknowledged',previousState:prior.state,acknowledgedAt:new Date().toISOString()});}
module.exports={readReceipt,runBeginner,acknowledge};
