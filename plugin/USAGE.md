# 极心许愿（jixin-make-a-wish）

# 工作流快捷面板使用说明 / Workflow Deck usage

## 准备项目

项目自行提供非空、可读普通文件：实验用 _S/experiment.md，功能用 _S/feature.md，工具用 _S/tooling.md，合并用 _E/merge.md。PR 需 xd-pr-review/SKILL.md。插件检查项目 .agents/skills、.claude/skills、.cindy/skills，以及用户 .agents/skills、.claude/skills、.codex/skills 中的该技能。未确认仅代表这些路径没有可用文件，不代表所有宿主技能不存在。符号链接不作为可用流程。缺少哪项只禁用对应按钮；插件不捆绑、创建或执行流程正文，流程由处理任务中的 AI 读取。

## 选择项目与启动

在插件配置中添加项目，点击“选择项目目录”亲选根目录并保存；面板自动发现指令并启用可用按钮。无需发送工具命令或点聊天卡，切换聊天也不改变项目。同一执行项目首次建立一个“极心许愿 · 项目处理”任务，后续冲突处理、UE 更新和高级工作流复用它；不同执行目录分开。每次请求重新核对实际状态，不重做旧操作。模型与权限由Cindy插件任务设置管理。

直接目录派发使用Host的agent.errand能力，安装更新会展示新增权限。只允许一个此类任务运行，发起间隔至少10秒；面板运行中每5秒查询状态，完成后恢复按钮。回执不确定不会重发；先核对任务列表，再用“解除阻塞（不重发）”允许后续新请求。旧任务的未核实状态仍保留。

根目录须经宿主选择器亲选；手填路径或失效授权请重新选择。Host原生插件任务目录覆盖优先，须与当前项目一致；AI在操作前核对实际目录，不一致必须停止。配置不授予完全访问权限，不创建或执行项目脚本。旧聊天绑定卡仅兼容未配置项目，不是正常使用的前置条件。

## 分支与 Stash 暂存记录

项目名旁显示当前执行项目的分支；游离状态显示提交号。“重新检查”及 Git 操作后的刷新同步分支。“查看暂存记录”列出最近100条 Stash，选择记录后显示文件、修改类型及保存来源（工作区、暂存区、未跟踪）。对比使用记录最终工作区版本，可与当前本地工作区或服务器最新版本逐文件对比。线上目标优先当前分支的 origin 跟踪分支，其次服务器同名分支，最后服务器默认分支；每次联网获取，显示目标分支、提交号及时间，失败不以旧缓存代替。查看不应用或删除记录，不改工作区、暂存区或当前分支；线上对比会更新远端缓存。结果在当前界面显示，不新增任务或窗口。二进制、Git LFS 或超过1 MiB的文件仅显示摘要（LFS可显示指针元数据，不下载资源）；链接、目录、子模块及超过2000个文件的记录请用项目专业工具查看。

选中 Stash 后可点“取回整条记录到本地…”：隔离副本预检通过后，确认全部文件及项目要求，再备份并取回保存的工作区和暂存状态。已有文件或暂存内容不能安全合并时停止，原项目不变；不切分支、不提交上传，原记录保留。预检会写临时文件及 Git 快照对象，但不改变原工作区、索引或 stash 引用。实际取回中断或回执不确定时先检查，核对文件、暂存区、备份且完成 Git 冲突处理后，显式确认解除限制，不重放旧请求。

## Stash 冲突协助与未推送状态

取回发生冲突时，可点“协助解决冲突并取回…”，在同一项目任务里按准确的 Stash 标识处理。文本优先合并，二进制和语义取舍先询问；任务需完整取回所有记录文件并核对原有修改及暂存状态，保留原 Stash。完成后点“检查取回处理结果”并核对确认，不要再次整条取回来重放 apply。AI 结束不等于取回完成，人工确认后才解除 AI 处理保护；实际取回恢复卡仍待核对时再完成其确认。独立应用请负责人协助。

项目状态还显示“已提交、未推送”的数量，点击可查看提交清单。依据本机上次获取的远端记录；需要最新状态请先获取远端再检查，不自动推送。即使没有待提交文件，本地尚未推送的提交也会单独提示；缺少有效远端记录则显示待核对。

## 日志与恢复

AI 使用 report_progress 回报实际步骤、输出摘要、阻塞或完成；不是全部终端 stdout。Cindy 旁听事件仅是运行元数据；AI 报告完成与 Host 本轮结束分别展示，都不能替代业务验收。可选择任务查看保留的日志尾部；容量有限，旧日志会淘汰。无回报时等待或查看任务聊天，不假称完成。派发回执不确定时先检查任务列表，不连续重试，以免重复创建任务。

缺少必要接口或宿主明确不支持时提示升级 Cindy；权限拒绝需检查插件授权和关联，网络、磁盘错误需按原错误处理，不能用其它通道绕过。面板的分离窗口、最小化和恢复由 Cindy 标题栏提供。Node 进程有当前系统账号权限，流程发现只读；基础Git写操作会运行项目hooks及过滤器，不是操作系统级沙箱。

