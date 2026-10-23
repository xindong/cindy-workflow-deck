import { configurationState } from './core/project-config.mjs';
import { WORKFLOWS, buildPrompt, workflowById } from './workflows.js';
import { isUnsupported } from './host-compat.js';

// Host authorizes workingDir from its picker ledger; foreground chat is irrelevant.
export function createProjectSidebar({ store, agent, inspect, changed = () => {}, now = () => Date.now() }) {
  let project, revision = -1, workflows = {}, problem = '', checkError = '', checkedAt = '', busy = false, nextLaunchAt = 0, verificationNeeded = false, dispatchError = '';
  let queue = Promise.resolve();
  const serial = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
  const notify = () => changed(view());
  function view() {
    const state = !project ? 'unbound' : typeof agent?.errand !== 'function' || typeof agent?.queryErrand !== 'function' ? 'unsupported' : problem || 'ready';
    return { mode: 'project', sessionId: project?.id || '', directory: project?.directory || '', state, busy, nextLaunchAt, checkError, checkedAt, verificationNeeded, dispatchError,
      workflows: Object.fromEntries(WORKFLOWS.map(flow => [flow.id, {
        enabled: state === 'ready' && !busy && now() >= nextLaunchAt && workflows[flow.id]?.ok === true,
        reason: state !== 'ready' ? state : busy ? 'busy' : now() < nextLaunchAt ? 'cooldown' : workflows[flow.id]?.reason || (workflows[flow.id]?.ok ? '' : 'check_failed'),
        source: workflows[flow.id]?.source || flow.source,
      }])) };
  }
  async function load() {
    const current = configurationState(await store.read());
    project = current.configuration.projects.find(p => p.id === current.configuration.activeProjectId);
    revision = current.revision;
  }
  async function check() {
    workflows = {}; checkError = ''; checkedAt = '';
    if (!project) { problem = ''; notify(); return; }
    problem = 'checking'; notify();
    try {
      const result = await inspect(project.directory, project);
      if (!WORKFLOWS.every(flow => typeof result?.workflows?.[flow.id]?.ok === 'boolean')) throw new Error('Invalid inspection');
      workflows = result.workflows; checkedAt = result.checkedAt || ''; problem = '';
    } catch (error) {
      problem = isUnsupported(error.code) ? 'unsupported' : 'check_failed';
      checkError = /^[A-Z][A-Z0-9_]{1,60}$/.test(error.code || '') ? error.code : 'PROJECT_CHECK_FAILED';
    }
    notify();
  }
  async function receipts() { return (await store.read()).sidebarReceipts || {}; }
  async function writeReceipt(key, value) {
    await store.update(data => {
      const journal = { ...data.sidebarReceipts, [key]: value };
      while (Object.keys(journal).length > 80) {
        const oldest = Object.keys(journal).find(id => id !== key && (journal[id].state === 'rejected' || (journal[id].state === 'accepted' && journal[id].jobStatus !== 'running')));
        if (!oldest) throw Object.assign(new Error('Unresolved launches fill the journal'), { code: 'JOURNAL_FULL' });
        delete journal[oldest];
      }
      return { sidebarReceipts: journal };
    });
  }
  async function query() {
    const journal = await receipts();
    let unresolved = false;
    for (const [key, record] of Object.entries(journal)) {
      if (record.mode !== 'project' || record.userChecked || record.state !== 'accepted' || record.jobStatus !== 'running') continue;
      let reply;
      try { reply = await agent.queryErrand({ jobId: record.jobId }); }
      catch {
        unresolved = true;
        await writeReceipt(key, { ...record, queryError: 'UNVERIFIED_RECEIPT' });
        continue;
      }
      if (!reply?.ok) {
        unresolved = true; // Expiry/restart is not proof that the task never ran.
        await writeReceipt(key, { ...record, queryError: reply?.errorCode || 'UNVERIFIED_RECEIPT' });
        continue;
      }
      const status = ['running', 'done', 'failed'].includes(reply.status) ? reply.status : 'running';
      if (status === 'failed') dispatchError = reply.errorCode || 'HOST_REJECTED';
      unresolved ||= status === 'running';
      await writeReceipt(key, { ...record, jobStatus: status, ...(reply.sessionId ? { sessionId: reply.sessionId } : {}), queryError: '', errorCode: reply.errorCode || '' });
    }
    const latest = Object.values(await receipts()).filter(r => r.mode === 'project' && !r.userChecked);
    verificationNeeded = latest.some(r => r.state === 'uncertain' || r.queryError);
    busy = unresolved || latest.some(r => r.state === 'uncertain');
  }
  return {
    view,
    acknowledge: () => serial(async () => {
      for (const [key, record] of Object.entries(await receipts())) {
        if (record.mode === 'project' && !record.userChecked && (record.state === 'uncertain' || record.queryError)) await writeReceipt(key, { ...record, userChecked: true });
      }
      await query(); notify(); return view();
    }),
    refresh: () => serial(async () => { await load(); await check(); await query(); notify(); return view(); }),
    launch: (key, workflowId, expectedProjectId, goal = '') => serial(async () => {
      if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,60}$/.test(key) || !workflowById(workflowId)) throw Object.assign(new Error('Invalid request'), { code: 'INVALID_REQUEST' });
      const prior = (await receipts())[key];
      if (prior) return prior;
      await load(); await query();
      if (!project || project.id !== expectedProjectId) return { state: 'rejected', code: 'SOURCE_CHANGED' };
      if (busy) return { state: 'rejected', code: 'BUSY' };
      if (now() < nextLaunchAt) return { state: 'rejected', code: 'RATE_LIMITED' };
      const selected = project, selectedRevision = revision;
      await check();
      if (!view().workflows[workflowId].enabled) return { state: 'rejected', code: problem === 'unsupported' ? 'UNSUPPORTED_HOST' : 'FLOW_UNAVAILABLE' };
      const current = configurationState(await store.read());
      if (current.revision !== selectedRevision || current.configuration.activeProjectId !== selected.id) return { state: 'rejected', code: 'SOURCE_CHANGED' };
      const prompt = '用户选择的项目根目录（JSON路径）：' + JSON.stringify(selected.directory) + '。在任何项目操作之前核对实际工作目录与该目录相同（允许真实路径规范化）。如 Host 的任务目录覆盖配置导致不一致，立即停止并报告，不要在其它项目执行。流程文件仅提供指令；即使位于其它目录，也不要切换到流程目录执行 Git 或修改该目录的项目。\n\n' + buildPrompt(workflowId, goal, workflows[workflowId].source);
      const record = { mode: 'project', state: 'uncertain', workflowId, projectId: selected.id, directory: selected.directory };
      await writeReceipt(key, record);
      const latest = configurationState(await store.read());
      if (latest.revision !== selectedRevision) {
        const rejected = { ...record, state: 'rejected', code: 'SOURCE_CHANGED' }; await writeReceipt(key, rejected); return rejected;
      }
      busy = true; dispatchError = ''; nextLaunchAt = now() + 10000; notify();
      let result;
      try {
        const reply = await agent.errand({ task: prompt, title: workflowById(workflowId).label, workingDir: selected.directory, sessionKey: key });
        result = reply?.ok === true && typeof reply.jobId === 'string' && reply.jobId
          ? { ...record, state: 'accepted', jobId: reply.jobId, jobStatus: 'running', ...(reply.sessionId ? { sessionId: reply.sessionId } : {}) }
          : reply?.ok === false ? { ...record, state: 'rejected', code: reply.errorCode || 'HOST_REJECTED' }
          : record;
      } catch (error) {
        result = isUnsupported(error.code) ? { ...record, state: 'rejected', code: 'UNSUPPORTED_HOST' } : record;
      }
      await writeReceipt(key, result);
      busy = result.state !== 'rejected'; verificationNeeded = result.state === 'uncertain'; notify(); return result;
    }),
  };
}
