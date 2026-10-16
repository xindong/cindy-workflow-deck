import { WORKFLOWS, buildPrompt, workflowById } from './workflows.js';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function workflowCard(english = false) {
  return '<style>.deck{padding:14px;color:var(--text-primary,#262626);font:13px system-ui}.deck-actions{display:flex;flex-wrap:wrap;gap:8px}.deck button{padding:9px 12px;border:1px solid var(--border-default,#ddd);border-radius:24px;background:var(--surface,#f8f8f6);color:inherit}.deck p{line-height:1.6}</style><div class="deck"><h3>' + (english ? 'Start a workflow' : '开始一项工作') + '</h3><p>' + (english ? 'Each click creates a new task using this chat’s directory and model. Chat history is not copied. Permissions follow Cindy.' : '每次点击新建独立任务，继承这张卡片所属聊天的目录与模型，不复制聊天记录；权限由 Cindy 管理。') + '</p><div class="deck-actions">' + WORKFLOWS.map(flow => '<button data-ghost-action="start:' + flow.id + '" data-ghost-prompt="' + (english ? 'Work goal (optional)' : '补充工作目标（可选）') + '" title="' + escape(flow.source) + '">' + escape(english ? flow.en : flow.label) + '</button>').join('') + '</div></div>';
}
export function createCardLauncher({ agent, store }) {
  let queue = Promise.resolve();
  return message => {
    const work = async () => {
      const id = message.actionId?.startsWith('start:') ? message.actionId.slice(6) : '';
      if (!workflowById(id)) return { state: 'rejected', code: 'INVALID_WORKFLOW' };
      if (!message.userActionToken || !message.spawnCallId || !message.sessionId) return { state: 'rejected', code: 'MISSING_CLICK_TICKET' };
      const data = await store.read();
      const receipts = Object.assign(Object.create(null), data.cardReceipts || {});
      const key = message.spawnCallId;
      if (Object.hasOwn(receipts, key)) return receipts[key];
      // Only acknowledged receipts can be pruned; Host single-use tickets still
      // forbid a second submission after an old acknowledged receipt is removed.
      while (Object.keys(receipts).length >= 100) {
        const old = Object.keys(receipts).find(id => receipts[id].state !== 'uncertain');
        if (!old) return { state: 'rejected', code: 'CARD_JOURNAL_FULL' };
        delete receipts[old];
      }
      const text = buildPrompt(id, message.prompt || '');
      // Persist BEFORE consuming the single-use ticket; never replay uncertain runs.
      receipts[key] = { state: 'uncertain', workflowId: id };
      await store.write({ cardReceipts: receipts });
      let result;
      try {
        const reply = await agent.run({ mode: 'new', title: workflowById(id).label,
          promptTemplate: '{{user_message}}', userMessage: text,
          event: { actionId: message.actionId, callId: message.callId },
          userActionToken: message.userActionToken });
        result = reply?.ok === true && typeof reply.sessionId === 'string' && reply.sessionId
          ? { state: 'accepted', workflowId: id, sessionId: reply.sessionId }
          : reply?.ok === false ? { state: 'rejected', workflowId: id, code: reply.errorCode || 'HOST_REJECTED' }
          : { state: 'uncertain', workflowId: id, code: 'UNVERIFIED_RECEIPT' };
      } catch { result = { state: 'uncertain', workflowId: id, code: 'UNVERIFIED_RECEIPT' }; }
      receipts[key] = result;
      await store.write({ cardReceipts: receipts });
      return result;
    };
    const next = queue.then(work); queue = next.catch(() => {}); return next;
  };
}
export function receiptCard(result, english = false) {
  const label = result.state === 'accepted'
    ? (english ? 'New task accepted: ' : '新任务已受理：') + result.sessionId
    : result.state === 'rejected' ? (english ? 'Not accepted. Check the code and Cindy permissions; journal capacity requires plugin support. ' : '未受理，请核对错误码及 Cindy 权限提示；记录容量不足时需修复插件记录。') + (result.code || '')
    : (english ? 'Delivery is unverified. Check the task list before clicking again.' : '派发结果待核实，请先检查任务列表，勿重复点击。');
  return '<div style="padding:14px;font:13px system-ui;overflow-wrap:anywhere">' + escape(label) + '</div>';
}
