import { CHANNEL, WORKFLOWS } from './workflows.js';
const $ = id => document.getElementById(id);
const upgrade = locale => locale === 'zh-CN' ? '当前 Cindy 缺少所需插件接口，请升级 Cindy 后再试。' : 'A required plugin interface is unavailable. Upgrade Cindy and try again.';
const usage = {
 'zh-CN': '可在插件配置按项目指定流程文件；未配置项目需自行提供 _S/experiment.md、_S/feature.md、_S/tooling.md、_E/merge.md；PR 需 xd-pr-review/SKILL.md。缺少哪项只禁用对应按钮，插件不提供流程文件。先在本地项目聊天发送 $jixin-make-a-wish 并点击新绑定卡；更新或重启插件后重新绑定，检查失败可刷新。每次点击新建独立任务，不复制聊天历史；目录和模型由 Host 从来源聊天继承，权限由 Host 管理。两次发起至少间隔10秒。切到本插件新建任务仍保留来源绑定，其它未绑定聊天禁用。日志是 AI 主动回报的步骤和输出摘要，不是完整终端输出；AI 报告完成与 Cindy 轮次结束分开显示。派发待核实时先查任务列表，不重复点击。缺少接口请升级 Cindy；权限拒绝需检查授权。',
 en: 'Configure per-project instruction paths in plugin settings; unconfigured projects need _S/experiment.md, _S/feature.md, _S/tooling.md and _E/merge.md; PR requires xd-pr-review/SKILL.md. Missing items disable their own actions; workflow files are not supplied. Send $jixin-make-a-wish in a local project chat and click its fresh binding card. Rebind after plugin updates or restarts; refresh failed inspections. Each click creates a separate task without copying history. Host inherits the source directory and model and manages permissions. Wait at least 10 seconds between launches. Plugin-created task chats retain the original binding; unrelated chats are disabled. Logs are AI-reported steps and output summaries, not full terminal output. AI completion and Host turn end are separate. Check the task list before clicking again if delivery is uncertain. Upgrade Cindy for missing interfaces; check authorization for permission denial.',
};
const strings = {
  'zh-CN': {
    unbound:'未选择项目', bind:'在插件配置中点击“选择项目目录”并保存，即可直接使用工作流，无需聊天绑定。',
    none:'没有可用流程', partial:'可用流程', checking:'正在检查流程…', readonly:'当前聊天为只读，工作流不可启动', failed:'无法检查目录，请刷新或重新绑定', ready:'点击图标启动',
    goal:'补充目标（可选）', refresh:'重新检查流程', details:'目标与目录', action:'点击后：新建独立任务，', independent:'不复制聊天记录；权限由 Cindy 管理。',
    nofiles:'此目录未检测到可用的流程文件或可确认的 PR 技能，所有工作流已禁用。',
    accepted:'新任务已受理：', rejected:'未启动：', uncertain:'派发结果待核实，请先查看 Cindy 任务列表，勿重复点击。', preparing:'正在核对流程并发起任务…',
    checked:'上次检查：', cooldown:'两次发起至少间隔10秒，请稍候。', busy:'上一条请求正在受理，请稍候。',
    reasons:{ comparison_limit:'PR技能副本超过1MB，未自动比较或启用。',ambiguous:'发现多个候选文件，请按项目约定整理后刷新。',discovery_incomplete:'查找范围达到上限，无法确认唯一流程文件。',not_configured:'旧配置禁用了此流程，可在插件配置保存根目录以启用自动查找。',platform_mismatch:'文件路径属于其它操作系统，请重新配置。', unbound:'尚未绑定项目。请在插件配置选择项目根目录并保存，无需聊天绑定。', readonly:'当前绑定聊天为只读，不启动会修改项目的任务。', checking:'尚在检查流程，检查完成前不可点击。',check_failed:'检查未成功，无法确认流程可用；不会把错误当作“文件不存在”。',missing:'流程文件不存在。',empty:'流程文件为空。',symlink:'流程路径含符号链接，未将其视为可用文件。',not_directory:'流程父路径不是目录。',not_file:'流程路径不是普通文件。',unreadable:'没有读取此流程的权限。',skill_unverified:'未在已检查的项目或用户技能路径确认 xd-pr-review；不代表所有宿主技能都不存在。',cooldown:'两次发起至少间隔10秒，请稍候。',busy:'上一条请求正在受理，请稍候。'},
    actions:{experiment:'读取实验流程，探索并验证方案。',feature:'读取功能流程，按目标实现功能。',tooling:'读取工具流程，开发或改进工具。',pr:'调用 xd-pr-review，提交并跟进 PR 流程。',merge:'读取合并流程，核对分支后清理并更新 main。'},
    errors:{BUSY:'已有工作流运行，请等待完成。',INVALID_REQUEST:'目录授权无效，请在插件配置重新点击“选择项目目录”并保存。',MODEL_UNAVAILABLE:'模型不可用，请检查 Cindy 插件任务设置。',SOURCE_CHANGED:'聊天已切换，请在当前项目重新绑定。',FLOW_UNAVAILABLE:'流程不可用或聊天已切换，请查看悬停说明。',RATE_LIMITED:'触发过快，请等待10秒后再试。',PERMISSION_DENIED:'Cindy 未授予此会话关联或发起权限，请重新绑定并检查插件权限。',JOURNAL_FULL:'待核实记录已满，请先核对任务列表。',STORAGE_UNAVAILABLE:'插件记录不可用，本次结果未确认。'},
  },
  en: {
    unbound:'No project selected',bind:'Choose and save the project root in plugin settings to use workflows directly. No chat binding is required.',
    none:'No available workflows',partial:'Available workflows',checking:'Checking workflows…',readonly:'Read-only chat; workflows unavailable',failed:'Cannot inspect directory. Refresh or rebind.',ready:'Start a workflow',
    goal:'Work goal (optional)',refresh:'Recheck workflows',details:'Goal and directory',action:'On click: create a new task and ',independent:'Chat history is not copied. Cindy manages permissions.',
    nofiles:'No usable workflow files or verified PR skill were found here. All workflow actions are disabled.',
    accepted:'New task accepted: ',rejected:'Not started: ',uncertain:'Delivery is unverified. Check the Cindy task list before clicking again.',preparing:'Checking workflows and starting task…',
    checked:'Last checked: ',cooldown:'Wait at least 10 seconds between launches.',busy:'A previous request is being accepted.',
    reasons:{comparison_limit:'PR skill copies exceed the 1MB comparison limit; workflow is disabled.',ambiguous:'Multiple instruction files found. Arrange project files and refresh.',discovery_incomplete:'Search limit reached; the workflow path is unverified.',not_configured:'Legacy configuration disables this workflow. Save the project root to enable automatic discovery.',platform_mismatch:'This path belongs to another operating system. Reconfigure it.',unbound:'Select and save a project root in plugin settings. No chat binding is required.',readonly:'The bound chat is read-only. Project-changing workflows cannot start.',checking:'The workflow check has not finished.',check_failed:'Inspection failed. This does not mean the file is missing.',missing:'The workflow file does not exist.',empty:'The workflow file is empty.',symlink:'A workflow path contains a symlink and is not accepted.',not_directory:'A parent path is not a directory.',not_file:'The workflow path is not a regular file.',unreadable:'The workflow file is not readable.',skill_unverified:'xd-pr-review was not verified in checked project/user skill paths. Other Host skills may still exist.',cooldown:'Wait at least 10 seconds between launches.',busy:'A previous request is being accepted.'},
    actions:{experiment:'read the experiment flow to explore and validate an idea.',feature:'read the feature flow to implement your goal.',tooling:'read the tooling flow to build or improve tools.',pr:'use xd-pr-review to submit and follow a PR.',merge:'read the merge flow to check branches, clean up and update main.'},
    errors:{BUSY:'A workflow is already running.',INVALID_REQUEST:'Reselect the root with Choose directory in plugin settings.',MODEL_UNAVAILABLE:'Check the model in Cindy plugin task settings.',SOURCE_CHANGED:'The chat changed. Bind this project first.',FLOW_UNAVAILABLE:'Workflow unavailable or chat changed. Check its tooltip.',RATE_LIMITED:'Wait 10 seconds before trying again.',PERMISSION_DENIED:'Cindy did not grant this chat association or launch permission. Rebind and check plugin permissions.',JOURNAL_FULL:'Too many unverified records. Check the task list.',STORAGE_UNAVAILABLE:'Plugin journal unavailable. Delivery is not confirmed.'},
  },
};
const compactCopy={
  'zh-CN':{actions:{experiment:'新建独立任务，读取实验流程并验证方案。',feature:'新建独立任务，读取功能流程并实现目标。',tooling:'新建独立任务，读取工具流程并开发工具。',pr:'新建独立任务，调用 PR 审查技能。',merge:'新建独立任务，核对并清理分支。'},unbound:'在插件配置选择项目根目录并保存。',skill_unverified:'常见技能路径未确认 xd-pr-review；其它宿主技能可能存在。',nofiles:'全部流程不可用。'},
  en:{actions:{experiment:'New independent task: read the experiment flow and validate an idea.',feature:'New independent task: read the feature flow and implement your goal.',tooling:'New independent task: read the tooling flow and build tools.',pr:'New independent task: use the PR review skill.',merge:'New independent task: check and clean up branches.'},unbound:'Choose and save the project root in plugin settings.',skill_unverified:'PR skill not verified in checked paths. Other Host skills may exist.',nofiles:'All workflows are unavailable.'},
};
let locale='en', state={state:'unbound',workflows:{}}, pending=false, tipFlow='', cooldownTimer, projectPollTimer;
let executions=[], selectedTask='', logSignature='';
const logCopy={
  'zh-CN':{title:'执行记录',help:'实际步骤与输出由 AI 回报；运行状态由 Cindy 提供。',empty:'等待工作流开始',hint:'点击底部工作流按钮，在这里查看步骤与输出。',waiting:'任务已受理，等待执行回报',task:'选择工作流任务',step:'执行步骤',output:'操作输出',completed:'AI 报告完成',blocked:'遇到阻塞',host:'Cindy 状态',error:'执行记录未能保存或读取，请查看任务聊天。'},
  en:{title:'Execution log',help:'Steps and output reported by AI. Runtime events supplied by Cindy.',empty:'Ready for your next workflow',hint:'Start a workflow below to see its steps and output here.',waiting:'Task accepted. Waiting for progress reports.',task:'Select workflow task',step:'Step',output:'Output',completed:'AI reported completion',blocked:'Blocked',host:'Cindy event',error:'Could not save or read execution logs. Check the task chat.'},
};
const hostLabels={ 'did-turn-start':['开始执行','Turn started'],'did-turn-end':['本轮结束','Turn ended'],'did-thinking-start':['开始思考','Thinking started'],'did-thinking-end':['思考结束','Thinking ended'],'did-approval-start':['等待确认','Awaiting approval'],'did-approval-end':['确认已结束','Approval resolved'],'did-user-input-start':['等待用户补充','Awaiting input'],'did-user-input-end':['已收到补充','Input resolved'] };
function renderLogs(){
  const copy=logCopy[locale];$('log-title').textContent=copy.title;$('log-help').textContent=copy.help;$('task-label').textContent=copy.task;
  if(!executions.some(item=>item.sessionId===selectedTask))selectedTask=executions[0]?.sessionId||'';
  const select=$('task-select');select.replaceChildren(...executions.map(item=>{const option=document.createElement('option');option.value=item.sessionId;const flow=WORKFLOWS.find(f=>f.id===item.workflowId);option.textContent=(locale==='zh-CN'?flow?.label:flow?.en)+' · '+item.sessionId;return option;}));select.value=selectedTask;select.hidden=!executions.length;
  const entries=executions.find(item=>item.sessionId===selectedTask)?.entries||[];$('log-count').textContent=entries.length?String(entries.length):'';
  const signature=JSON.stringify([locale,selectedTask,entries]);if(signature===logSignature)return;logSignature=signature;
  const list=$('execution-log'),atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<40;
  if(!entries.length){const empty=document.createElement('div');empty.className='log-empty';const title=document.createElement('strong');title.textContent=selectedTask?copy.waiting:copy.empty;const hint=document.createElement('span');hint.textContent=copy.hint;empty.append(title,hint);list.replaceChildren(empty);return;}
  list.replaceChildren(...entries.map(entry=>{const article=document.createElement('article');article.className='log-entry';const meta=document.createElement('small');meta.textContent=(copy[entry.kind]||entry.kind)+' · '+new Date(entry.at).toLocaleTimeString(locale);const title=document.createElement('h2');title.textContent=entry.source==='host-event'?(hostLabels[entry.title]?.[locale==='zh-CN'?0:1]||entry.title):entry.title;article.append(meta,title);if(entry.detail){const output=document.createElement('pre');output.textContent=entry.detail;article.append(output);}return article;}));
  if(atBottom)list.scrollTop=list.scrollHeight;
}
const t=()=>strings[locale]; const requests=new Map(); const channel=new BroadcastChannel(CHANNEL);
const icons={experiment:['M9 3h6M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3','M8 15h8'],feature:['M12 4v16M4 12h16'],tooling:['M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z'],pr:['M6 6v12M18 18v-7a5 5 0 0 0-5-5h-1M15 3l-3 3 3 3','M4 4h4v4H4zM4 16h4v4H4zM16 16h4v4h-4z'],merge:['M6 6v12M18 6v3a4 4 0 0 1-4 4h-4M13 10l-3 3 3 3','M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4z']};
function feedback(text){$('feedback').textContent=text;$('feedback').hidden=!text;}
function request(type,args={}) {
  const reqId=crypto.randomUUID();const message={from:'panel',type,reqId,...args};
  return new Promise((resolve,reject)=>{
    const resend=setInterval(()=>channel.postMessage(message),400);
    const timeout=setTimeout(()=>{clearInterval(resend);requests.delete(reqId);reject(new Error('UNVERIFIED'));},30000);
    requests.set(reqId,{resolve,reject,resend,timeout}); channel.postMessage(message);
  });
}
channel.onmessage=({data})=>{
  if(data?.from!=='main')return;
  if(data.type==='execution-log'){const latest=executions[0]?.sessionId;executions=data.result;if(executions[0]?.sessionId!==latest)selectedTask=executions[0]?.sessionId||'';renderLogs();return;}
  if(data.type==='log-error'){feedback(logCopy[locale].error);return;}
  if(data.type==='sidebar-state'){state=data.result;render();return;}
  if(data.type==='locale-changed'){void readLocale().then(render);return;}
  const item=requests.get(data.reqId);if(!item)return;
  if(data.type==='ack'){clearInterval(item.resend);return;}
  if(data.type==='result'){clearInterval(item.resend);clearTimeout(item.timeout);requests.delete(data.reqId);data.ok?item.resolve(data.result):item.reject(Object.assign(new Error(data.code),{code:data.code}));}
};
async function wake(){const response=await fetch('/wake');if(!response.ok)throw new Error('WAKE_FAILED');}
async function readLocale(){try{const r=await fetch('/app-context');const data=await r.json();locale=data.context?.locale==='zh-CN'?'zh-CN':'en';}catch{locale='en';}document.documentElement.lang=locale;}
function disabledReason(flow){const item=state.workflows?.[flow.id];return (item?.reason === 'unsupported' || state.state === 'unsupported') ? upgrade(locale) : t().reasons[item?.reason || state.state] || t().reasons.check_failed;}
function hideTip(){$('tooltip').hidden=true;tipFlow='';}
function showTip(flow,button){
  tipFlow=flow.id;const item=state.workflows?.[flow.id];
  $('tip-title').textContent=locale==='zh-CN'?flow.label:flow.en;
  const compact=innerWidth<=180,copy=compactCopy[locale];
  $('tip-action').textContent=compact?copy.actions[flow.id]:t().action+t().actions[flow.id]+' '+t().independent;
  $('tip-source').textContent=compact?flow.source:item?.source || flow.source;
  const none=state.state==='ready'&&!Object.values(state.workflows||{}).some(item=>item.enabled);
  const reason=compact&&copy[item?.reason || state.state] || disabledReason(flow);
  $('tip-reason').textContent=item?.enabled&&!pending?'':(none&&!state.busy&&Date.now()>=state.nextLaunchAt?(compact?copy.nofiles:t().nofiles)+' ':'')+(pending?t().busy:reason);
  $('tooltip').hidden=false;
  const tip=$('tooltip'),rect=button.getBoundingClientRect(),box=tip.getBoundingClientRect();
  tip.style.left=Math.max(10,Math.min(innerWidth-box.width-10,rect.right+10))+'px';
  tip.style.top=Math.max(10,Math.min(innerHeight-box.height-10,rect.top))+'px';
}
function buildButtons(){
  $('toolbar').replaceChildren(...WORKFLOWS.map(flow=>{
    const button=document.createElement('button');button.type='button';button.className='tool';button.dataset.workflow=flow.id;button.setAttribute('aria-describedby','tooltip');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(key,value);
    for(const d of icons[flow.id]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}button.append(svg);
    button.addEventListener('pointerenter',()=>showTip(flow,button));button.addEventListener('focus',()=>showTip(flow,button));
    button.addEventListener('pointerleave',()=>{if(document.activeElement!==button)hideTip();});button.addEventListener('blur',hideTip);
    button.addEventListener('click',()=>{if(pending||!state.workflows?.[flow.id]?.enabled){showTip(flow,button);return;}hideTip();void launch(flow.id);});
    return button;
  }));
}
function render(){
  renderLogs();
  clearTimeout(projectPollTimer);
  if(state.mode==='project' && state.busy && !state.verificationNeeded) projectPollTimer=setTimeout(()=>{void request('sidebar').then(value=>{state=value;render();return request('execution-log');}).then(value=>{executions=value;renderLogs();}).catch(()=>feedback(t().failed));},5000);
  $('project-acknowledge').hidden=!state.verificationNeeded;
  $('project-acknowledge').textContent=locale==='zh-CN'?'已检查任务列表，解除阻塞（不重发）':'I checked the task list; unlock without resending';
  const available=Object.values(state.workflows||{}).filter(item=>item.enabled).length;
  $('toolbar').classList.toggle('unavailable',!available||pending);
  for(const button of $('toolbar').querySelectorAll('button')){const flow=WORKFLOWS.find(flow=>flow.id===button.dataset.workflow);button.setAttribute('aria-label',locale==='zh-CN'?flow.label:flow.en);button.setAttribute('aria-disabled',String(pending||!state.workflows?.[flow.id]?.enabled));}
  const basename=(state.directory||'').replace(/[\\/]+$/,'').split(/[\\/]/).pop();
  $('project-name').textContent=basename||t().unbound;$('workflow-directory').textContent=state.directory||t().unbound;
  $('summary').textContent=pending?t().preparing:state.state==='unbound'?t().bind:state.state==='checking'?t().checking:state.state==='readonly'?t().readonly:state.state==='check_failed'?t().failed:state.busy?t().busy:Date.now()<state.nextLaunchAt?t().cooldown:!available?t().none:available<5?t().partial+' '+available+'/5':t().ready;
  $('refresh').setAttribute('aria-label',t().refresh);$('details-toggle').setAttribute('aria-label',t().details);
  if(state.state==='check_failed'&&state.checkError)$('summary').textContent+=' · '+state.checkError;
  if(state.mode==='project' && state.busy)$('summary').textContent=state.verificationNeeded?(locale==='zh-CN'?'结果待核实：请先检查任务列表，再手动解除阻塞。':'Unverified result. Check the task list before unlocking.'):(locale==='zh-CN'?'工作流任务运行中，完成后自动恢复按钮。':'Workflow running. Buttons return when it finishes.');
  if(state.dispatchError)feedback((locale==='zh-CN'?'任务失败：':'Task failed: ')+(t().errors[state.dispatchError]||state.dispatchError));
  if(state.state==='unsupported')$('summary').textContent=upgrade(locale);
  $('usage-title').textContent=locale==='zh-CN'?'使用说明':'Usage';$('usage-text').textContent=state.mode==='project'?(locale==='zh-CN'?'选择项目根目录并保存，自动发现五工作流；无需工具命令或聊天绑定，切换聊天不改变项目。每次点击创建独立任务，模型与权限由 Cindy 插件任务设置决定。目录须经宿主选择器亲选；如有原生任务目录覆盖，请保持与项目一致，否则任务应停止。宿主目前同时只允许一个此类工作流运行，两次启动至少间隔10秒；完成后按钮自动恢复。回执不确定时只查询，不自动重发；核对任务列表后可手动解除阻塞。日志由 AI 通过 report_progress 回报。':'Choose and save a root to discover workflows. No command or chat binding is needed; changing chats does not change projects. Each click starts an independent task using Cindy plugin model and permission settings. The root must be selected with the Host picker. Keep any native task directory override consistent. One workflow can run at a time, with at least 10 seconds between starts. Completion restores the buttons. Uncertain requests are never replayed; check the task list before unlocking. AI reports progress using report_progress.'):usage[locale];
  $('goal-label').textContent=t().goal;$('binding-help').textContent=state.mode==='project'?(locale==='zh-CN'?'项目来自插件配置。无需聊天绑定；模型与权限使用 Cindy 的插件任务设置。':'Project selected in settings. No chat binding. Cindy plugin task settings control model and permissions.'):t().bind;$('check-time').textContent=state.checkedAt?t().checked+new Date(state.checkedAt).toLocaleTimeString(locale):'';
  clearTimeout(cooldownTimer);
  if(state.nextLaunchAt>Date.now())cooldownTimer=setTimeout(()=>{void request('sidebar').then(value=>{state=value;render();});},state.nextLaunchAt-Date.now()+20);
  if(tipFlow){const flow=WORKFLOWS.find(flow=>flow.id===tipFlow);const button=$('toolbar').querySelector('[data-workflow="'+tipFlow+'"]');if(flow&&button)showTip(flow,button);}
}
async function launch(id){
  const sourceSessionId=state.sessionId;pending=true;render();feedback(t().preparing);
  try{await wake();const result=await request('sidebar-launch',{workflowId:id,sourceSessionId,goal:$('goal').value});
    feedback(result.state==='accepted'?t().accepted+(result.sessionId||result.jobId):result.state==='rejected'?t().rejected+(result.code==='UNSUPPORTED_HOST'?upgrade(locale):t().errors[result.code]||result.code):t().uncertain);
  }catch{feedback(t().uncertain);}finally{pending=false;try{state=await request('sidebar');}catch{}render();}
}
$('project-acknowledge').addEventListener('click',async()=>{try{state=await request('project-acknowledge');render();}catch{feedback(t().failed);}});
$('refresh').addEventListener('click',async()=>{hideTip();$('refresh').disabled=true;try{await wake();state=await request('inspect');render();}catch{feedback(t().failed);}finally{$('refresh').disabled=false;}});
$('details-toggle').addEventListener('click',()=>{hideTip();$('details').hidden=!$('details').hidden;$('details-toggle').setAttribute('aria-expanded',String(!$('details').hidden));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){hideTip();$('details').hidden=true;$('details-toggle').setAttribute('aria-expanded','false');}});
window.addEventListener('resize',()=>{if(tipFlow)render();});
$('task-select').addEventListener('change',()=>{selectedTask=$('task-select').value;renderLogs();});
let scrollTimer;document.addEventListener('scroll',()=>{document.documentElement.classList.add('is-scrolling');clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>document.documentElement.classList.remove('is-scrolling'),2000);},{passive:true,capture:true});
buildButtons();await readLocale();render();try{await wake();state=await request('sidebar');executions=await request('execution-log');render();}catch{feedback(t().failed);}
