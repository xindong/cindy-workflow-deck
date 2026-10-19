# 工作流快捷面板使用说明 / Workflow Deck usage

## 准备项目

项目自行提供非空、可读普通文件：实验用 _S/experiment.md，功能用 _S/feature.md，工具用 _S/tooling.md，合并用 _E/merge.md。PR 需 xd-pr-review/SKILL.md。插件检查项目 .agents/skills、.claude/skills、.cindy/skills，以及用户 .agents/skills、.claude/skills、.codex/skills 中的该技能。未确认仅代表这些路径没有可用文件，不代表所有宿主技能不存在。符号链接不作为可用流程。缺少哪项只禁用对应按钮；插件不捆绑、创建或执行流程正文，流程由新任务的 AI 读取。

## 绑定与启动

在本地项目聊天发送 $workflow-deck，点击新的“绑定工具栏”卡片。绑定只检查，不启动任务。面板“目标与目录”可补充下一次工作目标。每次点击新建独立任务，不复制聊天历史；Host 从来源聊天继承目录、Agent 和模型，权限仍由 Host 管理，不保证继承完全访问。只读聊天和远程工作目录不启动流程。

发起间隔至少10秒；切到本插件确认创建的任务保留原来源绑定，陌生聊天先禁用。更新、停用重启插件或重启 Cindy 后，回到目标聊天取得新卡重绑。目录变化、来源归档或关联权限失效也可能要求重绑。检查失败可刷新；重复点旧卡不会重复派发。

## 日志与恢复

AI 使用 report_progress 回报实际步骤、输出摘要、阻塞或完成；不是全部终端 stdout。Cindy 旁听事件仅是运行元数据；AI 报告完成与 Host 本轮结束分别展示，都不能替代业务验收。可选择任务查看保留的日志尾部；容量有限，旧日志会淘汰。无回报时等待或查看任务聊天，不假称完成。派发回执不确定时先检查任务列表，不连续重试，以免重复创建任务。

缺少必要接口或宿主明确不支持时提示升级 Cindy；权限拒绝需检查插件授权和关联，网络、磁盘错误需按原错误处理，不能用其它通道绕过。面板的分离窗口、最小化和恢复由 Cindy 标题栏提供。Node 进程有当前系统账号权限，检查逻辑只读固定流程路径，不是操作系统级沙箱。

## English quick start

Provide the project workflow files and PR skill listed above; missing files disable only their own actions. Send $workflow-deck in a local project chat, click a fresh binding card, then choose an action. Each click creates an independent task using Host-managed source directory, Agent, model and permissions, without copying chat history. Wait at least 10 seconds between launches. Plugin-created tasks keep the original source binding; unrelated chats do not. Rebind after plugin/Cindy restarts or updates. Remote workspaces and read-only sources cannot launch workflows.

Progress is explicitly reported by AI through report_progress, not a mirror of full terminal output. AI completion and Host turn end are separate. Logs retain a bounded tail. If a receipt is uncertain, check the task list before clicking again. Upgrade Cindy for a missing or explicitly unsupported interface; permission denial and network/storage failures require their own remedies. The Node worker has system-account privileges; its fixed-path read checks are not an OS sandbox.
