// Register synchronously: the Host may dispatch immediately after boot.
// Module loading must not create a gap in the Host message listener.
const earlyMessages = [];
let dispatch;
cindy.onHostMessage(message => {
  if (dispatch) dispatch(message);
  else earlyMessages.push(message);
});
void import('./runtime.js').then(runtime => {
  dispatch = runtime.handleHostMessage;
  for (const message of earlyMessages.splice(0)) dispatch(message);
}).catch(error => {
  console.error('Workflow Deck failed to start:', error.code || error.name);
  dispatch = message => {
    if (message.type === 'tool-call') void cindy.send({ type: 'tool-result', callId: message.callId,
      ok: false, errorCode: 'PLUGIN_START_FAILED', message: '工作流插件启动失败，请检查插件日志。' });
  };
  for (const message of earlyMessages.splice(0)) dispatch(message);
});
