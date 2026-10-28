import { configurationState, updateConfiguration } from './core/project-config.mjs';
export function createConfigurationController({ store, pick, inspect, git, openPreview, diagnosis, changed = () => {} }) {
  return async function handle(method, params = {}) {
    switch (method) {
      case 'diagnosis-prepare': case 'diagnosis-run': case 'diagnosis-read':
        if(!diagnosis)throw Object.assign(new Error('当前版本尚未接入 AI 诊断，请更新插件。'),{code:'AI_UNAVAILABLE'});
        return diagnosis(method,params);
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
        if(params.action==='file-open') {
          if(!openPreview)throw Object.assign(new Error('当前宿主不支持侧边栏预览，请更新 Cindy。'),{code:'UNSUPPORTED_HOST'});
          const result=await git(project.directory,{...params,action:'file-diff',preview:true});
          const latest=configurationState(await store.read());
          if(latest.revision!==current.revision)throw Object.assign(new Error('项目配置已变化，请重新打开文件'),{code:'CONFIG_CONFLICT'});
          const opened=await openPreview(result.url);
          if(!opened?.ok)throw Object.assign(new Error(opened?.message||'侧边栏未打开，请稍候重新双击文件'),{code:opened?.errorCode||'PREVIEW_FAILED'});
          return {previewOpened:true,path:result.path,target:result.target,commit:result.commit};
        }
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
