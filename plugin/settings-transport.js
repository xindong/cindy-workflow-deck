import { CHANNEL } from './workflows.js';
export function createSettingsTransport() {
  if (globalThis.jixinDesktop) return { call: (method, params = {}) => globalThis.jixinDesktop.request(method, params), standalone: true, close() {} };
  const channel = new BroadcastChannel(CHANNEL);
  const pending = new Map();
  channel.onmessage = ({ data }) => {
    if (data?.from !== 'main' || data.type !== 'settings-result') return;
    const item = pending.get(data.reqId); if (!item) return;
    clearTimeout(item.timer); pending.delete(data.reqId);
    if (data.ok) item.resolve(data.result);
    else item.reject(Object.assign(new Error(data.message || data.code), { code: data.code }));
  };
  return { standalone: false, call(method, params = {}) {
    const reqId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(reqId); reject(Object.assign(new Error('插件逻辑未响应，请确认插件已启用。写入结果不确定时先重新加载，不要重复保存。'), { code: 'RESPONSE_UNCONFIRMED' })); }, 30000);
      pending.set(reqId, { resolve, reject, timer });
      channel.postMessage({ from: 'settings', type: method, reqId, params });
    });
  }, close() { channel.close(); for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Settings closed')); } pending.clear(); } };
}
