import { configurationState, projectForDirectory } from './core/project-config.mjs';
import { createConfigurationController } from './configuration-controller.js';
import { createExecutionLog } from './execution-log.js';
import { createSidebar } from './sidebar-state.js';
import { createProjectSidebar } from './project-sidebar.js';
import { createController } from './controller.js';
import { CHANNEL, WORKFLOWS } from './workflows.js';
import { inspectWithHost } from './host-compat.js';

const channel = new BroadcastChannel(CHANNEL);
let storageQueue = Promise.resolve();
const store = {
  async read() {
    const response = await fetch('/kv');
    if (!response.ok) throw new Error('Cannot read launch journal');
    return response.json();
  },
  write(patch) { return store.update(() => patch); },
  update(patchFor) {
    const work = storageQueue.then(async () => {
      const current = await store.read();
      const data = { ...current, ...patchFor(current) };
      const body = JSON.stringify(data);
      if (new TextEncoder().encode(body).length > 64 * 1024) throw new Error('Journal full');
      const response = await fetch('/kv', { method: 'PUT', body });
      if (!response.ok) throw new Error('Cannot save launch journal');
    });
    storageQueue = work.catch(() => {}); return work;
  },
};
const controller = createController({ tasks: cindy.tasks, store });
const sidebar = createSidebar({ agent: cindy.agent, store, inspect: async dir => {
    const project = projectForDirectory(configurationState(await store.read()).configuration, dir);
    return inspectWithHost(cindy.node, dir, project);
  },
  changed: view => { if (!projectSidebar.view().directory) channel.postMessage({ from: 'main', type: 'sidebar-state', result: view }); } });
