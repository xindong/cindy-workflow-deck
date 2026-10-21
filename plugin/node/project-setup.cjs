const fs=require('node:fs/promises');
const path=require('node:path');
const hookNames=['pre-commit','prepare-commit-msg','commit-msg','pre-push','post-checkout','post-commit','post-merge'];
const problem=(code,message)=>Object.assign(new Error(message),{code});
// Only declarative local Git settings are supported. Never execute instructions,
// installers, hooks, login flows or package-manager commands during preparation.
async function prepareProject(ctx,state,{confirmed=false,env=process.env}={}) {
  if(!confirmed)throw problem('SETUP_NOT_CONFIRMED','请先选择项目目录，确认自动准备该项目。');
  const {root,run}=ctx,completed=[],blockers=[];
  try {
    if(state.incomplete)throw problem('RULE_DISCOVERY_INCOMPLETE','项目规则未读取完整，暂不能自动准备。');
    const expected=path.join(root,'.githooks');
    if(!state.hooksReady) {
      const declaration=state.sources.find(s=>/^[ \t]*git[ \t]+config[ \t]+(?:--local[ \t]+)?core\.hooksPath[ \t]+(?:["']\.githooks["']|\.githooks)[ \t]*\r?$/m.test(s.content));
      if(!declaration)throw problem('SETUP_RULE_REQUIRED','项目尚未提供可自动识别的提交检查启用规则，请负责人补充一次。');
      let committed;
      try {committed=await run(['show','HEAD:'+declaration.path]);}catch{throw problem('SETUP_UNCOMMITTED_RULE','自动准备只采用项目已提交的规则。');}
      if(committed.replace(/\r\n/g,'\n')!==declaration.content.replace(/\r\n/g,'\n'))throw problem('SETUP_UNCOMMITTED_RULE','项目准备规则有尚未提交的修改，需负责人核对。');
      const target=await fs.realpath(expected);if(target!==expected)throw problem('SETUP_HOOK_SYMLINK','项目提交检查目录不能是符号链接。');
      const gitDir=path.resolve(root,(await run(['rev-parse','--git-dir'])).trim()),common=path.resolve(root,(await run(['rev-parse','--git-common-dir'])).trim());
      if(gitDir!==common)throw problem('SETUP_SHARED_WORKTREE','该工作目录共享其他项目的Git设置，需负责人核对一次。');
      let configured='';try{configured=(await run(['config','--path','--get','core.hooksPath'])).trim();}catch(e){if(e.code!==1)throw e;}
      if(configured&&path.resolve(root,configured)!==expected)throw problem('SETUP_EXISTING_HOOKS','已有另一套提交检查配置，工具不会覆盖，请负责人核对一次。');
      const tracked=(await run(['ls-files','--stage','-z','--','.githooks'])).split('\0').filter(Boolean),repairs=[];
      let count=0;
      for(const name of hookNames) {
        const file=path.join(expected,name);let stat;
        try{stat=await fs.lstat(file);}catch(e){if(e.code==='ENOENT'){if(!tracked.some(row=>row.endsWith('\t.githooks/'+name)))continue;throw problem('SETUP_MISSING_HOOK','项目提交检查缺少文件：'+name);}throw e;}
        if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024)throw problem('SETUP_UNSAFE_HOOK','项目提交检查不是可确认的普通文件：'+name);
        const row=tracked.find(row=>row.endsWith('\t.githooks/'+name));
        if(!row||!row.startsWith('100755 ')||!row.split('\t')[0].endsWith(' 0'))throw problem('SETUP_UNTRACKED_HOOK','项目提交检查必须是已跟踪的可执行文件：'+name);
        const changed=(await run(['-c','core.fileMode=false','diff','HEAD','--name-only','--','.githooks/'+name])).trim();
        if(changed)throw problem('SETUP_MODIFIED_HOOK','项目提交检查有本地修改：'+name+'，需负责人核对。');
        if(process.platform!=='win32'&&!(stat.mode&0o111))repairs.push({file,mode:stat.mode|0o111});
        count++;
      }
      if(!count)throw problem('SETUP_MISSING_HOOK','项目没有已提交的提交检查文件。');
      // The default hooks directory may contain independent user/LFS hooks.
      if(state.hooksPath!==expected)for(const hook of state.hooks) {
        let other;try{other=await fs.readFile(path.join(expected,hook.name));}catch(e){if(e.code!=='ENOENT')throw e;}
        const current=await fs.readFile(path.join(state.hooksPath,hook.name));
        if(!other||!other.equals(current))throw problem('SETUP_EXISTING_HOOKS','已有本地提交检查，工具不会停用或覆盖，请负责人核对一次。');
      }
      for(const repair of repairs)await fs.chmod(repair.file,repair.mode);
      if(!configured)await run(['config','--local','core.hooksPath','.githooks']);
      const actual=(await run(['config','--path','--get','core.hooksPath'])).trim();
      if(path.resolve(root,actual)!==expected)throw problem('SETUP_VERIFY_FAILED','项目提交检查启用结果未能确认，请重新检查。');
      completed.push('已按 '+declaration.path+' 启用项目原有提交检查');
    } else completed.push('项目提交检查已就绪');
  }catch(error){blockers.push({code:error.code||'SETUP_FAILED',message:error.code?.startsWith('SETUP_')||error.code==='RULE_DISCOVERY_INCOMPLETE'?error.message:'本地项目准备未完成，请重新检查或联系负责人。'});}
  const identity=await require('./git-identity.cjs').inspectIdentity(ctx,env);
  if(identity.state!=='ready')blockers.push({code:'GIT_IDENTITY_REQUIRED',message:identity.state==='available'?'已检测到当前 GitHub 账号，点击“一键补齐提交署名”即可。':identity.message});
  else completed.push('已沿用当前项目有效的Git署名');
  return {identity,state:blockers.length?'needs-attention':'ready',completed,blockers,message:blockers.length?'项目已保存；'+blockers.map(b=>b.message).join(' '):'项目本地准备已完成。更新与提交时会继续核对账号和本次修改的团队要求。'};
}
module.exports={prepareProject};
