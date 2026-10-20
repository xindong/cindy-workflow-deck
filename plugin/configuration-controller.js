import { configurationState, updateConfiguration } from './core/project-config.mjs';
export function createConfigurationController({ store, pick, inspect, git, changed = () => {} }) {
  return async function handle(method, params = {}) {
    switch (method) {
      case 'config-read': return configurationState(await store.read());
      case 'config-save': {
        let result;
        await store.update(data => { result = updateConfiguration(data, params.expectedRevision, params.configuration); return { projectConfiguration: result }; });
        changed(result); return result;
      }
      case 'config-pick-directory': {
        const result = await pick();
        if (!result?.ok || !result.path) throw Object.assign(new Error(result?.message || '目录选择未完成'), { code: result?.errorCode || 'CANCELLED' });
        return { path: result.path };
      }
      case 'git-request': {
        const current = configurationState(await store.read());
        if(current.revision !== params.revision) throw Object.assign(new Error('项目配置已变化，请重新加载'),{code:'CONFIG_CONFLICT'});
        const project = current.configuration.projects.find(p=>p.id===current.configuration.activeProjectId && p.id===params.projectId);
        if(!project || !git) throw new Error('请先保存项目或升级插件');
        return git(project.directory,params);
      }
      case 'config-inspect': {
        const current = configurationState(await store.read());
        const project = current.configuration.projects.find(p => p.id === params.projectId);
        if (!project) throw Object.assign(new Error('请先保存项目配置'), { code: 'PROJECT_NOT_CONFIGURED' });
        return { ...await inspect(project.directory, project), directory: project.directory };
      }
      default: throw Object.assign(new Error('未知配置操作'), { code: 'UNKNOWN_ACTION' });
    }
  };
}
