import { CHANNEL, WORKFLOWS, workflowById } from './workflows.js';

const strings = {
  'zh-CN': {
    eyebrow: 'AGENT 工作流', heading: '开始一项工作', intro: '每次点击，创建一个全新的独立任务。',
    contextTitle: '补充工作目标（可选）', contextHint: '将添加到下一次新建任务中',
    setup: '首次使用，请在插件详情的「任务设置」中选择项目目录与模型。',
    history: '最近发起', refresh: '刷新状态', empty: '还没有发起任务。',
    preparing: '准备新建任务…', accepted: '指令已受理；请在 Cindy 任务列表中查看进展。',
    waiting: '正在连接插件…', waking: '插件未就绪，请确认已启用后刷新面板。',
    uncertain: '派发结果待核实。请先检查任务列表；需要继续核对时会沿用原请求，不新建第二条任务。',
    rejected: '未受理。请检查插件任务权限、项目目录和模型配置后重新发起。',
    recover: '核对原请求', recovering: '正在核对原请求…', pending: '连接中断，结果待核实。请刷新状态并核对原请求，避免重复点击工作流。',
    storage: '记录不可用，本次未确认派发成功。请检查存储后刷新面板并核对任务列表。',
    unsupported: '当前 Cindy 不支持插件任务接口，请升级至支持版本。',
    limit: '未核实的请求较多，请先核对后再发起新任务。',
    task: '任务', dir: '目录', state: '状态', unknown: '待核实', refreshFailed: '状态读取失败；请在任务列表核对。',
    phases: { preparing: '准备中', creating: '创建结果待核实', created: '任务已创建，尚未确认派发', sending: '派发结果待核实', accepted: '已受理', rejected: '未受理', uncertain: '待核实' },
    statuses: { queued: '排队中', running: '运行中', completed: '已完成', done: '已完成', failed: '失败', cancelled: '已取消', canceled: '已取消', reconciling: '正在核实', unknown: '待核实' },
  },
  en: {
    eyebrow: 'AGENT WORKFLOWS', heading: 'Start a piece of work', intro: 'Every click creates a new, independent task.',
    contextTitle: 'Add a work goal (optional)', contextHint: 'Included in the next task you create',
    setup: 'First, choose your project directory and model under Task Settings in the plugin details.',
    history: 'Recent launches', refresh: 'Refresh status', empty: 'No tasks launched yet.',
    preparing: 'Creating a new task…', accepted: 'Request accepted. Follow progress in the Cindy task list.',
    waiting: 'Connecting to the plugin…', waking: 'Plugin is not ready. Enable it and refresh this panel.',
    uncertain: 'Delivery is unverified. Check the task list first. Recovery uses the original request and does not create a second task.',
    rejected: 'Not accepted. Check task permissions, project directory and model settings before starting again.',
    recover: 'Check original request', recovering: 'Checking the original request…', pending: 'Connection interrupted; delivery is unverified. Refresh and check the original request before launching another task.',
    storage: 'The launch journal is unavailable; delivery is unverified. Check storage, refresh and inspect the task list.',
    unsupported: 'This Cindy version does not support plugin tasks. Please upgrade.',
    limit: 'Too many unverified requests. Check them before creating more tasks.',
    task: 'Task', dir: 'Directory', state: 'Status', unknown: 'Unverified', refreshFailed: 'Could not read status. Check the task list.',
    phases: { preparing: 'Preparing', creating: 'Creation unverified', created: 'Created; dispatch unverified', sending: 'Dispatch unverified', accepted: 'Accepted', rejected: 'Not accepted', uncertain: 'Unverified' },
    statuses: { queued: 'Queued', running: 'Running', completed: 'Completed', done: 'Completed', failed: 'Failed', cancelled: 'Cancelled', canceled: 'Cancelled', reconciling: 'Reconciling', unknown: 'Unverified' },
  },
};
let locale = 'en';
let launches = [];
let pendingLaunch = false;
const channel = new BroadcastChannel(CHANNEL);
const requests = new Map();
const $ = id => document.getElementById(id);
const t = () => strings[locale];
const label = flow => locale === 'zh-CN' ? flow.label : flow.en;
const feedback = text => { $('feedback').textContent = text; };

