const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const execute = promisify(execFile), tickets = new Map(), queues = new Map();
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
function environment() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return { ...env, GIT_TERMINAL_PROMPT:'0', GCM_INTERACTIVE:'never', GIT_EDITOR:'true', GIT_SEQUENCE_EDITOR:'true' };
}
async function context(directory, skipSshBinding = false, allowInvalidIdentity = false) {
  await require('./ssh-agent-env.cjs').inheritSshAgent();
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('INVALID_DIRECTORY','请选择项目根目录');
  const root = await fs.realpath(directory);
  const binary = 'git'; // Use the installed Git, never a project-adjacent executable.
  const env = environment();
  const run = async (args, options = {}) => (await execute(binary, ['--no-optional-locks','-c','core.fsmonitor=false','-C',root,...args], {env,encoding:options.raw?'buffer':'utf8',timeout:90000,maxBuffer:options.filenameList ? 16*1024*1024 : 2*1024*1024,windowsHide:true})).stdout;
  let toplevel;
  try {toplevel=await fs.realpath((await run(['rev-parse','--show-toplevel'])).trim());}
  catch(error) {if(error.code==='ENOENT')fail('GIT_REQUIRED','这台电脑尚未配置版本管理组件，请联系项目负责人。');fail('NOT_GIT_PROJECT','这个文件夹不是已准备好的团队项目。请选择已有项目的最外层文件夹，或联系项目负责人。');}
  if (toplevel !== root) fail('NOT_PROJECT_ROOT','请选择 Git 仓库根目录，不能在父仓库中执行');
  const ctx = {root,run,binary,env};
  let identity, identityError;
  try { identity = skipSshBinding ? null : await require('./project-ssh.cjs').load(ctx); }
  catch (error) {
    if (!allowInvalidIdentity) throw error;
    identityError = {configured:false,invalid:true,code:'SSH_IDENTITY_INVALID',message:'项目 SSH 身份已失效，请重新确认绑定；联网操作已阻止。'};
  }
  if (identity) env.GIT_SSH_COMMAND = identity.command;
  return {...ctx,sshIdentity:identityError || (identity ? {configured:true,keyName:identity.keyName,fingerprint:identity.fingerprint} : {configured:false})};
}
async function optional(run,args) { try { return (await run(args)).trim(); } catch (e) { if (e.code === 1) return ''; throw e; } }
async function snapshot({root,run}) {
  const branch=await optional(run,['symbolic-ref','--quiet','--short','HEAD']);
  let head=''; try { head=(await run(['rev-parse','--verify','HEAD'])).trim(); } catch { /* unborn */ }
  const changes=[], fields=(await run(['status','--porcelain=v1','-z','--untracked-files=all'])).split('\0');
  for(let i=0;i<fields.length;i++) { const row=fields[i]; if(!row) continue; const item={status:row.slice(0,2),path:row.slice(3)}; if(/[RC]/.test(item.status)) item.original=fields[++i]; changes.push(item); }
  const branches=(await run(['for-each-ref','--format=%(refname:short)','refs/heads/'])).trim().split('\n').filter(Boolean);
  const remoteDefault=await optional(run,['symbolic-ref','--quiet','--short','refs/remotes/origin/HEAD']);
  const protectedBranches=[...new Set([remoteDefault.replace(/^origin\//,''),'main','master'].filter(Boolean))];
  const tracked=(await run(['ls-files','-z'])).split('\0');
  const pending=[...new Set(['AGENTS.md','CONTRIBUTING.md',...tracked.filter(p=>/(^|\/)AGENTS\.md$/.test(p) || /^\.github\/(?:pull_request_template\.md|PULL_REQUEST_TEMPLATE\.md|PULL_REQUEST_TEMPLATE\/.*\.md)$/.test(p))])];
  const sources=[],seen=new Set(); let incomplete=false, ruleBytes=0;
  while(pending.length) {
    const relative=pending.shift(); if(seen.has(relative)) continue;
    if(seen.size>=80) {incomplete=true;break;}
    seen.add(relative);
    const target=path.resolve(root,relative), rel=path.relative(root,target);
    if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)) continue;
    try {
      const real=await fs.realpath(target); if(real!==target) fail('RULE_SYMLINK','规则文件不能通过符号链接读取：'+relative);
      const stat=await fs.lstat(target); if(!stat.isFile() || stat.size>128*1024) fail('RULE_TOO_LARGE','规则文件过大或不是普通文件：'+relative);
      const content=await fs.readFile(target,'utf8'); ruleBytes+=Buffer.byteLength(content);
      if(ruleBytes>1024*1024) {incomplete=true;break;}
      sources.push({path:relative,content});
      for(const match of content.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g)) {
        if(!/^[a-z]+:/i.test(match[1])) pending.push(path.relative(root,path.resolve(path.dirname(target),match[1])));
      }
    } catch(e) { if(!['ENOENT','ENOTDIR'].includes(e.code)) throw e; }
  }
  const hooksPath=await optional(run,['config','--path','--get','core.hooksPath']);
  const hookBase=hooksPath ? path.resolve(root,hooksPath) : path.resolve(root,(await run(['rev-parse','--git-path','hooks'])).trim());
  const hooks=[];
  for(const name of require('./hook-names.cjs')) {
    try { const target=path.join(hookBase,name),content=await fs.readFile(target); let executable=true;
      if(process.platform!=='win32') {try {await fs.access(target,require('node:fs').constants.X_OK);}catch{executable=false;}}
      hooks.push({name,executable,hash:createHash('sha256').update(content).digest('hex')});
    } catch(e) {if(e.code!=='ENOENT') throw e;}
  }
  let expectedHooks=false; try { expectedHooks=(await fs.stat(path.join(root,'.githooks'))).isDirectory(); } catch(e) {if(e.code!=='ENOENT') throw e;}
  const trackedHooks=tracked.filter(p=>p.startsWith('.githooks/')&&!p.slice(10).includes('/')&&require('./hook-names.cjs').includes(p.slice(10)));
  expectedHooks=expectedHooks||trackedHooks.length>0;
  const hooksReady=(!expectedHooks || hookBase===path.join(root,'.githooks')) && hooks.every(h=>h.executable) && trackedHooks.every(p=>hooks.some(h=>h.name===p.slice(10)));
  const rulesText=sources.map(s=>s.content).join('\n');
  const requirements={signoff:/DCO|Signed-off-by:/i.test(rulesText),conventional:/<type>\(<scope>\)|Conventional Commits/i.test(rulesText)};
  const value={root,branch,head,changes,branches,protectedBranches,sources,incomplete,hooksPath:hookBase,hooks,hooksReady,requirements};
  const worktree=[];
  for(const item of changes) {
    try {const stat=await fs.lstat(path.join(root,item.path));worktree.push([item.path,stat.size,stat.mtimeMs,stat.ctimeMs,stat.mode]);}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const staged=await run(['diff','--cached','--raw','--no-abbrev','-z','--no-ext-diff','--no-textconv']);
  return {...value,fingerprint:createHash('sha256').update(JSON.stringify([value,staged,worktree])).digest('hex')};
}
async function gitRequest(directory,params={}) {
  const {action='status'}=params;
  const root=await fs.realpath(directory);
  // Progress must not wait behind the write it is observing. Never issue a ticket
  // or expose journal details; scope reads to the current operation identifier.
  if(action==='operation-progress') {
    if(typeof params.operationId!=='string'||!/^[a-zA-Z0-9-]{16,60}$/.test(params.operationId)) fail('INVALID_REQUEST','操作编号无效');
    const ctx=await context(directory,true),record=await require('./beginner-git.cjs').readReceipt(ctx);
    if(!record||record.id!==params.operationId||record.action!=='beginner-update')return null;
    return {id:record.id,state:record.state,step:record.step,completed:record.completed||[]};
  }
  const previous=queues.get(root)||Promise.resolve();
  const job=previous.then(async()=>{
    const ctx=await context(directory,['ssh-identity-set','file-revert','file-revert-acknowledge'].includes(action),action==='status'),run=ctx.run;
    let lock;
    if(!['status','diff','history','issues-list'].includes(action)) {
      lock=path.resolve(ctx.root,(await run(['rev-parse','--git-path','jixin-write.lock'])).trim());
      try {await fs.mkdir(lock);}
      catch(error) {if(error.code==='EEXIST')fail('OPERATION_LOCKED','另一项项目操作正在执行，或上次操作意外中断。请先重新检查；仍无法继续时，让负责人核对实际状态和 Git 元数据中的 jixin-write.lock，不要重复提交。');throw error;}
    }
    try {
    const state=await snapshot(ctx);
    if(lock&&!['file-diff','file-revert-acknowledge'].includes(action))await require('./file-changes.cjs').assertSettled(ctx);
    if(action==='identity-fill') {await require('./git-identity.cjs').fillIdentity(ctx,ctx.env,params);return await require('./project-setup.cjs').prepareProject(ctx,state,{confirmed:true,env:ctx.env});}
    if(action==='prepare') return await require('./project-setup.cjs').prepareProject(ctx,state,{confirmed:params.confirmProjectSetup===true,env:ctx.env});
    if(action==='status') {
      const token=randomUUID();tickets.set(token,{root,fingerprint:state.fingerprint,expires:Date.now()+10*60*1000});
      for(const [key,t] of tickets) if(t.expires<Date.now()) tickets.delete(key);
      const service=require('./beginner-git.cjs'),receipt=await service.readReceipt(ctx);
      return {...state,token,sshIdentity:ctx.sshIdentity,fileRevertReceipt:await require('./file-changes.cjs').readReceipt(ctx),beginnerReceipt:receipt ? {...receipt,retryable:service.retryableFailure(receipt)} : null};
    }
    if(action==='issues-list') return require('./github-issues.cjs').listIssues(ctx,params,ctx.env);
    if(action==='file-diff') return await require('./file-changes.cjs').compare(ctx,state,params);
    if(action==='diff') return {output:await run(['diff',...(params.staged?['--cached']:[]),'--no-ext-diff','--no-textconv','--stat','--patch'])};
    if(action==='history') return {output:await run(['log','-20','--format=%h %s (%an)','--no-show-signature'])};
    if(!['file-revert','file-revert-acknowledge','ssh-identity-set','branch-create','branch-switch','stage','unstage','commit','fetch','pull','push','pr','beginner-submit','beginner-update','beginner-acknowledge'].includes(action)) fail('UNKNOWN_ACTION','不支持此 Git 操作');
    if(action.startsWith('beginner-')) {const prior=await require('./beginner-git.cjs').readReceipt(ctx);if(prior?.id===params.operationId)return prior;}
    const ticket=tickets.get(params.token);tickets.delete(params.token);
    if(!ticket || ticket.root!==root || ticket.expires<Date.now() || ticket.fingerprint!==state.fingerprint) fail('STALE_REVIEW','仓库或规则已变化，请刷新并重新核对');
    if(params.rulesConfirmed!==true) fail('RULE_REVIEW_REQUIRED','请先阅读项目规则，并确认此次操作满足其中的人工要求；未确认不执行');
    if(action==='file-revert-acknowledge') return await require('./file-changes.cjs').acknowledge(ctx,params);
    if(state.incomplete) fail('RULE_DISCOVERY_INCOMPLETE','规则路由超过读取上限，请使用高级工作流核对');
    if(!state.hooksReady) fail('HOOKS_NOT_READY','项目 hooks 未正确启用或不可执行，请按贡献指南配置后重试');
    if(action==='file-revert') return await require('./file-changes.cjs').revert(ctx,state,params,()=>snapshot(ctx));
    if(action==='ssh-identity-set') return await require('./project-ssh.cjs').bind(ctx,params);
    if(!state.branch) fail('DETACHED_HEAD','当前为 detached HEAD，请先在外部恢复命名分支');
    if(action==='beginner-acknowledge') {
      const service=require('./beginner-git.cjs'),prior=await service.readReceipt(ctx);
      if(!prior || prior.id!==params.recordId) fail('STALE_REVIEW','需要重新检查上次操作记录。');
      await service.acknowledge(ctx,prior);return {message:'已记录核对，不会重放原操作。'};
    }
    if(action.startsWith('beginner-')) return await require('./beginner-git.cjs').runBeginner(ctx,state,params,ctx.env);
    if(state.protectedBranches.includes(state.branch) && ['commit','push','pr'].includes(action)) fail('PROTECTED_BRANCH','当前为主分支 '+state.branch+'：禁止直接提交或推送。请新建工作分支，提交后通过 PR 合入。');
    let args;
    if(action.startsWith('branch-')) {
      if(typeof params.branch!=='string' || params.branch.startsWith('-') || params.branch===state.branch) fail('INVALID_BRANCH','请输入新的有效分支名');
      await run(['check-ref-format','--branch',params.branch]);
      if(action==='branch-switch' && state.changes.length) fail('DIRTY_WORKTREE','有未提交改动，请先处理后切换分支');
      args=['switch',...(action==='branch-create'?['-c']:[]),params.branch];
    } else if(['stage','unstage'].includes(action)) {
      const paths=params.paths;
      if(!Array.isArray(paths)||!paths.length||paths.length>200||paths.some(p=>typeof p!=='string'||!state.changes.some(c=>c.path===p))) fail('INVALID_PATHS','请选择当前改动列表中的文件');
      const literal=paths.map(p=>':(literal)'+p);
      args=action==='stage'?['add','--',...literal]:state.head?['restore','--staged','--',...literal]:['rm','--cached','--',...literal];
    } else if(action==='commit') {
      if(typeof params.message!=='string'||!params.message.trim()||params.message.length>4000) fail('INVALID_MESSAGE','请填写提交信息');
      if(state.requirements.conventional && !/^(feat|fix|refactor|perf|chore|docs|test|revert|build|ci|art)(\([^\n)]+\))?: .+/.test(params.message)) fail('COMMIT_FORMAT','项目要求提交信息格式：type(scope): 简短描述');
      if(/^Claude-Session:/mi.test(params.message)) fail('COMMIT_FORMAT','提交信息不能包含 Claude-Session 会话链接');
      if(!state.changes.some(c=>c.status[0]!==' '&&c.status[0]!=='?')) fail('NOTHING_STAGED','请先暂存需要提交的文件');
      args=['commit',...(state.requirements.signoff?['--signoff']:[]),'-m',params.message];
    } else if(action==='fetch') args=['fetch','origin'];
    else if(action==='pull') {if(state.changes.length) fail('DIRTY_WORKTREE','请先处理未提交改动'); args=['pull','--ff-only','origin',state.branch];}
    else if(action==='push') args=['push','--set-upstream','origin','HEAD:refs/heads/'+state.branch];
    else {
      if(state.changes.length) fail('DIRTY_WORKTREE','请先提交或处理工作区改动再创建 PR');
      if(typeof params.title!=='string'||!params.title.trim()||params.title.length>160||typeof params.body!=='string'||!params.body.trim()||params.body.length>64000) fail('PR_DESCRIPTION_REQUIRED','请填写符合项目模板的 PR 标题和描述');
      const base=state.protectedBranches.includes(params.base)?params.base:state.protectedBranches[0];
      const github=require('./github-issues.cjs'),repo=await github.repository(ctx);
      try {
        const {stdout}=await execute('gh',['pr','create','--repo','github.com/'+repo,'--base',base,'--head',state.branch,'--title',params.title,'--body',params.body],{...github.options(ctx,ctx.env),timeout:90000,maxBuffer:1024*1024});
        return {output:stdout};
      } catch(e) {
        if(e.code==='ENOENT') fail('PR_CLI_REQUIRED','未找到 gh，请安装并登录 GitHub CLI 后再创建PR。本次未创建PR。');
        fail('PR_RESULT_UNCONFIRMED',(e.stderr||e.message)+'\n请先在远端核对PR是否已经创建，不要直接重复点击。');
      }
    }
    try { return {output:await run(args)}; }
    catch(e) { fail('GIT_OPERATION_FAILED',(e.stderr||e.message)+'\n操作可能已部分完成，请刷新核对，不要直接重复执行。'); }
    } finally {if(lock)await fs.rmdir(lock);}
  });
  queues.set(root,job.catch(()=>{}));return job;
}
module.exports={gitRequest};
