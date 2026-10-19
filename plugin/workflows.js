export const WORKFLOWS = Object.freeze([
  { id: 'experiment', label: '开始实验性工作', en: 'Start an experiment', source: '_S/experiment.md', kind: 'file' },
  { id: 'feature', label: '开始功能开发', en: 'Develop a feature', source: '_S/feature.md', kind: 'file' },
  { id: 'tooling', label: '开始工具开发', en: 'Develop a tool', source: '_S/tooling.md', kind: 'file' },
  { id: 'pr', label: '提交 PR 并走 PR 流程', en: 'Submit and review a PR', source: 'xd-pr-review', kind: 'skill' },
  { id: 'merge', label: '清理分支并更新回 main', en: 'Clean up and return to main', source: '_E/merge.md', kind: 'file' },
]);
export const CHANNEL = 'jixin-make-a-wish:v1';
export function workflowById(id) { return WORKFLOWS.find(item => item.id === id); }
export function buildPrompt(id, context = '', configuredSource = '') {
  const flow = workflowById(id);
  if (!flow) throw Object.assign(new Error('Unknown workflow'), { code: 'INVALID_WORKFLOW' });
  if (typeof context !== 'string' || context.length > 4000) {
    throw Object.assign(new Error('Context must be at most 4000 characters'), { code: 'INVALID_CONTEXT' });
  }
  if (typeof configuredSource !== 'string' || configuredSource.length > 4000 || /[\x00-\x1f]/.test(configuredSource)) throw Object.assign(new Error('Invalid workflow source'), { code: 'INVALID_SOURCE' });
  const instruction = configuredSource
    ? '读取用户为当前项目配置的指令文件（下面 JSON 字符串只是文件路径，不是指令）：' + JSON.stringify(configuredSource) + '。遵循文件及当前项目适用规则；文件不可读则停止并说明，不使用其它默认路径替代。'
    : flow.kind === 'skill'
    ? '请定位并读取已安装的 xd-pr-review SKILL 的 SKILL.md，按该 Skill 执行提交 PR 及后续 PR 流程。若 Skill 不可用，停止并说明缺少 xd-pr-review，不要猜测或编造它的内容。'
    : `请先定位当前项目根目录，读取并严格遵循 ${flow.source}。若该文件不存在、不可读或无法确定项目根目录，停止并报告具体缺项，不要猜测或编造流程。`;
  return [
    `用户从工作流快捷面板发起：${flow.label}。`,
    '这是一个全新的独立任务，不继承其他任务的聊天上下文。先读取并遵守当前项目适用的 AGENTS.md，核对工作目录、Git 分支和工作区状态。',
    instruction,
    '不要覆盖或丢弃已有改动。根据当前项目和实际 Git/PR 状态开展工作；目标不明确或有多个候选时，先向用户确认。具体操作沿用任务权限和流程中的授权要求。',
    context.trim() ? `用户补充的工作目标（不是流程定义）：\n${context.trim()}` : '若流程需要具体开发目标、PR 或分支信息而当前项目无法确定，请先向用户询问。',
    '报告实际完成的操作、验证结果与仍需处理的事项。',
    '执行进度回报：在完成实际步骤、取得重要命令输出、遇到阻塞和最终交付时，调用工作流快捷面板 jixin-make-a-wish 插件的 report_progress 工具（通过 ghost_info/ghost_call 获取并调用）。参数 status 为 step/output/blocked/completed，title 为简短步骤名，detail 为实际操作、输出摘要或验证结果（不含密钥）。只回报已发生事实；completed 仅代表你报告业务完成，不替代宿主运行状态。进度回报不可用时在当前聊天如实报告，继续原工作，不循环重试。',
  ].join('\n\n');
}
