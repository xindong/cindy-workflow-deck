import { WORKFLOWS, buildPrompt, workflowById } from './workflows.js';
export function createSidebar({ inspect, agent, store, now = () => Date.now(), changed = () => {} }) {
  const bindings = new Map(), children = new Map();
  let active = '', focused = '', focusedHint = ''; let busy = false; let nextLaunchAt = 0;
  let queue = Promise.resolve();
  const serial = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
  const notify = () => changed(view());
  function selectSession(sessionId, hint = '') {
    focused = typeof sessionId === 'string' ? sessionId : '';
    focusedHint = typeof hint === 'string' ? hint : '';
    active = focused;
    const child = children.get(focused);
    // Only a successful Host launch receipt may link a child back to a bound source.
    // Matching directory strings alone never establish trust or a new association.
    if (child) {
      if (bindings.get(child.source) === child.binding && (!focusedHint || focusedHint === child.binding.directory)) active = child.source;
      else children.delete(focused);
    } else {
      const binding = bindings.get(active);
      if (binding && focusedHint && focusedHint !== binding.directory) bindings.delete(active);
    }
  }
  function view() {
    const binding = bindings.get(active);
    const state = !binding ? 'unbound' : binding.readOnly ? 'readonly' : binding.problem || 'ready';
    return { sessionId: active, directory: binding?.directory || '', state, busy, nextLaunchAt,
      checkError: binding?.checkError || '', checkedAt: binding?.checkedAt || '', workflows: Object.fromEntries(WORKFLOWS.map(flow => [flow.id, {
        enabled: state === 'ready' && !busy && now() >= nextLaunchAt && binding.workflows?.[flow.id]?.ok === true,
        reason: state !== 'ready' ? state : busy ? 'busy' : now() < nextLaunchAt ? 'cooldown' : binding.workflows?.[flow.id]?.reason || (binding.workflows?.[flow.id]?.ok ? '' : 'check_failed'),
        source: binding?.workflows?.[flow.id]?.source || flow.source,
      }])) };
  }
  async function checkBinding(binding) {
    binding.problem = 'checking'; binding.checkError = ''; notify();
    try {
      const result = await inspect(binding.directory);
      if (!result?.workflows || !WORKFLOWS.every(flow => typeof result.workflows[flow.id]?.ok === 'boolean')) throw new Error('Invalid inspection');
      binding.workflows = result.workflows; binding.checkedAt = result.checkedAt || ''; binding.problem = '';
    } catch (error) { binding.problem = 'check_failed'; binding.workflows = {}; binding.checkError = /^[A-Z][A-Z0-9_]{1,60}$/.test(error.code || '') ? error.code : 'PROJECT_CHECK_FAILED'; }
    notify();
  }
  return {
    view,
    // Only runtime supplies Host-issued, local session_context, never panel paths.
    bind: context => serial(async () => {
      if (!context?.session_id || !context.workdir_is_local || !context.workdir) throw Object.assign(new Error('LOCAL_CONTEXT_REQUIRED'), { code: 'LOCAL_CONTEXT_REQUIRED' });
      const binding = { directory: context.workdir, readOnly: context.workdir_is_read_only !== false, workflows: {} };
      children.delete(context.session_id);
      bindings.set(context.session_id, binding); selectSession(context.session_id, context.workdir); notify();
      await checkBinding(binding); return view();
    }),
    forgetSession(sessionId) {
      bindings.delete(sessionId); children.delete(sessionId);
      for (const [id, child] of children) if (child.source === sessionId) children.delete(id);
      if (focused === sessionId) selectSession('');
      else selectSession(focused, focusedHint);
      notify();
    },
    switchSession(sessionId, hint, dropped = false) {
      if (dropped) { bindings.clear(); children.clear(); }
      selectSession(sessionId, hint);
      notify();
    },
    refresh: () => serial(async () => { const binding = bindings.get(active); if (binding) await checkBinding(binding); return view(); }),
    launch: (requestKey, workflowId, expectedSessionId, goal = '') => serial(async () => {
      if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey) || !workflowById(workflowId)) throw Object.assign(new Error('INVALID_REQUEST'), { code: 'INVALID_REQUEST' });
      const data = await store.read(); const launches = Object.assign(Object.create(null), data.sidebarReceipts || {});
      if (Object.hasOwn(launches, requestKey)) return launches[requestKey];
      const source = active; const binding = bindings.get(source);
      if (!source || source !== expectedSessionId || !binding) return { state: 'rejected', code: 'SOURCE_CHANGED' };
      if (now() < nextLaunchAt) return { state: 'rejected', code: 'RATE_LIMITED' };
      await checkBinding(binding);
      // Recheck after I/O: switching chat during a check must never launch into the old one.
      if (active !== source || bindings.get(source) !== binding || !view().workflows[workflowId].enabled) return { state: 'rejected', code: 'FLOW_UNAVAILABLE' };
      const text = buildPrompt(workflowId, goal);
      while (Object.keys(launches).length >= 80) {
        const old = Object.keys(launches).find(id => launches[id].state !== 'uncertain');
        if (!old) return { state: 'rejected', code: 'JOURNAL_FULL' };
        delete launches[old];
      }
      launches[requestKey] = { state: 'uncertain', workflowId, sourceSessionId: source };
      await store.write({ sidebarReceipts: launches });
      if (active !== source || bindings.get(source) !== binding) {
        launches[requestKey] = { state: 'rejected', code: 'SOURCE_CHANGED' }; await store.write({ sidebarReceipts: launches }); return launches[requestKey];
      }
      busy = true; nextLaunchAt = now() + 10000; notify();
      let result;
      try {
        const receipt = await agent.run({ mode: 'new', trigger: 'background', sessionId: source,
          title: workflowById(workflowId).label, promptTemplate: '{{user_message}}', userMessage: text,
          event: { workflowId, source: 'sidebar-user-click' } });
        result = receipt?.ok === true && typeof receipt.sessionId === 'string' && receipt.sessionId
          ? { state: 'accepted', sessionId: receipt.sessionId, sourceSessionId: source, workflowId }
          : receipt?.ok === false ? { state: 'rejected', code: receipt.errorCode || 'HOST_REJECTED', workflowId }
          : { state: 'uncertain', code: 'UNVERIFIED_RECEIPT', workflowId };
        if (result.code === 'PERMISSION_DENIED') bindings.delete(source);
        if (result.state === 'accepted' && bindings.get(source) === binding) {
          children.set(result.sessionId, { source, binding });
          if (children.size > 80) children.delete(children.keys().next().value);
          // A focus event can arrive before agent.run returns the launch receipt.
          if (focused === result.sessionId) selectSession(focused, focusedHint);
        }
      } catch { result = { state: 'uncertain', code: 'UNVERIFIED_RECEIPT', workflowId }; }
      launches[requestKey] = result;
      try { await store.write({ sidebarReceipts: launches }); }
      finally { busy = false; notify(); }
      return result;
    }),
  };
}