function errorMessage(code) {
  if (code === 'UNSUPPORTED_HOST') return t().unsupported;
  if (code === 'PENDING_LIMIT') return t().limit;
  if (code === 'STORAGE_UNAVAILABLE') return t().storage;
  return `${t().pending}${code ? ` (${code})` : ''}`;
}
function request(type, args = {}) {
  const reqId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const payload = { from: 'panel', type, reqId, ...args };
    const item = { resolve, reject, timer: undefined, retry: undefined, acked: false };
    requests.set(reqId, item);
    // Only retransmit until ACK. Repeated launch packets have the same reqId.
    item.retry = setInterval(() => { if (!item.acked) channel.postMessage(payload); }, 400);
    item.timer = setTimeout(() => {
      clearInterval(item.retry); requests.delete(reqId);
      reject(Object.assign(new Error('Unverified response'), { code: 'RESPONSE_UNVERIFIED' }));
    }, 90000);
    channel.postMessage(payload);
  });
}
channel.onmessage = ({ data }) => {
  if (data?.from !== 'main') return;
  if (data.type === 'locale-changed') { void readLocale(); return; }
  const item = requests.get(data.reqId);
  if (!item) return;
  if (data.type === 'ack') { item.acked = true; clearInterval(item.retry); return; }
  if (data.type !== 'result') return;
  clearInterval(item.retry); clearTimeout(item.timer); requests.delete(data.reqId);
  if (data.ok) item.resolve(data.result);
  else item.reject(Object.assign(new Error('Plugin request failed'), { code: data.code }));
};
async function wake() {
  const response = await fetch('/wake');
  if (!response.ok) throw Object.assign(new Error('Wake failed'), { code: 'WAKE_FAILED' });
  const result = await response.json();
  if (result.ok === false || ['off', 'fused', 'asleep', 'disabled', 'sleeping'].includes(result.state)) {
    throw Object.assign(new Error('Plugin unavailable'), { code: 'WAKE_FAILED' });
  }
}
function updateDisabled() {
  for (const button of $('workflows').querySelectorAll('button')) button.disabled = pendingLaunch;
}
function renderFlows() {
  $('workflows').replaceChildren(...WORKFLOWS.map((flow, index) => {
    const button = document.createElement('button');
    button.className = 'workflow'; button.type = 'button'; button.dataset.workflow = flow.id;
    button.disabled = pendingLaunch;
    const number = document.createElement('span'); number.className = 'number'; number.textContent = String(index + 1).padStart(2, '0'); number.setAttribute('aria-hidden', 'true');
    const content = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = label(flow);
    const source = document.createElement('span'); source.className = 'source'; source.textContent = flow.source;
    content.append(title, source);
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
    button.append(number, content, arrow);
    button.addEventListener('click', () => { void launch(flow.id); });
    return button;
  }));
}
function renderLaunches() {
  $('empty').hidden = launches.length > 0;
  $('launches').replaceChildren(...launches.map(record => {
    const item = document.createElement('li');
    const heading = document.createElement('p'); heading.className = 'launch-title';
    const flow = workflowById(record.workflowId); heading.textContent = flow ? label(flow) : record.title;
    const meta = document.createElement('p'); meta.className = 'launch-meta';
    const phase = t().phases[record.phase] || t().unknown;
    const status = record.runStatus ? (t().statuses[record.runStatus] || t().unknown) : '';
    meta.textContent = `${phase}${status ? ` · ${status}` : ''} · ${new Date(record.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
    item.append(heading, meta);
    if (record.taskId) {
      const task = document.createElement('p'); task.className = 'launch-meta launch-id'; task.textContent = `${t().task}: ${record.taskId}`; item.append(task);
    }
    if (record.workingDir) {
      const dir = document.createElement('p'); dir.className = 'launch-meta'; dir.textContent = `${t().dir}: ${record.workingDir}`; item.append(dir);
    }
    if (record.errorCode || record.refreshError) {
      const error = document.createElement('p'); error.className = 'launch-meta';
      error.textContent = record.refreshError ? `${t().refreshFailed} (${record.refreshError})` : `${record.phase === 'rejected' ? t().rejected : t().uncertain} (${record.errorCode})`; item.append(error);
    }
    if (!['accepted', 'rejected'].includes(record.phase)) {
      const button = document.createElement('button'); button.className = 'small recover'; button.textContent = t().recover;
      button.addEventListener('click', async () => {
        button.disabled = true; feedback(t().recovering);
        try { await wake(); const result = await request('recover', { launchId: record.id }); feedback(t()[result.phase] || t().uncertain); await load(); }
        catch (error) { feedback(errorMessage(error.code)); }
        finally { button.disabled = false; }
      });
      item.append(button);
    }
    item.dataset.id = record.id;
    return item;
  }));
}
async function readLocale() {
  try { const response = await fetch('/app-context'); if (response.ok) { const data = await response.json(); locale = data.context?.locale === 'zh-CN' ? 'zh-CN' : 'en'; } }
  catch { /* Unsupported host locale uses English, never navigator.language. */ }
  document.documentElement.lang = locale;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t()[node.dataset.i18n];
  $('workflows').setAttribute('aria-label', t().eyebrow);
  renderFlows(); renderLaunches();
}
async function load() { await wake(); launches = await request('list'); renderLaunches(); }
async function launch(workflowId) {
  if (pendingLaunch) return;
  pendingLaunch = true; updateDisabled(); feedback(t().preparing);
  try {
    await wake();
    const record = await request('launch', { workflowId, context: $('context').value });
    feedback(record.phase === 'accepted' ? t().accepted : record.phase === 'rejected'
      ? (record.errorCode === 'UNSUPPORTED_HOST' ? t().unsupported : `${t().rejected} (${record.errorCode})`) : t().uncertain);
    await load();
  } catch (error) { feedback(error.code === 'WAKE_FAILED' ? t().waking : errorMessage(error.code)); }
  finally { pendingLaunch = false; updateDisabled(); }
}
$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  try { await wake(); launches = await request('refresh'); renderLaunches(); feedback(''); }
  catch (error) { feedback(errorMessage(error.code)); }
  finally { $('refresh').disabled = false; }
});
let scrollTimer;
document.addEventListener('scroll', () => {
  document.documentElement.classList.add('is-scrolling');
  clearTimeout(scrollTimer); scrollTimer = setTimeout(() => document.documentElement.classList.remove('is-scrolling'), 2000);
}, { passive: true, capture: true });
await readLocale();
feedback(t().waiting);
try { await load(); feedback(''); } catch (error) { feedback(error.code === 'WAKE_FAILED' ? t().waking : errorMessage(error.code)); }
