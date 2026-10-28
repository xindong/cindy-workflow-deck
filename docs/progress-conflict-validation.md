# 上传进度与冲突引导验收

- 自动测试：183 项通过，包含真实 Git 慢上传期间的 journal 读取、无私密字段泄漏、请求编号隔离和 AI 派发防重复。
- 仓库检查：npm run check；manifest 引用、CSP、共享 JS/CJS 语法与仓库规范通过。
- tests/update-progress-ui-check.mjs：真实 Mac Electron IPC、真实 Git/bare 远端与慢 pre-push hook；上传阶段可观察，表单收起，完成标注等待团队审核。外部送审用假 gh，不创建真实 PR。插件使用真实 worker 验证 320/860 明暗、进度读取失败不重放、失败停止及恢复。
- tests/conflict-ui-check.mjs：真实远端改动与本地同文件修改触发隔离预检冲突（实际工作树无 U）；选择框取消零派发、目录准确、补充说明传递；点击继续只读检查，再次确认仍有冲突会停止；夹具模拟用户批准的修复并保留原字节备份，重新预检后更新完成。AI errand/query 用明确模拟，不代表实装模型已经执行修复。
- tests/recovery-ui-check.mjs：真实 worker 重启、规则变更、回执丢失、获取失败恢复、未知 restore、锁和未完成 merge 的拦截保持通过。
- tests/beginner-ui-check.mjs：共享独立桌面与模拟 Host 基础 Git、可选关联事项、320/860 明暗及英文回归通过。
- 界面截图位于忽略目录 artifacts/update-progress 与 artifacts/conflict-guidance；经视觉检查，步骤、快捷键、关联事项默认折叠，窄屏无横向溢出。

边界：未修改 Cindy 源码，未安装插件，未调用付费 AI 修复，未发布新 Release。独立应用尚无 AI 修复连接，提示人工处理后检查。AI 回复结束不等于 Git 更新完成；新预检及确认仍为必要步骤，未知写入与派发不自动重试。
