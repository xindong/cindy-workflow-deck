export const FLOW_IDS = Object.freeze(['experiment', 'feature', 'tooling', 'pr', 'merge']);
export const DEFAULT_PATHS = Object.freeze({ experiment: '_S/experiment.md', feature: '_S/feature.md', tooling: '_S/tooling.md', pr: '', merge: '_E/merge.md' });
const fail = message => { throw Object.assign(new Error(message), { code: 'INVALID_CONFIGURATION' }); };
export function directoryKey(value) {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\x00-\x1f]/.test(value)) fail('项目目录无效');
  if (/^[A-Za-z]:[\\/]/.test(value)) return value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
  if (!value.startsWith('/') || value.startsWith('//')) fail('请选择本机绝对目录（不支持网络共享路径）');
  return value.replace(/\/+$/, '') || '/';
}
export function normalizeConfiguration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.projects) || value.projects.length > 8) fail('最多配置8个项目');
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) fail('不支持此配置格式版本');
  const seen = new Set(), roots = new Set();
  const projects = value.projects.map(project => {
    if (!project || typeof project.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(project.id) || seen.has(project.id)) fail('项目标识重复或无效');
    seen.add(project.id);
    const directory = typeof project.directory === 'string' ? project.directory.trim() : '';
    const key = directoryKey(directory);
    if (roots.has(key)) fail('同一目录只能配置一次');
    roots.add(key);
    if (project.workflowDirectory !== undefined && typeof project.workflowDirectory !== 'string') fail('流程目录无效');
    const workflowDirectory = project.workflowDirectory?.trim() || '';
    if (workflowDirectory) directoryKey(workflowDirectory);
    const workflowLocation = workflowDirectory ? { workflowDirectory } : {};
    if (project.discovery === 'auto' || !project.workflows) {
      const name = directory.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || directory;
      return { id: project.id, name: name.slice(0,80), directory, ...workflowLocation, discovery: 'auto' };
    }
    if (typeof project.name !== 'string' || !project.name.trim() || project.name.length > 80 || /[\x00-\x1f]/.test(project.name)) fail('项目名称无效');
    const workflows = {};
    for (const id of FLOW_IDS) {
      const item = project.workflows?.[id];
      if (!item || typeof item.path !== 'string' || item.path.length > 2000 || /[\x00-\x1f]/.test(item.path)) fail('流程文件路径无效：' + id);
      const path = item.path.trim();
      if (path.startsWith('~') || path.startsWith('//') || path.startsWith('\\\\')) fail('不支持此路径格式：' + id);
      const absolute = path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
      if (absolute && item.external !== true) fail('项目外绝对路径需要显式允许：' + id);
      if (!absolute && (path.split(/[\\/]/).some(p => p === '..') || /^[A-Za-z]:/.test(path))) fail('相对路径不能越出项目：' + id);
      workflows[id] = { path, external: item.external === true };
    }
    return { id: project.id, name: project.name.trim(), directory, ...workflowLocation, workflows };
  });
  const activeProjectId = value.activeProjectId || '';
  if (typeof activeProjectId !== 'string' || (activeProjectId && !seen.has(activeProjectId))) fail('当前项目不存在');
  if (projects.length && !activeProjectId) fail('请选择当前项目');
  return { schemaVersion: 1, activeProjectId, projects };
}
export function emptyConfiguration() { return { schemaVersion: 1, activeProjectId: '', projects: [] }; }
export function newProject(id = crypto.randomUUID()) { return { id, name: '新项目', directory: '', workflows: Object.fromEntries(FLOW_IDS.map(key => [key, { path: DEFAULT_PATHS[key], external: false }])) }; }
export function projectForDirectory(configuration, dir) {
  const key = directoryKey(dir);
  return normalizeConfiguration(configuration).projects.find(project => directoryKey(project.directory) === key);
}
export function configurationState(data) {
  const record = data.projectConfiguration;
  if (!record) return { revision: 0, configuration: emptyConfiguration() };
  if (!Number.isSafeInteger(record.revision) || record.revision < 0) fail('配置版本无效');
  return { revision: record.revision, configuration: normalizeConfiguration(record.configuration) };
}
export function updateConfiguration(data, expectedRevision, configuration) {
  const current = configurationState(data);
  if (expectedRevision !== current.revision) throw Object.assign(new Error('配置已在其它窗口更新，请重新加载后再保存'), { code: 'CONFIG_CONFLICT' });
  return { revision: current.revision + 1, configuration: normalizeConfiguration(configuration) };
}
