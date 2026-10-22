import { errorHelp } from './error-help.js';
import { mountGit } from './git-ui.js';
import { FLOW_IDS, newProject, normalizeConfiguration, directoryKey } from './core/project-config.mjs';
import { createSettingsTransport } from './settings-transport.js';
const transport = createSettingsTransport();
const $ = id => document.getElementById(id);
let english = false, state, draft, dirty = false, busy = false, identityCandidate=null;
let configurationStale=false,synchronizing=false;
// Daily users choose one folder. Retain the manual manager for maintainers.
const manager=document.createElement('details'),managerTitle=document.createElement('summary');manager.id='project-manager';
const form=$('configuration-form');form.before(manager);manager.append(managerTitle,form,$('inspection').closest('section'));
const quick=document.createElement('section');quick.className='quick-project';
const choose=document.createElement('button');choose.id='quick-project';choose.type='button';choose.disabled=true;
const selectedRoot=document.createElement('p');selectedRoot.id='setup-root';
const setupStatus=document.createElement('p');setupStatus.id='setup-status';setupStatus.setAttribute('role','status');
const setupDetails=document.createElement('details'),setupTitle=document.createElement('summary'),setupOutput=document.createElement('pre');setupDetails.id='setup-details';setupDetails.hidden=true;setupDetails.append(setupTitle,setupOutput);
const identityBox=document.createElement('section'),identityInfo=document.createElement('p'),identityFill=document.createElement('button');
identityBox.id='identity-box';identityBox.hidden=true;identityInfo.id='identity-info';identityFill.id='identity-fill';identityFill.type='button';identityBox.append(identityInfo,identityFill);
quick.append(choose,selectedRoot,setupStatus,identityBox,setupDetails);manager.before(quick);

