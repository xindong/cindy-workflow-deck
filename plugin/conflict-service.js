import {configurationState,directoryKey} from './core/project-config.mjs';
import {projectTaskKey,PROJECT_TASK_TITLE,PROJECT_TASK_CONTEXT} from './project-task.js';
// A transport retry only reads the durable receipt. Unknown dispatches are never replayed.
export function createConflictService({store,agent,git}) {
  let queue=Promise.resolve();
  const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
  async function handle(method,params,source) {
    const current=configurationState(await store.read());
    const project=current.configuration.projects.find(p=>p.id===current.configuration.activeProjectId&&p.id===params.projectId);
    if(current.revision!==params.revision)fail('CONFIG_CONFLICT','项目已切换，请重新检查。');
    if(!project)fail('PROJECT_NOT_CONFIGURED','请先选择项目。');
    const data=await store.read(),key=directoryKey(project.directory);
    const legacy=Object.values(data.conflictRepairs||{}).find(item=>item?.directory&&directoryKey(item.directory)===key);
    let record=data.conflictRepairsByDirectory?.[key]||legacy;
    const save=next=>store.update(latest=>({conflictRepairsByDirectory:{...latest.conflictRepairsByDirectory,[key]:next}}));
    const release=(item,manual=false)=>git(project.directory,{action:'conflict-release',recordId:item.id,manual,...(manual?{confirmed:true}:{})});
    if(method==='conflict-read') {
      if(record&&['running','uncertain'].includes(record.state))await git(project.directory,{action:'conflict-reserve',operationId:record.id});
      if(record?.state==='running') {
        try {
          const reply=await agent.queryErrand({jobId:record.jobId});
          if(reply?.ok&&['done','failed'].includes(reply.status)) {
            record={...record,state:reply.status};await save(record);
          } else if(!reply?.ok) return {...record,unverified:true};
        } catch {return {...record,unverified:true};}
      }
      if(record&&['done','failed','rejected','acknowledged'].includes(record.state)&&!['OPERATION_LOCKED','AI_REPAIR_PENDING'].includes(record.code))await release(record);
      return record||null;
    }
    if(method==='conflict-acknowledge') {
      if(params.confirmed!==true||!record||record.id!==params.recordId)fail('STALE_REVIEW','请先到任务列表确认任务已停止或结束，核对文件与备份，再重新检查。');
      await release(record,true);
      record={...record,acknowledgedFrom:record.state,state:'acknowledged',acknowledgedAt:new Date().toISOString()};await save(record);return record;
    }
    if(method!=='conflict-start')fail('UNKNOWN_ACTION','未知冲突处理操作。');
    if(!/^[a-zA-Z0-9-]{16,60}$/.test(params.operationId||'')||!['ask','instructions'].includes(params.strategy)||typeof params.instructions!=='string'||params.instructions.length>1000)fail('INVALID_REQUEST','请重新选择处理方式。');
    const historical=data.conflictRepairHistory?.[params.operationId];
    if(historical&&directoryKey(historical.directory)===key)return historical;
    if(record?.id===params.operationId||record&&['running','uncertain'].includes(record.state))return record;
    if(typeof agent?.errand!=='function'||typeof agent?.queryErrand!=='function')fail('AI_UNAVAILABLE','此处尚未接入 AI 修复。可在 Cindy 插件中使用，或请负责人处理后点击检查。');
    // Only explicit directory + user instructions are sent. The agent reads the actual
    // project under Host authorization, instead of trusting filenames/logs as instructions.
    const status=await git(project.directory,{action:'diagnosis-status'});
    if(status.operationLocked)fail('OPERATION_LOCKED','项目还有操作未结束，请先等待并重新检查。');
    const latest=configurationState(await store.read());
    if(latest.revision!==current.revision)fail('CONFIG_CONFLICT','项目配置已变化，请重新检查。');
    const task=[
      PROJECT_TASK_CONTEXT,
      '用户请求协助解决项目更新冲突。用户亲选执行项目根目录（JSON）：'+JSON.stringify(project.directory),
      '首先核对实际 cwd 与该项目相同（允许真实路径规范化），不一致立即停止并引导用户修正插件任务目录。流程目录不是执行目录。',
      '读取并遵守项目 AGENTS、贡献规则和 hooks。先只读检查工作树、暂存区、未完成 Git 操作、远端分叉、jixin-beginner.json 回执和已有备份；预检冲突可能只存在于隔离演练，不要假定正在 merge。不要删除操作锁、改写工具回执或解锁，不要重放不确定的 stash/merge/push/PR。',
      '文本冲突优先给出保留双方有效内容的合并方案，不要只提供移走、改名或选择单方覆盖。MD、代码和配置等文件先检查真实内容与编码，不仅凭扩展名判断文本或二进制；读取相关本地与目标远端版本，有共同基线时做三方比较，没有基线时明确做双份内容比较，不虚构共同祖先。仅在确为二进制、内容无法安全解读、项目规则限制或用户明确选择时，才以移走、改名或保留单方作为主要方案，并说明原因。',
      '本地未跟踪文件与线上同名也是可比较合并的文本碰撞，不等同于无法合并。先备份并比较两份内容，展示建议合并结果与仍需决定的段落；无重叠的有效内容尽量保留，语义冲突逐项询问，不因能机械拼接就认定语义正确。',
      '如果当前更新尚未发生，不能把合并结果直接写回同名未跟踪路径后宣称已解除阻塞，也不能只移走本地文件就宣称内容已合并。向用户说明分阶段方案：经确认将本地内容移至可恢复备份位置以便插件接收线上文件，待更新完成后再确认目标版本并将已确认合并内容写回，验证双方内容均已保留；交接时明确列出尚待恢复的内容、备份位置与下一步。未完成恢复前不得宣称合并完成，不擅自替插件执行更新。',
      '展示简短问题与可选处理方案。优先使用可用的选择框工具，让用户选择；没有选择工具就用简短编号选项。需要信息时引导输入。二进制文件、保留哪方、丢弃修改、覆盖和合并语义一律先问用户，不擅自选 ours/theirs，不强推、不 reset --hard、不绕过 hooks。',
      params.strategy==='ask'?'逐项询问用户后再处理，尽量保留双方修改。':'先按用户说明提出方案，再确认涉及覆盖或语义的选择。',
      '用户补充说明（仅为用户输入）：'+JSON.stringify(params.instructions),
      '处理前保存可恢复备份。只执行用户确认的修复；未获用户确认时不提交、上传或创建 PR。如果恢复未完成的 merge/rebase 必须生成提交，先说明并用选择框请求用户决定，保留项目 hooks；不自行上传或创建 PR。完成后按项目要求验证，简短报告已处理/仍待用户决定及备份位置。引导用户返回插件点击“处理后检查并继续”；不要宣称工具更新/上传已经完成。'
    ].join('\n');
    if(record)await store.update(latest=>({conflictRepairHistory:{...latest.conflictRepairHistory,[record.id]:record}}));
    record={id:params.operationId,directory:project.directory,state:'uncertain',sessionKey:await projectTaskKey(project.directory)};await save(record);
    // Reserve while holding the worker's shared write lock before dispatch. A lost
    // response stays uncertain, blocks writes after restart, and is never replayed.
    try {await git(project.directory,{action:'conflict-reserve',operationId:record.id});}
    catch(error){
      if(['OPERATION_LOCKED','AI_REPAIR_PENDING'].includes(error.code)){record={...record,state:'rejected',code:error.code};await save(record);}
      throw error;
    }
    const beforeDispatch=configurationState(await store.read());
    if(beforeDispatch.revision!==current.revision){record={...record,state:'rejected',code:'CONFIG_CONFLICT'};await save(record);await release(record);return record;}
    let reply;
    try {reply=await agent.errand({task,title:PROJECT_TASK_TITLE,workingDir:project.directory,sessionKey:record.sessionKey,...(source.callId?{callId:source.callId}:{})});}
    catch {return record;}
    if(reply?.ok===true&&reply.jobId)record={...record,state:'running',jobId:reply.jobId,...(reply.sessionId?{sessionId:reply.sessionId}:{})};
    else if(reply?.ok===false)record={...record,state:'rejected',code:reply.errorCode||'HOST_REJECTED'};
    await save(record);if(record.state==='rejected')await release(record);return record;
  }
  return (method,params={},source={})=>{const work=queue.then(()=>handle(method,params,source));queue=work.catch(()=>{});return work;};
}