## English quick start

For stash conflicts, Resolve conflicts and restore sends the verified fixed stash id to the same project task. AI must back up, ask about choices, merge text and complete the entire stash restore, including untracked files and index state. Checking never reapplies the stash; user verification is required before releasing the repair reservation. Standalone AI repair remains unavailable. Committed, not pushed shows cached outgoing counts and a clickable commit list even when the worktree is clean; it never implies a live server check or pushes automatically.

The project heading shows the current branch (or detached commit). View stashes lists saved entries and their files, with in-app comparisons against the current working tree or freshly fetched origin upstream/same-name/default branch. Viewing and comparing leave local files and the index unchanged; online comparison updates remote caches. Binary, LFS and files over 1 MiB show summaries; LFS assets are not downloaded. Select a stash to preflight restoring it in an isolated copy, then review its file list and confirm. Local files and the index are backed up before applying the whole stash with its staged state. The original stash is kept; no branch switch, commit or push. Conflicts stop preflight without altering the source project. Uncertain actual restores require checking and explicit recovery acknowledgement and never replay automatically. No task or preview window is created.

Select the project root with Choose directory in plugin settings and save. Available workflow buttons activate automatically; no chat command or card binding is needed. Actions for the same execution directory reuse one project task with a stable sessionKey. Each operation has its own request id; history is reference only and old operations are never replayed. Model and permissions come from Cindy plugin task settings. Direct launch uses agent.errand, which is disclosed during installation. Only one workflow runs at a time, with at least 10 seconds between launches; the panel queries running jobs every five seconds. After checking an uncertain task in the task list, unlock explicitly without resending it. Keep any native task directory override consistent with the selected root; tasks must stop on a mismatch.

Progress is explicitly reported by AI through report_progress, not a mirror of full terminal output. AI completion and Host turn end are separate. Logs retain a bounded tail. If a receipt is uncertain, check the task list before clicking again. Upgrade Cindy for a missing or explicitly unsupported interface; permission denial and network/storage failures require their own remedies. The Node worker has system-account privileges; its fixed-path read checks are not an OS sandbox.

## 项目根目录配置 / Project root settings

只需在插件详情配置页添加并选择项目根目录，名称自动生成，保存后点击检查。五类工作流指令自动寻找，不要求逐项填写。优先_S/experiment.md、_S/feature.md、_S/tooling.md、_E/merge.md或_E/merged.md和项目内xd-pr-review/SKILL.md；未找到时在项目内有限查找对应名称。PR技能多个副本内容完全相同时固定顺序选一份，内容不同仍禁用；每份内容比较上限1MB。其它多候选、搜索未完成、不可读或缺失时禁用对应入口并显示原因。自动发现只读，不执行文件、不查全盘；旧手动配置在本页保存后切换为自动发现。保存后直接从面板派发，不依赖聊天；Host仍负责目录授权和任务设置。

Choose only a project root in plugin settings, save and inspect. Names are derived automatically. Workflow instructions are discovered inside that project; missing, ambiguous or incomplete discovery disables only the affected workflow. Discovery is read-only and never executes files. Saving switches legacy manual configurations to automatic discovery. Launch directly from the panel using the selected root and Host authorization.


## 基础Git / Basic Git

基础界面只保留“更新项目、查看我的改动、提交我的修改”，先支持已有项目。提交只需勾选文件、写一句说明、核对团队要求后确认；内部自动建立工作分支、运行项目检查、上传并送审，不直接提交主分支、不自动合并。单个PR模板会创建待负责人完善的草稿，不替人勾选验收。异常或结果不明时保留文件并停止，先请负责人核对。专业Git工具与原五工作流保留在高级入口（桌面为折叠的更多工具）。

项目规则和hooks仍有效；文档中的测试、审批、资源锁定等必须实际完成，不用确认勾选代替执行。需要负责人预先配置好本机Git、团队远端和gh审核账号。没有AI也能使用日常Git；AI诊断和独立端高级工作流尚未实现。

Daily work supports existing projects: Update project, View my changes, and Submit my changes. Select files, describe the change, verify team prerequisites and confirm. A work branch, native checks, upload and review are handled internally; no primary-branch commit or automatic merge. A team PR template creates an unchecked draft for the project owner to complete. Uncertain results stop without replay. Professional Git tools remain in the advanced entry. Native hooks and actual manual prerequisites still apply; the owner must configure Git, the remote and an authenticated gh CLI first.

### 批量选择与关联Issue

文件清单提供全选、全不选与已选数量，单次最多200个。提交页点“加载我的事项”，从当前项目中“分配给我的 / 我创建的”开放GitHub Issue选择一项；显示当前仓库和实际gh登录账号，最多100项。关联会写入提交记录和PR描述，不自动关闭Issue。提交前重新核对事项状态和归属，失败不会开始本地提交。origin须指向GitHub.com；缺账号、网络或权限时提示负责人处理，不自动重试。

