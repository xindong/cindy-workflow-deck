import { CHANNEL } from './workflows.js';
export function createSettingsTransport() {
  if (globalThis.jixinDesktop) return { call: (method, params = {}) => globalThis.jixinDesktop.request(method, params), standalone: true, close() {} };
  const channel = new BroadcastChannel(CHANNEL);
  const pending = new Map();
  const configurationListeners=new Set();
  const awake = fetch('/wake').then(response=>{if(!response.ok)throw new Error('插件唤醒失败，请确认插件已启用');});
  channel.onmessage = ({ data }) => {
    if(data?.from==='main' && data.type==='configuration-changed') {
      for(const listener of configurationListeners)listener();
      return;
    }
    if (data?.from !== 'main' || data.type !== 'settings-result') return;
    const item = pending.get(data.reqId); if (!item) return;
    clearTimeout(item.timer); clearInterval(item.retry); pending.delete(data.reqId);
    if (data.ok) item.resolve(data.result);
    else item.reject(Object.assign(new Error(data.message || data.code), { code: data.code }));
  };
  return { standalone: false, onConfigurationChanged(listener){configurationListeners.add(listener);return ()=>configurationListeners.delete(listener);}, call(method, params = {}) {
    const reqId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      // A native picker waits for a human decision, rather than an RPC deadline.
      const timer = method === 'config-pick-directory' ? undefined : setTimeout(() => { clearInterval(pending.get(reqId)?.retry); pending.delete(reqId); reject(Object.assign(new Error('插件逻辑未响应，请确认插件已启用。写入结果不确定时先重新加载，不要重复保存。'), { code: 'RESPONSE_UNCONFIRMED' })); }, method === 'git-request' ? (params.action?.startsWith('beginner-')?915000:125000) : 30000);
      const item={resolve,reject,timer}; pending.set(reqId,item);
      const send=()=>channel.postMessage({from:'settings',type:method,reqId,params});
      void awake.then(()=>{
        if(!pending.has(reqId))return;send();
        if(method==='config-read') item.retry=setInterval(()=>{if(pending.has(reqId))send();},200);
      }).catch(error=>{clearTimeout(timer);clearInterval(item.retry);pending.delete(reqId);reject(error);});
    });
  }, close() { channel.close(); for (const item of pending.values()) { clearTimeout(item.timer); clearInterval(item.retry); item.reject(new Error('Settings closed')); } pending.clear(); } };
}
