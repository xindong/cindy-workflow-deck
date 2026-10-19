const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jixinDesktop', Object.freeze({
  async request(method, params = {}) {
    const response = await ipcRenderer.invoke('jixin:request', method, params);
    if (!response.ok) throw Object.assign(new Error(response.message), { code: response.code });
    return response.result;
  },
}));
