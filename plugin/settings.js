import { FLOW_IDS, newProject, normalizeConfiguration } from './core/project-config.mjs';
import { createSettingsTransport } from './settings-transport.js';
const transport = createSettingsTransport();
const $ = id => document.getElementById(id);
let english = false, state, draft, dirty = false, busy = false;
const words = {
  zh: { project:'当前项目',add:'添加项目',remove:'移除',binding:'项目绑定',name:'项目名称',directory:'本机项目目录',chooseDirectory:'选择项目目录',save:'保存配置',reload:'重新加载',inspect:'检查已保存项目',results:'检查结果',external:'允许此项使用项目外的绝对路径',chooseFile:'选择指令文件',experiment:'实验',feature:'功能',tooling:'工具',pr:'PR 审查',merge:'合并 / 清理' },
  en: { project:'Active project',add:'Add project',remove:'Remove',binding:'Project binding',name:'Project name',directory:'Local project directory',chooseDirectory:'Choose directory',save:'Save configuration',reload:'Reload',inspect:'Inspect saved project',results:'Inspection results',external:'Allow an absolute path outside this project',chooseFile:'Choose instruction file',experiment:'Experiment',feature:'Feature',tooling:'Tooling',pr:'PR review',merge:'Merge / cleanup' },
};
const tr = key => words[english ? 'en' : 'zh'][key];
const say = (zh, en) => english ? en : zh;
function notice(message) { $('notice').textContent = message; }
function active() { return draft?.projects.find(p => p.id === draft.activeProjectId); }
function markDirty() { dirty = true; $('inspection').textContent = ''; buttons(); }
function buttons() {
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
  $('project-name').value = selected?.name || ''; $('directory').value = selected?.directory || '';
  for (const id of FLOW_IDS) { $('flow-' + id).value = selected?.workflows[id].path || ''; $('external-' + id).checked = selected?.workflows[id].external === true; }
  buttons();
}
async function run(work) {
  if (busy) return;
  busy = true; buttons();
  try { await work(); } catch (error) {
    if (error.code !== 'CANCELLED') notice((error.code ? error.code + ' · ' : '') + error.message);
    else notice(say('已取消选择，配置未改变。','Selection cancelled; configuration unchanged.'));
  } finally { busy = false; buttons(); }
}
async function load() {
  const result = await transport.call('config-read');
  state = result; draft = structuredClone(result.configuration); dirty = false;
  render(); $('inspection').textContent = ''; notice(say('已加载。配置只保存在此设备，不写入目标项目。','Loaded. Settings stay on this device and do not modify the target project.'));
}
async function start() {
  if (transport.standalone) english = !navigator.language.toLowerCase().startsWith('zh');
  else { const response = await fetch('/app-context'); if (!response.ok) throw new Error('Cannot read app context'); const data = await response.json(); english = !(data.context?.locale || 'en').startsWith('zh'); }
  document.documentElement.dataset.runtime = transport.standalone ? 'desktop' : 'cindy';
  document.documentElement.lang = english ? 'en' : 'zh-CN';
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = tr(element.dataset.i18n);
  $('heading').textContent = say('项目与流程配置','Project and workflow settings');
  $('intro').textContent = transport.standalone
    ? say('独立桌面 · 无需 Cindy。此阶段提供配置与只读项目检查；Git 写入及 AI 接入尚未开放。','Standalone desktop · No Cindy required. Configuration and read-only inspection are available; Git writes and AI integrations are not yet enabled.')
    : say('Cindy 插件配置 · 项目选择仅配置文件检查。高级任务仍需在目标项目聊天绑定，以使用 Host 的真实目录与授权。','Cindy settings · Directory selection configures file inspection. Advanced tasks still require binding in the target project chat using Host authorization.');
  $('path-help').textContent = say('填写项目相对路径；空白表示禁用此工作流。外部绝对路径需勾选允许。这里只检查非空普通文件，不执行脚本。PR 也可指定 SKILL.md。','Use project-relative paths; leave blank to disable a workflow. Absolute external paths need explicit permission. Only nonempty regular instruction files are inspected, never executed. PR can point to SKILL.md.');
  for (const id of FLOW_IDS) {
    const row = document.createElement('div'); row.className = 'flow';
    const label = document.createElement('label'); label.textContent = tr(id);
    const input = document.createElement('input'); input.id = 'flow-' + id; input.maxLength = 2000; input.placeholder = say('留空禁用','Blank to disable'); label.append(input);
    const external = document.createElement('label'); external.className = 'external';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = 'external-' + id; external.append(checkbox, document.createTextNode(tr('external')));
    input.addEventListener('input', () => { active().workflows[id].path = input.value; markDirty(); });
    checkbox.addEventListener('change', () => { active().workflows[id].external = checkbox.checked; markDirty(); });
    row.append(label, external);
    if (transport.standalone) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = tr('chooseFile');
      button.addEventListener('click', () => run(async () => {
        if (!active()?.directory) throw new Error(say('请先选择项目目录。','Choose a project directory first.'));
        const result = await transport.call('config-pick-file', { directory: active().directory });
        active().workflows[id] = { path: result.path, external: result.external }; markDirty(); render();
      })); row.append(button);
    }
    $('flows').append(row);
  }
  $('project-name').addEventListener('input', () => { active().name = $('project-name').value; markDirty(); const option = $('project').selectedOptions[0]; if (option) option.textContent = active().name; });
  $('directory').addEventListener('input', () => { active().directory = $('directory').value; markDirty(); });
  $('project').addEventListener('change', () => { draft.activeProjectId = $('project').value; markDirty(); render(); });
  $('add').addEventListener('click', () => { const project = newProject(); project.name = say('新项目','New project'); draft.projects.push(project); draft.activeProjectId = project.id; markDirty(); render(); });
  $('remove').addEventListener('click', () => { draft.projects = draft.projects.filter(p => p.id !== draft.activeProjectId); draft.activeProjectId = draft.projects[0]?.id || ''; markDirty(); render(); });
  $('pick-directory').addEventListener('click', () => run(async () => { const result = await transport.call('config-pick-directory'); active().directory = result.path; markDirty(); render(); }));
  $('configuration-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => {
    const configuration = normalizeConfiguration(draft);
    state = await transport.call('config-save', { expectedRevision: state.revision, configuration });
    draft = structuredClone(state.configuration); dirty = false; render(); notice(say('配置已保存。未创建任务或执行脚本。','Configuration saved. No task or script was executed.'));
  }); });
  $('reload').addEventListener('click', () => run(async () => {
    if (dirty) { notice(say('有未保存修改；再次点击“重新加载”将丢弃这些配置编辑。','Unsaved edits; click Reload again to discard configuration edits.')); if (!$('reload').dataset.confirm) { $('reload').dataset.confirm = 'yes'; return; } }
    delete $('reload').dataset.confirm; await load();
  }));
  $('inspect').addEventListener('click', () => run(async () => {
    const result = await transport.call('config-inspect', { projectId: state.configuration.activeProjectId });
    const lines = [say('目录：','Directory: ') + result.directory];
    if (result.git) lines.push(say('Git：','Git: ') + (result.git.available ? result.git.branch || '(detached HEAD)' : result.git.reason), ...(result.git.changes || []));
    for (const id of FLOW_IDS) { const item = result.workflows[id]; lines.push(tr(id) + ': ' + (item.ok ? '✓ ' + item.source : '— ' + item.reason)); }
    lines.push(say('规则来源（仅发现，尚未执行提交门禁）：','Rule sources (discovery only, commit gate not executed): '), ...(result.rules || []).map(p => p.path));
    $('inspection').textContent = lines.join('\n'); notice(say('只读检查完成，没有运行项目脚本。','Read-only inspection completed; no project scripts were executed.'));
  }));
  await load();
}
void start().catch(error => { busy = true; notice(error.message); buttons(); });
addEventListener('pagehide', () => transport.close());
addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
