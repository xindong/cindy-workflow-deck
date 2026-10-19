# 极心许愿 — 0.1.5

极心许愿是 Cindy 工作流快捷面板插件，ID 和命令为 jixin-make-a-wish。本仓库只维护插件，不修改 Cindy Core；不提交组织市场。旧 workflow-deck 的绑定和日志不会自动迁移。

## 下一阶段目标（尚未实现）

已确认扩展为独立桌面应用＋Cindy插件：基础界面提供Git，高级界面保留工作流；显式绑定项目与脚本，操作遵循目标项目规则，增加支持本机工具及模型API的AI问题诊断。目标与验收见[产品目标](docs/product-goals.md)。下方说明仍对应当前已实现插件。

## 从正式 Release 安装

在 Cindy 聊天发送：

> 请安装 https://github.com/xindong/cindy-workflow-deck 的极心许愿插件，按 INSTALL.md 从最新正式 GitHub Release 下载、校验并打开 .cindy，再核对最终安装结果。

[最新正式 Release / 下载附件](https://github.com/xindong/cindy-workflow-deck/releases/latest) · [完整安装说明](INSTALL.md)

仓库当前文件树不再保存 .cindy 或分发元数据。安装包只放在 Release 的 Assets 中；普通源码提交只升版本，不产生新的可下载版本。正式发布可能落后于本页源码版本，应以选定 Release 的 tag、包内 manifest 和同一 Release 的 DISTRIBUTION.json 为准。GitHub 自动附带的 Source code ZIP/TAR 是源码，不是安装包。

每个 Release 提供版本化 .cindy、DISTRIBUTION.json 和 SHA256SUMS.txt。公开附件可匿名下载，无需 GitHub 授权；Cindy 首次安装确认仍由用户操作，打开包不代表已安装。元数据和校验和属于本仓格式，不是官方发现协议、签名或静默安装授权。

## 使用

1. 在 Cindy 打开“工作流”面板。上方是执行记录区，底部是五个工作流按钮组成的横向胶囊工具栏。宿主标题栏提供独立窗口和最小化。
2. 在目标本地项目聊天发送 $jixin-make-a-wish，点击新卡片的“绑定工具栏”。绑定只检查文件，不创建任务、不执行流程。
3. 工具栏显示已绑定项目；悬停或聚焦按钮可看动作、来源及禁用原因。检查失败时显示错误码，点击刷新重查。
4. 点击可用按钮新建独立任务，Host 从绑定聊天继承目录、Agent 和模型，不复制聊天历史。详情面板可填写补充目标。
5. 新任务通过 report_progress 主动回报实际步骤、输出摘要、阻塞及最终结果。Cindy 的 turn/activity 事件单独标为宿主状态，AI 报告完成不等于宿主确认业务完成。

面板“目标与目录”中展开“使用说明”可读中英文使用提示；完整说明随包保存在 plugin/USAGE.md。0.3.5对缺失的Node/Agent接口和明确不支持响应提供升级提示，拒绝派发，不误报文件缺失或回执丢失；权限、网络与磁盘错误分别处理。旧任务记录能力保留，本次未新增权限、未改工作流语义。

未收到回报时显示等待，不能自动镜像全部终端输出，也不会回填旧任务正文。可切换任务查看已保存的日志尾部。

切到本插件经 Host 确认创建的工作流任务时，保留原聊天的绑定；10秒冷却后可继续点击其它按钮，新任务仍由最初绑定聊天派发。切到其它未绑定聊天先禁用，不扫描事件中未经绑定的目录。已绑定聊天可恢复；目录变化、插件重启或关联权限失效后需使用新的绑定卡。重复点已使用卡不会重复绑定或派发。

## 流程检查

只读检查四个非空、可读普通文件：_S/experiment.md、_S/feature.md、_S/tooling.md、_E/merge.md。缺失、空文件、链接或不可读时只禁用对应按钮；检查失败不冒充文件不存在。不执行、捆绑或伪造流程正文。

PR 检查 xd-pr-review/SKILL.md，范围是项目的 .agents/skills、.claude/skills、.cindy/skills，以及用户目录的 .agents/skills、.claude/skills、.codex/skills。未确认仅表示这些路径未找到，不代表所有 Host 或远程技能都不存在。远程目录、只读目录和未经核验来源不启用派发。

## 布局与可靠性

底部横向胶囊，上方为可滚动时间线；明暗主题跟随 Host。停靠最小宽度280px，初始占比25%；Host 可能保留已有列宽。独立窗口仍受 Host 最小320×400限制。

Node worker 具有系统账号权限，不能称为操作系统级只读沙箱。实现只检查明确路径，不起 shell、不执行项目脚本、不遍历磁盘。专用 worker-entry.cjs 显式启动 stdio，兼容 Host 通过 require 加载。

每次点击新建任务；后台能力仅用于用户点击派发，没有自动或定时执行。请求和回执在派发前持久化，回执不确定不自动重发，派发间隔至少10秒。KV 串行合并；日志按调用id去重并限制尾部容量，不淘汰未核实派发记录。report_progress 只接受 Host 注入的、属于本插件受理任务的会话上下文。

## 开发与版本规则

Node 22+ 与 Python 3.9+，无插件运行依赖。先运行 python3 scripts/install_hooks.py 或 npm run prepare，安装本仓提交hook；不覆盖已有自定义hook或改全局Git配置。

1. 日常修改提交（含文档、CI、测试）：自动+0.0.1，例如0.1.2→0.1.3。
2. 用户明确选择大版本升级：+0.1.0，补丁位归零，例如0.1.3→0.2.0。同一提交不再额外加patch。

普通 git add / git commit 自动同步 package.json、plugin/ghost.json 和本页标题，不构建安装包。大版本升级先暂存修改，再运行 python3 scripts/bump_version.py --minor，最后提交；VERSION_BUMP.json 仅在本次更改且base匹配父提交时生效，下一次普通提交恢复patch。

main的版本流程为网页/API漏升版兜底，按每条修改提交补齐；已升版提交、同步bot提交和CI重跑不重复增加，空提交不增加。上传API提交必须包含本地hook生成的完整源码版本文件。版本文件/README有未暂存修改时hook会阻止覆盖；.cindy 即使用 git add -f 也会被提交hook和云端检查拦截。

验证命令：npm test、npm run check、npm run test:release。发布与版本测试使用真实临时Git仓库及临时产物目录，不执行安装。需要本地预检安装包时使用 npm run dist（写入被忽略的 release-assets/，目录需不存在），再用 npm run dist:check；也可指定 python3 scripts/build_distribution.py --out /tmp/新的产物目录。产物不入库。首次更换ID后的真实安装状态见 docs/acceptance.md；历史实机结论不能直接代替当前新身份验收。

## Tag 自动发布 Release

推送版本tag（v0.1.3或0.1.3这样的格式）触发 Release Cindy plugin。tag去v后必须匹配 package.json 与 plugin/ghost.json；workflow检出tag源码，跑测试与静态检查，再构建、校验并创建Release，上传三附件，自动生成发布说明。带预发布后缀标记prerelease，普通安装取最新正式非draft、非prerelease版本。

先确认main版本CI成功，再在含发布workflow的提交上打tag并推送，例如：

	version=$(node -p "require('./package.json').version")
	git tag "v$version"
	git push origin "v$version"

仅本地tag不触发。workflow使用内置GITHUB_TOKEN，无需额外密钥；不覆盖已有Release，不移动已发布tag。后续源码提交不会重写旧Release。历史Git提交中原有二进制包不重写删除，本次仅从当前文件树移除。

## 自动规范检查

显示名、插件ID和实际GitHub仓库在 repository-policy.json 定义。提交hook与CI共用规范校验器，拦截名称大小写/版本/安装链接不一致、分发包或缓存误入库、路径大小写冲突等问题。运行 npm run check 检查；PR与main push均运行只读 Repository checks，Release从同一配置生成标题并校验目标仓库。源码版本与已发布版本分别核对，不要求普通提交立即发布。完整规则见 AGENTS.md；检查反例包含在 npm run test:release 中。

## 双形态第一阶段

已实现Cindy插件配置页与独立Electron配置窗口，共用项目/流程文件模型。支持多项目、相对路径、显式外部文件、留空禁用、保存重载与并发冲突保护；独立端额外提供只读Git状态。完整运行方式、权限边界与当前未实现项见[双形态使用说明](docs/dual-runtime.md)。Git写入、独立高级任务与AI诊断仍待后续阶段实现。
