import {directoryKey} from './core/project-config.mjs';
// Room identity is shared by every project action. Request/job ids remain unique:
// an uncertain send must never be replayed merely because its room is reusable.
export async function projectTaskKey(directory) {
  const bytes=new TextEncoder().encode(directoryKey(directory));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return 'jixin-project-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,48);
}
export const PROJECT_TASK_TITLE='极心许愿 · 项目处理';
export const PROJECT_TASK_CONTEXT='同一执行项目复用一个处理任务。本次输入只授权下述目标；历史消息仅供参考，先重新检查实际项目、文件、Git 状态与适用规则。不自动继续旧目标、不重放未确认的操作，不把此前的确认或权限当作本次新目标的授权。任务类型切换时按本次要求重新核对。';