const projectSidebar = createProjectSidebar({ agent: cindy.agent, store,
  inspect: (dir, project) => inspectWithHost(cindy.node, dir, project),
  changed: view => { if (view.directory) channel.postMessage({ from: 'main', type: 'sidebar-state', result: view }); },
});
const activeSidebar = () => projectSidebar.view().directory ? projectSidebar : sidebar;
async function refreshSidebar() {
  await projectSidebar.refresh();
  return activeSidebar() === projectSidebar ? projectSidebar.view() : sidebar.refresh();
}
const executionLog = createExecutionLog({ store, changed: result => channel.postMessage({ from: 'main', type: 'execution-log', result }) });
const configure = createConfigurationController({ store,
  git: async (dir, params) => {
    const reply = await cindy.node.request({method:'project/git',params:{...params,dir},timeoutMs:120000});
    if(!reply.ok || reply.error) throw Object.assign(new Error(reply.error?.message || reply.message || 'Git 操作未完成，请刷新核对'),{code:reply.error?.data?.code || reply.errorCode || 'GIT_OPERATION_FAILED'});
    return reply.result;
  },
  pick: () => { if (typeof cindy.pick !== 'function') throw Object.assign(new Error('请升级 Cindy 以选择目录'), { code: 'UNSUPPORTED_HOST' }); return cindy.pick({ mode: 'directory', title: '配置项目与流程文件' }); },
  inspect: (dir, project) => inspectWithHost(cindy.node, dir, project),
  changed: () => { channel.postMessage({ from: 'main', type: 'configuration-changed' }); void refreshSidebar().then(result => channel.postMessage({ from: 'main', type: 'sidebar-state', result })).catch(error => console.error('Configuration refresh failed:', error.code || error.name)); },
});
const pendingBindings = new Map();
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function bindingCard(nonce, directory, english) {
  return '<div style="padding:14px;font:13px system-ui;color:var(--text-primary,#262626)"><p>' +
    (english ? 'Bind the small sidebar toolbar to this chat project:' : '将侧边小工具栏绑定到这个聊天项目：') + '</p><p>' + escape(directory) +
    '</p><button data-ghost-action="bind:' + nonce + '">' + (english ? 'Bind toolbar' : '绑定工具栏') + '</button><p>' +
    (english ? 'Binding only checks workflow files. Then use the sidebar buttons; each click creates a new task. Rebind after restarting Cindy.' : '绑定只检查流程文件，不启动任务。之后在侧边面板点击按钮，各自新建任务；Cindy 重启后需重新绑定。') + '</p></div>';
}
async function englishLocale() {
  try { const r = await fetch('/app-context'); const data = await r.json(); return !(data.context?.locale || 'en').startsWith('zh'); }
  catch { return true; }
}
const inFlight = new Map();
channel.onmessage = ({ data }) => {
  if (data?.from === 'settings' && typeof data.reqId === 'string') {
    void configure(data.type, data.params).then(result => channel.postMessage({ from: 'main', type: 'settings-result', reqId: data.reqId, ok: true, result }),
      error => channel.postMessage({ from: 'main', type: 'settings-result', reqId: data.reqId, ok: false, code: error.code || 'CONFIGURATION_FAILED', message: error.message }));
    return;
  }
  if (data?.from !== 'panel' || typeof data.reqId !== 'string') return;
  channel.postMessage({ from: 'main', type: 'ack', reqId: data.reqId });
  // Bound transient replies. Durable launch deduplication lives in controller.
  if (inFlight.has(data.reqId)) {
    void inFlight.get(data.reqId).then(reply => channel.postMessage(reply));
    return;
  }
  const work = async () => {
    switch (data.type) {
      case 'list': return controller.list();
      case 'refresh': return controller.refresh();
      case 'sidebar': return refreshSidebar();
      case 'execution-log': return executionLog.list();
      case 'inspect': return refreshSidebar();
      case 'project-acknowledge': return projectSidebar.acknowledge();
      case 'sidebar-launch': {
        const result = await activeSidebar().launch(data.reqId, data.workflowId, data.sourceSessionId, data.goal || '');
        channel.postMessage({ from: 'main', type: 'execution-log', result: await executionLog.list() });
        return result;
      }
      case 'launch': throw Object.assign(new Error('Use sidebar'), { code: 'SIDEBAR_REQUIRED' });
      case 'recover': return controller.recover(data.launchId);
      default: throw new Error('Unknown action');
    }
  };
  const promise = work().then(result => ({ from: 'main', type: 'result', reqId: data.reqId, ok: true, result }),
    error => ({ from: 'main', type: 'result', reqId: data.reqId, ok: false, code: error.code || 'STORAGE_UNAVAILABLE' }));
  inFlight.set(data.reqId, promise);
  if (inFlight.size > 100) inFlight.delete(inFlight.keys().next().value);
  void promise.then(reply => channel.postMessage(reply));
};
export function handleHostMessage(message) {
  if (message.type === 'event') void executionLog.event(message).catch(error => {
    if (error.code !== 'UNOWNED_SESSION') channel.postMessage({ from: 'main', type: 'log-error' });
  });
  if (message.type === 'tool-call' && message.tool === 'report_progress') {
    void (async () => {
      try {
        if (activeSidebar() === projectSidebar) await projectSidebar.refresh();
        const result = await executionLog.report(message.args?.session_context, message.args || {}, message.callId);
        await cindy.send({ type: 'tool-result', callId: message.callId, ok: true, result });
      } catch (error) {
        await cindy.send({ type: 'tool-result', callId: message.callId, ok: false, errorCode: error.code || 'STORAGE_UNAVAILABLE', message: '执行回报未保存：请确认这是本插件发起的任务，并检查记录容量。' });
      }
    })(); return;
  }
  if (message.type === 'host-context-changed') channel.postMessage({ from: 'main', type: 'locale-changed' });
  if (message.type === 'event' && message.name === 'did-session-switched') {
    if (activeSidebar() === sidebar) sidebar.switchSession(message.data?.sessionId, message.data?.workdir, Number(message.dropped) > 0); return;
  }
  if (message.type === 'event' && Number(message.dropped) > 0) sidebar.switchSession('', '', true);
  if (message.type === 'event' && message.name === 'did-session-archived') sidebar.forgetSession(message.data?.sessionId);
  if (message.type === 'card-action' || (message.type === 'event' && message.name === 'card-action')) {
    void (async () => {
      const english = await englishLocale();
      const nonce = typeof message.actionId === 'string' && message.actionId.startsWith('bind:') ? message.actionId.slice(5) : '';
      const pending = pendingBindings.get(nonce);
      let text;
      if (!pending || !message.userActionToken || message.sessionId !== pending.context.session_id || Date.now() > pending.expires) {
        text = english ? 'Please request a fresh toolbar binding in this project chat.' : '请在目标项目聊天重新发送 $jixin-make-a-wish，使用新的绑定卡片。';
      } else if (pending.used) {
        text = english ? 'This binding card has already been used. If workflow inspection failed, click Refresh in the toolbar. Request a new card only after changing projects or restarting Cindy.' : '这张绑定卡已使用。流程检查失败时请点工具栏的刷新按钮；切换项目或重启 Cindy 后才需要新的绑定卡。';
      } else {
        pending.used = true;
        try {
          const state = await sidebar.bind(pending.context);
          text = (state.state === 'unsupported'
            ? (english ? 'Project associated, but this Cindy lacks a required plugin interface. Upgrade Cindy before starting workflows. ' : '项目已关联，但当前 Cindy 缺少所需插件接口。请升级 Cindy 后再启动工作流。')
            : state.state === 'check_failed'
            ? (english ? 'Project associated, but workflow inspection failed. Click Refresh in the toolbar. Error: ' : '项目已关联，但流程检查失败。请点击工具栏刷新按钮。错误：') + state.checkError + ' · '
            : (english ? 'Toolbar bound. Open the Workflow panel; unavailable flows remain grey. ' : '工具栏已绑定。请打开插件的工作流面板；没有可用流程时保持置灰。')) + state.directory;
        } catch { text = english ? 'Could not bind this project. Check local directory access.' : '项目绑定失败，请检查本地目录访问权限。'; }
      }
      await cindy.send({ type: 'card-update', callId: message.spawnCallId || message.callId, v: 2, state: 'done',
        html: '<div style="padding:14px;font:13px system-ui;overflow-wrap:anywhere">' + escape(text) + '</div>', height: 140 });
    })().catch(error => console.error('Binding result unavailable:', error.code || error.name));
    return;
  }
  if (message.type === 'tool-call') {
    void (async () => {
      const valid = message.tool === 'get_workflows';
      const english = await englishLocale();
      const context = message.args?.session_context;
      let html, result;
      if (!valid) {
        await cindy.send({ type:'tool-result',callId:message.callId,ok:false,errorCode:'UNKNOWN_WORKFLOW_TOOL',message:'未知工作流工具。' }); return;
      }
      if (!context?.session_id || !context.workdir_is_local || !context.workdir) {
        html = '<div style="padding:14px">' + (english ? 'No verified local project context. Open a local project chat and try again.' : '未取得可信的本地项目上下文。请在本地项目聊天重新调用；远程工作区暂不支持。') + '</div>';
        result = { state:'unavailable',reason:'LOCAL_CONTEXT_REQUIRED' };
      } else {
        const nonce = crypto.randomUUID();
        for (const [id, binding] of pendingBindings) if (binding.expires < Date.now()) pendingBindings.delete(id);
        if (pendingBindings.size >= 100) pendingBindings.delete(pendingBindings.keys().next().value);
        pendingBindings.set(nonce, { context: { ...context }, expires: Date.now() + 10 * 60 * 1000 });
        html = bindingCard(nonce, context.workdir, english);
        result = { state:'awaiting-user-binding',note:'请用户点击绑定工具栏。绑定只读检查，不新建任务；之后在侧边面板直接点击工作流。' };
      }
      const card = await cindy.send({ type:'card-update',callId:message.callId,v:2,html,height:220 });
      if (card?.ok === false) result.cardRejected = true;
      await cindy.send({ type:'tool-result',callId:message.callId,ok:true,result });
    })().catch(async () => {
      await cindy.send({ type:'tool-result',callId:message.callId,ok:false,errorCode:'BINDING_PREPARE_FAILED',message:'工作流绑定卡片生成失败，请检查插件。' });
    });
  }
}
