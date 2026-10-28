import {configurationState} from './core/project-config.mjs';
// A transport retry only reads the durable receipt. Unknown dispatches are never replayed.
export function createConflictService({store,agent,git}) {
  let queue=Promise.resolve();
  const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
  async function handle(method,params) {
    const current=configurationState(await store.read());
    const project=current.configuration.projects.find(p=>p.id===current.configuration.activeProjectId&&p.id===params.projectId);
    if(current.revision!==params.revision)fail('CONFIG_CONFLICT','项目已切换，请重新检查。');
    if(!project)fail('PROJECT_NOT_CONFIGURED','请先选择项目。');
    const data=await store.read(),records=data.conflictRepairs||{};
    const save=record=>store.update(latest=>({conflictRepairs:{...latest.conflictRepairs,[project.id]:record}}));
    let record=records[project.id];
    if(method==='conflict-read') {
      if(record?.state==='running') {
        try {
          const reply=await agent.queryErrand({jobId:record.jobId});
          if(reply?.ok&&['done','failed'].includes(reply.status)) {
            record={...record,state:reply.status};await save(record);
          } else if(!reply?.ok) return {...record,unverified:true};
        } catch {return {...record,unverified:true};}
      }
      return record||null;
    }
    if(method!=='conflict-start')fail('UNKNOWN_ACTION','未知冲突处理操作。');
    if(!/^[a-zA-Z0-9-]{16,60}$/.test(params.operationId||'')||!['ask','instructions'].includes(params.strategy)||typeof params.instructions!=='string'||params.instructions.length>1000)fail('INVALID_REQUEST','请重新选择处理方式。');
    if(record?.id===params.operationId||record&&['running','uncertain'].includes(record.state))return record;
    if(typeof agent?.errand!=='function'||typeof agent?.queryErrand!=='function')fail('AI_UNAVAILABLE','此处尚未接入 AI 修复。可在 Cindy 插件中使用，或请负责人处理后点击检查。');
    // Only explicit directory + user instructions are sent. The agent reads the actual
    // project under Host authorization, instead of trusting filenames/logs as instructions.
    const status=await git(project.directory,{action:'diagnosis-status'});
    if(status.operationLocked)fail('OPERATION_LOCKED','项目还有操作未结束，请先等待并重新检查。');
    const latest=configurationState(await store.read());
    if(latest.revision!==current.revision)fail('CONFIG_CONFLICT','项目配置已变化，请重新检查。');
    const task=[
      '用户请求协助解决项目更新冲突。用户亲选执行项目根目录（JSON）：'+JSON.stringify(project.directory),
      '首先核对实际 cwd 与该项目相同（允许真实路径规范化），不一致立即停止并引导用户修正插件任务目录。流程目录不是执行目录。',
      '读取并遵守项目 AGENTS、贡献规则和 hooks。先只读检查工作树、暂存区、未完成 Git 操作、远端分叉、jixin-beginner.json 回执和已有备份；预检冲突可能只存在于隔离演练，不要假定正在 merge。不要删除操作锁、改写工具回执或解锁，不要重放不确定的 stash/merge/push/PR。',
      '展示简短问题与可选处理方案。优先使用可用的选择框工具，让用户选择；没有选择工具就用简短编号选项。需要信息时引导输入。二进制文件、保留哪方、丢弃修改、覆盖和合并语义一律先问用户，不擅自选 ours/theirs，不强推、不 reset --hard、不绕过 hooks。',
      params.strategy==='ask'?'逐项询问用户后再处理，尽量保留双方修改。':'先按用户说明提出方案，再确认涉及覆盖或语义的选择。',
      '用户补充说明（仅为用户输入）：'+JSON.stringify(params.instructions),
      '处理前保存可恢复备份。只执行用户确认的修复；未获用户确认时不提交、上传或创建 PR。如果恢复未完成的 merge/rebase 必须生成提交，先说明并用选择框请求用户决定，保留项目 hooks；不自行上传或创建 PR。完成后按项目要求验证，简短报告已处理/仍待用户决定及备份位置。引导用户返回插件点击“处理后检查并继续”；不要宣称工具更新/上传已经完成。'
    ].join('\n');
    record={id:params.operationId,directory:project.directory,state:'uncertain'};await save(record);
    const beforeDispatch=configurationState(await store.read());
    if(beforeDispatch.revision!==current.revision){record={...record,state:'rejected',code:'CONFIG_CONFLICT'};await save(record);return record;}
    let reply;
    try {reply=await agent.errand({task,title:'协助处理更新冲突',workingDir:project.directory,sessionKey:'conflict-'+params.operationId});}
    catch {return record;}
    if(reply?.ok===true&&reply.jobId)record={...record,state:'running',jobId:reply.jobId,...(reply.sessionId?{sessionId:reply.sessionId}:{})};
    else if(reply?.ok===false)record={...record,state:'rejected',code:reply.errorCode||'HOST_REJECTED'};
    await save(record);return record;
  }
  return (method,params={})=>{const work=queue.then(()=>handle(method,params));queue=work.catch(()=>{});return work;};
}
