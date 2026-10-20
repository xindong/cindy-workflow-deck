# 极心许愿（jixin-make-a-wish）

# 工作流快捷面板使用说明 / Workflow Deck usage

## 准备项目

项目自行提供非空、可读普通文件：实验用 _S/experiment.md，功能用 _S/feature.md，工具用 _S/tooling.md，合并用 _E/merge.md。PR 需 xd-pr-review/SKILL.md。插件检查项目 .agents/skills、.claude/skills、.cindy/skills，以及用户 .agents/skills、.claude/skills、.codex/skills 中的该技能。未确认仅代表这些路径没有可用文件，不代表所有宿主技能不存在。符号链接不作为可用流程。缺少哪项只禁用对应按钮；插件不捆绑、创建或执行流程正文，流程由新任务的 AI 读取。

## 选择项目与启动

在插件配置中添加项目，点击“选择项目目录”亲选根目录并保存；面板自动发现指令并启用可用按钮。无需发送工具命令或点聊天卡，切换聊天也不改变项目。每次点击创建新的独立任务，使用唯一sessionKey，不复制聊天历史。模型与权限由Cindy插件任务设置管理。

直接目录派发使用Host的agent.errand能力，安装更新会展示新增权限。只允许一个此类任务运行，发起间隔至少10秒；面板运行中每5秒查询状态，完成后恢复按钮。回执不确定不会重发；先核对任务列表，再用“解除阻塞（不重发）”允许后续新任务。旧任务的未核实状态仍保留。

根目录须经宿主选择器亲选；手填路径或失效授权请重新选择。Host原生插件任务目录覆盖优先，须与当前项目一致；AI在操作前核对实际目录，不一致必须停止。配置不授予完全访问权限，不创建或执行项目脚本。旧聊天绑定卡仅兼容未配置项目，不是正常使用的前置条件。

## 日志与恢复

AI 使用 report_progress 回报实际步骤、输出摘要、阻塞或完成；不是全部终端 stdout。Cindy 旁听事件仅是运行元数据；AI 报告完成与 Host 本轮结束分别展示，都不能替代业务验收。可选择任务查看保留的日志尾部；容量有限，旧日志会淘汰。无回报时等待或查看任务聊天，不假称完成。派发回执不确定时先检查任务列表，不连续重试，以免重复创建任务。

缺少必要接口或宿主明确不支持时提示升级 Cindy；权限拒绝需检查插件授权和关联，网络、磁盘错误需按原错误处理，不能用其它通道绕过。面板的分离窗口、最小化和恢复由 Cindy 标题栏提供。Node 进程有当前系统账号权限，流程发现只读；基础Git写操作会运行项目hooks及过滤器，不是操作系统级沙箱。

## English quick start

Select the project root with Choose directory in plugin settings and save. Available workflow buttons activate automatically; no chat command or card binding is needed. Each click creates an independent task with a unique sessionKey. Model and permissions come from Cindy plugin task settings. Direct launch uses agent.errand, which is disclosed during installation. Only one workflow runs at a time, with at least 10 seconds between launches; the panel queries running jobs every five seconds. After checking an uncertain task in the task list, unlock explicitly without resending it. Keep any native task directory override consistent with the selected root; tasks must stop on a mismatch.

Progress is explicitly reported by AI through report_progress, not a mirror of full terminal output. AI completion and Host turn end are separate. Logs retain a bounded tail. If a receipt is uncertain, check the task list before clicking again. Upgrade Cindy for a missing or explicitly unsupported interface; permission denial and network/storage failures require their own remedies. The Node worker has system-account privileges; its fixed-path read checks are not an OS sandbox.

## 项目根目录配置 / Project root settings

只需在插件详情配置页添加并选择项目根目录，名称自动生成，保存后点击检查。五类工作流指令自动寻找，不要求逐项填写。优先_S/experiment.md、_S/feature.md、_S/tooling.md、_E/merge.md或_E/merged.md和项目内xd-pr-review/SKILL.md；未找到时在项目内有限查找对应名称。PR技能多个副本内容完全相同时固定顺序选一份，内容不同仍禁用；每份内容比较上限1MB。其它多候选、搜索未完成、不可读或缺失时禁用对应入口并显示原因。自动发现只读，不执行文件、不查全盘；旧手动配置在本页保存后切换为自动发现。保存后直接从面板派发，不依赖聊天；Host仍负责目录授权和任务设置。

Choose only a project root in plugin settings, save and inspect. Names are derived automatically. Workflow instructions are discovered inside that project; missing, ambiguous or incomplete discovery disables only the affected workflow. Discovery is read-only and never executes files. Saving switches legacy manual configurations to automatic discovery. Launch directly from the panel using the selected root and Host authorization.


## 基础Git / Basic Git

基础界面支持状态、差异、历史、分支、勾选文件暂存/取消暂存、提交、获取、快进拉取、推送与创建PR。main、master及本地已知origin默认分支禁止直接提交和推送，先建工作分支，再通过PR合入。保留原生hooks，不强推、不丢弃改动。项目规则与hooks未就绪时阻塞；文档测试和审批仍须实际完成并人工确认，不能把发现文件当作自动通过。PR依赖本机已安装并登录的gh，不自动合并。

Basic Git uses the saved repository root and preserves native project hooks. Primary-branch commits/pushes are blocked; create a work branch and use a PR. Manual tests and approvals must be completed before confirmation. A stale or consumed review cannot be replayed. AI diagnostics and standalone advanced workflows are not available yet.