Select all / Select none affect only the file checkboxes. Load my issues reads up to 100 open issues assigned to or created by the current gh account in the origin GitHub.com repository. The selected issue is revalidated before local changes and referenced in the commit and PR body; it is not automatically closed.


## 自动补齐提交署名 / Git identity

选择目录后自动检查项目的有效 Git 姓名和邮箱；已有署名不覆盖。缺少时只对 origin 指向 GitHub.com 的项目读取本机 GitHub CLI 当前登录账号（须已有 gh 登录及网络连接），显示姓名、邮箱和来源，点击“一键补齐提交署名”只补缺失项并写入当前项目，不更改全局设置。姓名优先账号显示名，未公开显示名时使用登录名；邮箱使用 GitHub 的 ID+登录名免公开地址，不公开私人邮箱。写入前重新验证账号，账号变化需重新检测。无法读取时提示连接账号后重新检测，无需手填署名；不会自行安装 CLI、发起登录或借用项目历史作者。该功能两端共用，同样保留项目检查及提交规则。

After choosing a folder, missing Git identity can be filled in one click from the locally signed-in GitHub.com CLI account. Existing fields are preserved. Missing email uses the account's GitHub noreply address; writes are project-local only. The account is checked again before saving. If unavailable, connect GitHub CLI and check again; identity is never inferred from project authors.

更新会先在临时副本预检冲突，通过后保留本地修改（含原暂存状态与新增文件）、快进拉取并取回。冲突预检失败不改变原文件；取回异常保留安全备份并阻止重复执行。目录选择等待用户确认或取消，不再套用30秒请求超时。

## 单文件对比与还原 / File comparison and restore

查看改动与发布页：双击文件名或点“对比线上”，先获取 origin 最新版本，再在 Cindy 侧边栏显示只读差异。优先跟踪分支，无跟踪时使用并标明 origin 默认分支；独立桌面应用内显示。预览仅访问127.0.0.1本机随机令牌页面，15分钟到期。

“还原”需确认具体文件，恢复本机最近提交HEAD，包含该文件暂存修改；新增文件移除。执行前保存Git元数据内 jixin-file-backups 备份。冲突、改名、子模块、链接和超过1MB文件请用专业工具。未确认还原结果时停止新写入，负责人核对后处理，不能重复点击。

On both changes and submit pages, double-click a filename or choose Compare online to fetch origin and inspect a read-only diff in the Cindy sidebar. Tracking origin branch takes precedence; otherwise the remote default is explicitly labeled. Standalone desktop displays the diff in-app. The token-protected loopback preview expires after 15 minutes. Restore requires file confirmation, backs up the index and working content, and restores the local HEAD, not the online version. Added files are removed. Conflicts, renames, submodules, links and files larger than 1MB require professional tools. An uncertain restore stops further writes for manual verification and is never replayed automatically.

还原结果不确定时，可刷新并在页面点击“核对上次还原结果”；核对实际文件、暂存区与备份后显式确认，仅解锁后续新操作，不会重放旧操作。


## 项目信息较多或检查失败

项目规则原文未超读取上限，也可能因 JSON 转义超过宿主单行 1 MiB 限制。插件对较大的结果分块传输、完整还原，不截断规则或跳过检查；临时结果有容量与有效期限制。分块读取失败只报告未确认，不自动重新执行更新或提交。

界面优先说明原因与处理办法，例如无权限、项目目录选择错误、SSH 身份失效、缺少 Git LFS、网络中断、规则未完整读取及侧栏缺少普通任务对话。原始错误码和后台信息保留在展开的操作详情中。未知或写入结果不确定时，先重新检查实际状态，不直接重复提交。


## AI 诊断问题 / AI issue diagnosis

基础界面第四个图标打开诊断；可输入问题，也可从操作失败旁带入最近错误。先“检查并预览”，核对项目路径、错误、Git状态和有限规则摘要，再“确认发送，仅诊断”。常见密钥和URL账号会脱敏，请仍自行核对。诊断只返回原因、依据、处理建议和验证方法，不修复文件、不提交或重试失败操作。

Cindy版使用公开oneshot_text（新增cindy.text/oneshot能力，安装更新正常确认）。模型由插件详情所选模型或Host快速通道提供，结果显示回执中的实际型号。无可用模型或拒绝权限时明确提示；回执丢失先“检查诊断结果”，不会自动重复调用。独立应用暂未接入AI，仅展示同一份本地诊断信息，Git仍可用。

The fourth daily icon opens AI diagnosis. Describe the issue or bring the latest error, check the local preview, then confirm sending. The Cindy plugin uses a text-only oneshot call with no Agent tools; it returns analysis and suggestions without executing repairs. Review the redacted snapshot before sending. If no model is available, the UI says so. Check an uncertain result without automatically repeating inference. The standalone app currently supports only the local diagnostic preview; its AI adapter is not connected.
