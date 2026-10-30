const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jixinDesktop', Object.freeze({
  // Return errors as data across contextBridge; thrown Error custom properties
  // are not preserved. The renderer reconstructs its local Error with the code.
  async requestResult(method, params = {}) { return ipcRenderer.invoke('jixin:request', method, params); },
  async request(method, params = {}) {
    const response = await ipcRenderer.invoke('jixin:request', method, params);
    if (!response.ok) throw Object.assign(new Error(response.message), { code: response.code });
    return response.result;
  },
}));
