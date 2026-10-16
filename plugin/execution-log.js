// Only Host-issued task session ids in our durable receipts may report progress.
export function createExecutionLog({ store, changed = () => {}, now = () => Date.now() }) {
  let queue = Promise.resolve();
  const serial = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
  async function list() {
    const data = await store.read();
    return Object.values(data.sidebarReceipts || {}).filter(r => r.state === 'accepted' && r.sessionId)
      .map(r => ({ sessionId: r.sessionId, workflowId: r.workflowId, sourceSessionId: r.sourceSessionId, entries: (data.executionLogs || {})[r.sessionId] || [] })).slice(-30).reverse();
  }
  function append(sessionId, entry, eventId) { return serial(async () => {
    const data = await store.read();
    const own = Object.values(data.sidebarReceipts || {}).some(r => r.state === 'accepted' && r.sessionId === sessionId);
    if (!own) throw Object.assign(new Error('Not a workflow task'), { code: 'UNOWNED_SESSION' });
    const logs = Object.fromEntries(Object.entries(data.executionLogs || {}).filter(([id]) => Object.values(data.sidebarReceipts || {}).some(r => r.state === 'accepted' && r.sessionId === id)));
    const items = logs[sessionId] || [];
    if (eventId && items.some(item => item.eventId === eventId)) return { recorded: true };
    logs[sessionId] = [...items, { ...entry, at: now(), ...(eventId ? { eventId } : {}) }].slice(-60);
    // Keep a bounded tail across tasks; do not touch dispatch uncertainty records.
    const bytes = () => new TextEncoder().encode(JSON.stringify(logs)).length;
    while (bytes() > 18000) {
      const id = Object.keys(logs).filter(id => logs[id].length).sort((a,b) => logs[a][0].at - logs[b][0].at)[0];
      if (!id) break; logs[id].shift();
    }
    await store.write({ executionLogs: logs });
    changed(await list()); return { recorded: true };
  }); }
  return { list,
    report(context, args, callId) {
      if (!context?.session_id || !['step','output','completed','blocked'].includes(args.status) || typeof args.title !== 'string' || !args.title.trim() || args.title.length > 160 || typeof args.detail !== 'string' || args.detail.length > 3000) throw Object.assign(new Error('Invalid progress report'), { code: 'INVALID_REPORT' });
      return append(context.session_id, { kind: args.status, title: args.title.trim(), detail: args.detail, source: 'agent-report' }, callId);
    },
    event(message) {
      if (!['did-turn-start','did-turn-end','did-thinking-start','did-thinking-end','did-approval-start','did-approval-end','did-user-input-start','did-user-input-end'].includes(message.name)) return Promise.resolve();
      return append(message.data?.sessionId, { kind: 'host', title: message.name, detail: message.data?.endReason || '', source: 'host-event' }, message.seq == null ? undefined : 'event:' + message.seq);
    },
  };
}
