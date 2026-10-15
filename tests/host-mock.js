// Browser-only fixture. NEVER included in the plugin package.
const settings = new URLSearchParams(location.search);
const dark = settings.get('theme') === 'dark';
const root = document.documentElement;
for (const [name, value] of Object.entries(dark ? {
  '--panel-bg': '#1f1f1e', '--surface': '#1f1f1e', '--surface-elevated': '#2c2c2a',
  '--surface-chip': '#3c3c3a', '--border-default': '#3c3c3a', '--text-primary': '#d4d4d4',
  '--text-secondary': '#a3a3a3', '--focus-ring': '#417cdd',
} : {
  '--panel-bg': '#f8f8f6', '--surface': '#f8f8f6', '--surface-elevated': '#fff',
  '--surface-chip': '#e5e5e5', '--border-default': '#d7d7d4', '--text-primary': '#262626',
  '--text-secondary': '#737373', '--focus-ring': '#417cdd',
})) root.style.setProperty(name, value);
root.style.colorScheme = dark ? 'dark' : 'light';
const created = new Map();
const sent = new Map();
const calls = { creates: [], sends: [] };
const options = { deny: settings.has('deny'), loseSend: settings.has('lose-send'), status: 'running' };
globalThis.mockHost = { calls, options };
globalThis.cindy = {
  onHostMessage() {},
  async send() {},
  tasks: {
    async capabilities() { return { operations: ['create', 'send', 'getRun'] }; },
    async create(args) {
      calls.creates.push(args);
      if (options.deny) throw Object.assign(new Error('Denied'), { code: 'PERMISSION_DENIED' });
      if (!created.has(args.requestKey)) created.set(args.requestKey, { taskId: `preview-task-${created.size + 1}`, revision: 1, workingDir: '/preview/selected-project', permissionMode: 'ask' });
      return created.get(args.requestKey);
    },
    async send(args) {
      calls.sends.push(args);
      if (!sent.has(args.requestKey)) sent.set(args.requestKey, { runId: `preview-run-${sent.size + 1}` });
      if (options.loseSend) { options.loseSend = false; throw new Error('Lost receipt'); }
      return sent.get(args.requestKey);
    },
    async getRun() { return { status: options.status }; },
  },
};
await import('/runtime.js');