const words = {
  zh: { project:'当前项目',add:'添加项目',remove:'移除',binding:'项目绑定',name:'项目名称',directory:'项目根目录',chooseDirectory:'选择项目目录',save:'保存配置',reload:'重新加载',inspect:'检查已保存项目',results:'检查结果',external:'允许此项使用项目外的绝对路径',chooseFile:'选择指令文件',experiment:'实验',feature:'功能',tooling:'工具',pr:'PR 审查',merge:'合并 / 清理' },
  en: { project:'Active project',add:'Add project',remove:'Remove',binding:'Project binding',name:'Project name',directory:'Project root directory',chooseDirectory:'Choose directory',save:'Save configuration',reload:'Reload',inspect:'Inspect saved project',results:'Inspection results',external:'Allow an absolute path outside this project',chooseFile:'Choose instruction file',experiment:'Experiment',feature:'Feature',tooling:'Tooling',pr:'PR review',merge:'Merge / cleanup' },
};
const tr = key => words[english ? 'en' : 'zh'][key];
const say = (zh, en) => english ? en : zh;
function notice(message) { $('notice').textContent = message; }
function active() { return draft?.projects.find(p => p.id === draft.activeProjectId); }
function clearIdentity(){identityCandidate=null;identityBox.hidden=true;}
function markDirty() { clearIdentity();setupStatus.textContent='';setupDetails.hidden=true;dirty = true; $('inspection').textContent = ''; buttons(); }
function buttons() {
  identityFill.disabled=busy||dirty;
  choose.disabled=busy||!draft;selectedRoot.textContent=active()?.directory||say('还没有选择项目目录。','No project folder selected.');
  $('fields').disabled = busy || !active();
  for (const id of ['add','remove','save','reload','project']) $(id).disabled = busy || (id === 'remove' && !active()) || (id === 'add' && (draft?.projects.length || 0) >= 8);
  $('inspect').disabled = busy || dirty || !active();
}
function render() {
  const selected = active();
  $('project').replaceChildren();
  if (!draft.projects.length) $('project').append(new Option(say('尚未配置项目','No projects configured'), ''));
  for (const project of draft.projects) $('project').append(new Option(project.name, project.id));
  $('project').value = draft.activeProjectId;
  $('directory').value = selected?.directory || '';

  buttons();
}
async function run(work) {
  if (busy) return;
  busy = true; buttons();
  try { await work(); } catch (error) {
    if (error.code !== 'CANCELLED') {const help=errorHelp(error,english);notice(help.message);setupStatus.textContent=help.message;setupOutput.textContent=help.detail;setupDetails.hidden=false;}
    else notice(say('已取消选择，配置未改变。','Selection cancelled; configuration unchanged.'));
  } finally { busy = false; buttons();if(configurationStale)await synchronizeConfiguration();document.dispatchEvent(new Event('configuration-ready')); }
}
function invalidateConfiguration(){
  configurationStale=true;clearIdentity();
  document.dispatchEvent(new Event('configuration-invalidated'));buttons();
}
async function synchronizeConfiguration(){
  if(busy||synchronizing)return;
  synchronizing=true;
  try{
    // A read only: never repeat an operation rejected by a stale revision.
    const latest=await transport.call('config-read');
    if(latest.revision===state?.revision){configurationStale=false;return;}
    if(dirty){notice(say('另一处更新了项目配置；当前编辑已保留，请重新加载后核对。','Project settings changed elsewhere. Your edits are preserved; reload to review.'));return;}
    state=latest;draft=structuredClone(latest.configuration);configurationStale=false;
    clearIdentity();setupStatus.textContent='';setupDetails.hidden=true;render();
    notice(say('已同步最新项目配置；请核对当前项目后重新选择操作，未自动重试。','Latest project settings loaded. Review the project and choose an action; nothing was retried.'));
  }catch(error){notice(errorHelp(error,english).message);}
  finally{synchronizing=false;buttons();document.dispatchEvent(new Event('configuration-ready'));}
}
async function load() {
  clearIdentity();
  const result = await transport.call('config-read');
  state = result; draft = structuredClone(result.configuration); dirty = false;configurationStale=false;
  setupStatus.textContent='';setupDetails.hidden=true;render(); $('inspection').textContent = ''; notice(say('选择一次项目目录，工具会自动保存并按项目规则完成本地准备。','Choose a project folder once. Settings are saved and local preparation follows project rules.'));
}
function showPreparation(result){
  setupStatus.textContent=result.message||say('准备结果待确认，请重新检测。','Preparation unverified. Check again.');
  setupOutput.textContent=[...(result.completed||[]),...(result.blockers||[]).map(b=>b.message)].join('\n');setupDetails.hidden=!setupOutput.textContent;
  identityCandidate=result.identity?.state==='available'?result.identity:null;
  identityBox.hidden=!result.identity;
  identityFill.hidden=result.identity?.state==='ready';
  identityInfo.textContent=identityCandidate
    ?say(`姓名：${identityCandidate.name} · 邮箱：${identityCandidate.email}；来源：${identityCandidate.source}`,`Name: ${identityCandidate.name} · Email: ${identityCandidate.email}. Source: signed-in GitHub.com account; missing fields only, this project only.`)
    :result.identity?.message||'';
  identityFill.textContent=identityCandidate?say('一键补齐提交署名','Fill missing Git identity'):say('重新检测账号','Check account again');
  if(result.identity?.state==='ready')identityInfo.textContent=say('已保存到当前项目：','Saved for this project: ')+result.identity.name+' <'+result.identity.email+'>';
}
async function saveAndPrepare() {
  const configuration=normalizeConfiguration({...draft,projects:draft.projects.map(project=>({id:project.id,directory:project.directory,discovery:'auto'}))});
  state=await transport.call('config-save',{expectedRevision:state.revision,configuration});
  draft=structuredClone(state.configuration);dirty=false;render();
  if(!active()){notice(say('项目配置已保存。','Project settings saved.'));setupStatus.textContent='';setupDetails.hidden=true;return false;}
  notice(say('项目已保存，正在自动准备…','Project saved. Preparing local settings…'));
  setupStatus.textContent=say('正在按项目规则准备，请稍候…','Preparing using project rules…');
  setupDetails.hidden=true;clearIdentity();
  try {
    const result=await transport.call('git-request',{projectId:state.configuration.activeProjectId,revision:state.revision,action:'prepare',confirmProjectSetup:true});
    showPreparation(result);
    notice(result.state==='ready'?say('项目已保存，已完成本地准备。','Project saved. Local preparation completed.'):say('项目已保存；还有一项准备需要处理，请看上方说明。','Project saved. Preparation needs attention; see above.'));
    return result.state==='ready';
  } catch(error) {
    setupStatus.textContent=say('项目已保存，但自动准备未完成。','Project saved, but automatic preparation did not complete.');
    throw error;
  }
}
async function start() {
  busy=true; buttons();
  if (transport.standalone) english = !navigator.language.toLowerCase().startsWith('zh');
  else { const response = await fetch('/app-context'); if (!response.ok) throw new Error('Cannot read app context'); const data = await response.json(); english = !(data.context?.locale || 'en').startsWith('zh'); }
  document.documentElement.dataset.runtime = transport.standalone ? 'desktop' : 'cindy';
  document.documentElement.lang = english ? 'en' : 'zh-CN';
  choose.textContent=say('选择项目目录，自动准备','Choose project folder and prepare');
  managerTitle.textContent=say('项目管理与详细检查（负责人）','Project management and checks (maintainer)');
  setupTitle.textContent=say('查看自动准备结果','Preparation details');
  identityFill.onclick=()=>run(async()=>{
    const candidate=identityCandidate;
    notice(say('正在检测并保存项目署名…','Checking project identity…'));
    const result=await transport.call('git-request',{projectId:state.configuration.activeProjectId,revision:state.revision,action:candidate?'identity-fill':'prepare',confirmProjectSetup:true,...(candidate?{confirmIdentity:true,identity:{name:candidate.name,email:candidate.email,login:candidate.login}}:{})});
    showPreparation(result);notice(result.message);
  });
  choose.onclick=()=>run(async()=>{
    notice(say('请选择项目目录；选择窗口会等待你确认或取消。','Choose a project folder; the dialog waits for confirmation or cancellation.'));
    const picked=await transport.call('config-pick-directory');
    let project=draft.projects.find(p=>p.directory&&directoryKey(p.directory)===directoryKey(picked.path));
    if(!project){if(draft.projects.length>=8)throw new Error(say('已有8个项目，请负责人先移除不再使用的项目。','Eight projects already exist. Ask the maintainer to remove an unused project.'));project={...newProject(),directory:picked.path,discovery:'auto'};draft.projects.push(project);}
    draft.activeProjectId=project.id;markDirty();render();
    if(await saveAndPrepare())$('git-tab').click();
  });
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = tr(element.dataset.i18n);
  $('heading').textContent = say('极心许愿','Jixin');
  $('intro').textContent = transport.standalone
    ? say('已有项目，直接开始。更新团队内容，或把你的修改交给团队。','Use an existing project. Get team updates or share your changes.')
    : say('选择已有项目。日常只需更新、查看改动、提交修改。','Choose an existing project. Update, view changes and submit your work.');
  $('path-help').textContent = say('只需选择项目根目录。工具自动寻找工作流指令；缺失或存在多个候选时禁用对应入口，不执行发现的文件。已有手动路径会保留到本页保存，保存后改用自动发现。','Choose only the project root. Workflow instructions are discovered automatically; missing or ambiguous matches disable that workflow. Discovery never executes files. Saving switches legacy manual paths to automatic discovery.');
  $('directory').addEventListener('input', () => { active().directory = $('directory').value; markDirty(); });
  $('project').addEventListener('change', () => { draft.activeProjectId = $('project').value; markDirty(); render(); });
  $('add').addEventListener('click', () => { const project = newProject(); project.name = say('新项目','New project'); draft.projects.push(project); draft.activeProjectId = project.id; markDirty(); render(); });
  $('remove').addEventListener('click', () => { draft.projects = draft.projects.filter(p => p.id !== draft.activeProjectId); draft.activeProjectId = draft.projects[0]?.id || ''; markDirty(); render(); });
  $('pick-directory').addEventListener('click', () => run(async () => { const result = await transport.call('config-pick-directory'); active().directory = result.path; markDirty(); render(); }));
  $('configuration-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => {
    await saveAndPrepare();
  }); });
  $('reload').addEventListener('click', () => run(async () => {
    if (dirty) { notice(say('有未保存修改；再次点击“重新加载”将丢弃这些配置编辑。','Unsaved edits; click Reload again to discard configuration edits.')); if (!$('reload').dataset.confirm) { $('reload').dataset.confirm = 'yes'; return; } }
    delete $('reload').dataset.confirm; await load();
  }));
  $('inspect').addEventListener('click', () => run(async () => {
    const result = await transport.call('config-inspect', { projectId: state.configuration.activeProjectId });
    const lines = [say('目录：','Directory: ') + result.directory];
    if (result.git) lines.push(say('Git：','Git: ') + (result.git.available ? result.git.branch || '(detached HEAD)' : result.git.reason), ...(result.git.changes || []));
    const reasons = {comparison_limit:say('PR技能副本超过1MB，未自动比较或启用','PR skill copies exceed the 1MB comparison limit; workflow disabled'),missing:say('未找到指令文件','Instruction not found'),ambiguous:say('找到多个候选，请按项目约定整理文件','Multiple matches; arrange files using project conventions'),discovery_incomplete:say('查找范围达到上限，无法确认唯一文件','Search limit reached; uniqueness cannot be verified'),empty:say('文件为空','Empty file'),symlink:say('不使用符号链接文件','Symbolic instruction path is not supported')};
    for (const id of FLOW_IDS) { const item = result.workflows[id]; lines.push(tr(id) + ': ' + (item.ok ? '✓ ' + item.source : '— ' + (reasons[item.reason] || item.reason)), ...(item.candidates || []).map(path=>'  '+path)); }
    lines.push(say('规则来源（仅发现，尚未执行提交门禁）：','Rule sources (discovery only, commit gate not executed): '), ...(result.rules || []).map(p => p.path));
    $('inspection').textContent = lines.join('\n'); notice(say('只读检查完成，没有运行项目脚本。','Read-only inspection completed; no project scripts were executed.'));
  }));
  await load(); busy=false; buttons();
  mountGit({transport, english, context:()=>({projectId:state?.configuration.activeProjectId,revision:state?.revision,ready:!dirty && !busy && !configurationStale && !!active()}), notice,
    onConflict:async()=>{invalidateConfiguration();await synchronizeConfiguration();}});
  transport.onConfigurationChanged?.(()=>{invalidateConfiguration();void synchronizeConfiguration();});
}
void start().catch(error => { busy = true; notice(errorHelp(error,english).message); buttons(); });
addEventListener('pagehide', () => transport.close());
addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
