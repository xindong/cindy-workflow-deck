import { configurationState, updateConfiguration, directoryKey } from './core/project-config.mjs';
export function createConfigurationController({ store, pick, inspect, git, openPreview, diagnosis, conflict, changed = () => {} }) {
  return async function handle(method, params = {}) {
    switch (method) {
      case 'conflict-start': case 'conflict-read': case 'conflict-acknowledge':
        if(!conflict)throw Object.assign(new Error('AI 修复尚未接入，请使用 Cindy 插件。'),{code:'AI_UNAVAILABLE'});
        return conflict(method,params);
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
        // Also protect live tasks saved by earlier versions, before disk reservations
        // existed. New dispatch/write races are guarded by the worker reservation.
        if(!['status','diagnosis-status','operation-progress','file-open','file-diff','diff','history','issues-list','stash-list','stash-files','stash-diff'].includes(params.action)){
          const data=await store.read(),records={...data.conflictRepairsByDirectory};
          for(const record of Object.values(data.conflictRepairs||{}))if(record?.directory){const key=directoryKey(record.directory);records[key]??=record;}
          const key=directoryKey(project.directory);
          if(Object.values(records).some(record=>record?.directory&&directoryKey(record.directory)===key&&['running','uncertain'].includes(record.state)))throw Object.assign(new Error('AI 正在处理项目或处理结果待核对，请先从恢复卡检查或确认任务已结束。'),{code:'AI_REPAIR_PENDING'});
        }
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
