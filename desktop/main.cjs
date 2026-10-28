const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
protocol.registerSchemesAsPrivileged([{ scheme: 'jixin-app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window;
const pluginRoot = path.resolve(__dirname, '../plugin');
app.setName('极心许愿');
// An explicit isolated data directory supports reproducible local acceptance tests.
const testIndex = process.argv.indexOf('--jixin-user-data');
if (testIndex >= 0 && process.argv[testIndex + 1]) app.setPath('userData', path.resolve(process.argv[testIndex + 1]));
async function boot() {
  protocol.handle('jixin-app', async request => {
    const url = new URL(request.url);
    const filename = path.resolve(pluginRoot, '.' + decodeURIComponent(url.pathname));
    const relative = path.relative(pluginRoot, filename);
    if (url.host !== 'app' || relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });
    const script = filename.endsWith('.js') || filename.endsWith('.mjs');
    const allowed = script || filename.endsWith('.css') || filename.endsWith('settings.html');
    if (!allowed) return new Response('Not found', { status: 404 });
    try {
      const content = await fs.readFile(filename);
      const type = script ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html';
      return new Response(content, { headers: { 'Content-Type': type, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  const { createProjectService } = await import('./project-service.js');
  const service = createProjectService({ file: path.join(app.getPath('userData'), 'projects.json'),
    pickDirectory: async () => { const result = await dialog.showOpenDialog(window, { title: '选择项目目录', properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; },
    pickFile: async directory => { const result = await dialog.showOpenDialog(window, { title: '选择工作流指令文件（只读，不执行）', defaultPath: directory, properties: ['openFile'] }); return result.canceled ? null : result.filePaths[0]; },
  });
  ipcMain.handle('jixin:request', async (event, method, params) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Invalid caller');
    if (!['config-read','config-save','config-pick-directory','config-pick-file','config-inspect','git-request','diagnosis-prepare','diagnosis-run','diagnosis-read'].includes(method)) return { ok: false, code: 'UNSUPPORTED_OPERATION', message: '此操作尚未开放' };
    try { return { ok: true, result: await service(method, params) }; }
    catch (error) { return { ok: false, code: error.code || 'OPERATION_FAILED', message: error.message }; }
  });
  createWindow();
}
function createWindow() {
  window = new BrowserWindow({ title: '极心许愿 · 项目配置', width: 1040, height: 820, minWidth: 360, minHeight: 480,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('closed', () => { window = null; });
  void window.loadURL('jixin-app://app/settings.html');
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(boot).catch(error => { console.error(error); app.exit(1); });
}
app.on('window-all-closed', () => app.quit());
