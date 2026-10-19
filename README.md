# 极心许愿 — 0.1.2

本地自用版显示名称为“极心许愿”，插件 ID 和命令为 jixin-make-a-wish；不提交组织市场。更换 ID 属于新插件身份，旧 workflow-deck 的数据和绑定不会自动迁移，需要重新绑定。源码仓库名称保持不变。

任务单：https://github.com/xindong/xdrpg/issues/190。仅开发插件，不修改 Cindy Core。

新身份代码已通过自动验证；此前0.3.6首次安装返回 MUTATION_CANCELLED，本版本尚未安装，不自动重试。旧身份0.3.5的实机结论不代表本版已实机验收。

## 贴仓库链接安装

在 Cindy 聊天中发送：

> 请安装 https://github.com/xindong/cindy-workflow-deck 的极心许愿插件，按 INSTALL.md 下载、校验并打开根目录 .cindy，核对最终安装结果。

仓库已直接提供 [安装包 jixin-make-a-wish.cindy](jixin-make-a-wish.cindy) 和 [安装步骤 INSTALL.md](INSTALL.md)。当前版本见本页标题及 DISTRIBUTION.json。根目录 DISTRIBUTION.json 提供整包及18个文件的SHA256；这是本仓校验格式，不是Cindy官方自动发现协议。仓库已公开，安装包和校验文件可匿名下载，无需 GitHub 授权；Cindy 首次安装权限确认仍由用户操作。

日常修改提交自动递增补丁版本；显式大版本升级递增minor并重置patch，同时同步安装包和校验文件。开发时使用 npm run dist 或 npm run dist:check 检查分发内容；版本规则见下文。详见 INSTALL.md。

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

## 开发与验证

plugin/ 是生产打包目录，无第三方运行依赖。Node 22+ 运行 npm test 和 npm run check；浏览器检查见 tests/browser-check.mjs，需配置 PLAYWRIGHT_MODULE_PATH 与 PLAYWRIGHT_BROWSERS_PATH。

0.3.4修复工作流任务切换后整条按钮置灰的问题。47项单元测试及静态检查通过。当前0.3.4已安装并启用；用户真实点击、助手核对Host日志/任务回执及实机截图，绑定、连续实验→工具工作流和日志回传验收通过。第二任务结束后绑定保持，可用流程4/5；缺失的merge仍禁用。其它验收项见 docs/acceptance.md 和 docs/verification.md。

0.3.5已本地安装并启用，旧版原位替换。52项单测及静态检查通过；2026-10-19用户真实点击后核对Host日志与两项任务历史，绑定、连续实验→工具派发、目录继承与7条进度写回通过。面板视觉、帮助展开及其它业务流程不在本次实机日志验收范围；未发布到组织。详情见验证记录。

仅用户明确要求时安装、更新或发布。按用户要求，源码仓仅提交根目录固定分发包 jixin-make-a-wish.cindy；历史包、截图、缓存和用户数据仍不提交。

## Tag 自动发布 GitHub Release

推送版本 tag（推荐 v0.1.0，也支持 0.1.0）会触发 Release Cindy plugin 工作流。tag 去掉 v 后必须与 package.json 和 plugin/ghost.json 的版本一致，否则停止发布；带预发布后缀的版本会标记为 prerelease。

工作流检出 tag 对应源码，执行单元测试与静态检查，再独立构建安装包，不依赖 main 分支包是否已自动刷新。成功后创建 GitHub Release，自动生成发布说明，附上版本化 .cindy、DISTRIBUTION.json 和 SHA256SUMS.txt。安装时下载该 Release 同一版本的安装包与校验文件；元数据中的 file 指向版本化包名。现有仓库根目录直装入口保留。

先确保包含本工作流的提交已推送，再在相应提交打 tag 并推送，例如：

```sh
version=$(node -p "require('./package.json').version")
git tag "v$version"
git push origin "v$version"
```

仅创建本地 tag 不触发；必须推送到 GitHub。不修改现有 Release 或覆盖附件，同名 Release 已存在时工作流会失败；不要移动已发布的 tag。构建过程可在本地用 python3 scripts/prepare_release.py --tag 当前版本tag --out /tmp/jixin-release-test 验证（输出目录需不存在）。工作流使用仓库内置 GITHUB_TOKEN，无需额外设置凭证。

## 每次修改提交自动 +0.0.1（硬性规则）

日常修改（包括文档、测试、CI和插件）每条包含文件变化的开发提交都增加一个补丁版本：+0.0.1，例如0.1.1→0.1.2。大版本升级按+0.1.0、补丁归零，例如0.1.2→0.2.0；同一提交不再额外加patch。先运行 python3 scripts/install_hooks.py 或 npm run prepare 安装本仓hook，之后正常 git add / git commit 即自动完成；只修改本仓配置，不修改全局Git设置。

hook基于暂存区构建，同步 package.json、plugin/ghost.json、根安装包、DISTRIBUTION.json和本页标题。暂存区之外的插件改动不会混入安装包；版本/包/README存在未暂存改动时会阻止提交并提示处理。

GitHub网页/API跳过本地hook时，main的云端流程会按推送中的修改提交数补齐版本并回提交；本地hook已升版的提交不会重复增加。云端自动修复提交只落地此前开发提交应得的版本，不额外增加；空提交和CI重跑也不增加。修复尚未完成前不要打tag，应在云端检查成功、源码与包版本一致后发布。

GitHub插件上传已有本地提交时，必须同时上传该提交生成的全部版本文件和二进制包。未来提交不再遵循旧的“无需改版本”约定；已发布的v0.1.0保留不动，不会随新提交自动新增Release。

### 显式大版本升级（+0.1.0）

先暂存本次修改，再运行 python3 scripts/bump_version.py --minor，最后正常 git commit / git push。该命令会暂存 VERSION_BUMP.json 升级意图并同步包；提交hook和云端识别同一意图，重复运行不重复升级。下一次普通修改自动恢复+0.0.1。意图base必须匹配父提交版本，错误意图会报错；无需删除历史意图文件。只有明确要升级大版本时使用此命令，普通提交保持默认patch。tag与Release仍按需发布，不自动创建。
