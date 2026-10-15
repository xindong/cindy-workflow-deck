import { createController } from './controller.js';
import { CHANNEL, WORKFLOWS } from './workflows.js';

const channel = new BroadcastChannel(CHANNEL);
const controller = createController({
  tasks: cindy.tasks,
  store: {
    async read() {
      const response = await fetch('/kv');
      if (!response.ok) throw new Error('Cannot read launch journal');
      return response.json();
    },
    async write(data) {
      const response = await fetch('/kv', { method: 'PUT', body: JSON.stringify(data) });
      if (!response.ok) throw new Error('Cannot save launch journal');
    },
  },
});
const inFlight = new Map();
channel.onmessage = ({ data }) => {
  if (data?.from !== 'panel' || typeof data.reqId !== 'string') return;
  channel.postMessage({ from: 'main', type: 'ack', reqId: data.reqId });
  // Bound transient replies. Durable launch deduplication lives in controller.
  if (inFlight.has(data.reqId)) {
    void inFlight.get(data.reqId).then(reply => channel.postMessage(reply));
    return;
  }
  const work = async () => {
    switch (data.type) {
      case 'list': return controller.list();
      case 'refresh': return controller.refresh();
      case 'launch': return controller.launch(data.reqId, data.workflowId, data.context);
      case 'recover': return controller.recover(data.launchId);
      default: throw new Error('Unknown action');
    }
  };
  const promise = work().then(result => ({ from: 'main', type: 'result', reqId: data.reqId, ok: true, result }),
    error => ({ from: 'main', type: 'result', reqId: data.reqId, ok: false, code: error.code || 'STORAGE_UNAVAILABLE' }));
  inFlight.set(data.reqId, promise);
  if (inFlight.size > 100) inFlight.delete(inFlight.keys().next().value);
  void promise.then(reply => channel.postMessage(reply));
};
cindy.onHostMessage(message => {
  if (message.type === 'host-context-changed') channel.postMessage({ from: 'main', type: 'locale-changed' });
  if (message.type === 'tool-call') {
    void cindy.send({ type: 'tool-result', callId: message.callId, ok: message.tool === 'get_workflows',
      ...(message.tool === 'get_workflows'
        ? { result: { workflows: WORKFLOWS, taskMode: 'new-independent-task-per-click', note: '打开工作流面板并点击按钮发起任务；项目目录和模型由插件任务设置管理。' } }
        : { errorCode: 'UNKNOWN_WORKFLOW_TOOL', message: '未知工具，请使用 get_workflows 查看工作流说明。' }),
    });
  }
});
