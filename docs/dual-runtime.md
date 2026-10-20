# 双形态：项目配置、基础Git与工作流

## 目录选择后的本地准备

日常入口只需选择已有项目根目录，自动保存、自动准备，再返回底部日常图标栏。手动项目管理和详细检查默认折叠给负责人。读取或重开配置不进行准备写入。

自动准备仅支持已提交规则中独立一行的明确指令：git config core.hooksPath .githooks（可带--local或路径引号）。核对钩子已跟踪且可执行、正文无本地改动、路径非符号链接；无配置冲突时设置当前仓库core.hooksPath，保留原生提交检查。

不会执行项目安装器、hooks、包管理器或联网下载，也不补写规则或虚构账号身份。现有检查冲突、共享worktree或规则不能确认时保留状态并显示具体原因。更新和提交仍核对账号与本次修改的团队要求；本地准备完成不代表测试、审批、LFS或远端验证已通过。

项目写锁覆盖完整异步准备和提交流程。准备不会提交、暂存、切分支或上传文件，真实提交保留原生hook及主分支门禁。

当前已实现：同一份项目模型和页面分别接入Cindy设置与独立Electron桌面。用户只填写/选择项目根目录，项目名自动取目录名，不显示五项脚本路径、外部路径开关或文件选择按钮。支持多项目、保存重载、并发修订冲突保护。检查只读，不执行脚本或改写目标项目。

### 自动寻找工作流指令

优先检查_S/experiment.md、_S/feature.md、_S/tooling.md、_E/merge.md或_E/merged.md；PR检查项目内.agents/.claude/.cindy/.codex的skills/xd-pr-review/SKILL.md。PR多个候选逐字节比较（每份上限1MB），内容完全相同按.agents→.claude→.cindy→.codex固定顺序选择并记录副本；内容不同、无法读取或超限时禁用并展示来源，不使用全局技能冒充该项目配置。约定文件为空、不可读或是符号链接时直接报告，不静默退回其它文件。

缺少约定文件时，仅在选择的项目内查找同名experiment.md、feature.md、tooling.md、merge.md/merged.md及pr.md/pr-review.md，最多5层、3000个条目；跳过.git、node_modules、vendor、dist、build、desktop-builds、artifacts、coverage和虚拟环境，不跟随符号链接。只有唯一匹配才启用；未找到、多个候选、搜索未完成分别提示。每次检查重新发现，不缓存已失效的路径。这里只发现Markdown指令，不猜任意脚本名称，也不自动执行内容。

## 在Cindy里配置

安装包含本阶段改动的.cindy后，在插件详情配置区域添加项目→选择根目录→保存→检查已保存项目。发现的真实路径只读展示。旧手动路径配置继续兼容读取；新页面保存时明确切换为自动发现，不要求用户逐项迁移。配置保存到本插件/kv，经逻辑页串行合并，保留原日志和派发回执。

保存后面板使用当前配置项目，不再要求聊天命令或绑定卡。直接任务通过Host的agent.errand转述亲选根目录，并用每次点击唯一sessionKey创建独立任务。Host核验亲选台账，模型与权限仍由原生插件任务设置决定；原生目录覆盖优先，若不一致任务必须停止。该接口一次只允许一个任务运行；面板查询完成状态后恢复按钮，回执不明不重发。旧卡仅作为未配置项目的兼容入口。

目录选择使用pick；直接派发新增agent.errand能力（安装/更新确认可见）；安装或更新仍由用户明确授权，通过Host正常安装事务进行。配置页浏览器回归使用模拟Host，不等于新版已在真实Cindy完成安装交互验收。

## 独立桌面运行

完全不需要Cindy进程、登录或SDK。开发运行需要Node22+，从仓库运行：

    npm ci --ignore-scripts
    node node_modules/electron/install.js
    npm run desktop

忽略安装scripts是为了明确分开下载Electron与本仓hook安装；开发提交仍需单独运行python3 scripts/install_hooks.py。Electron版本和完整依赖已锁定。桌面窗口提供仅项目根目录的配置页面和系统目录选择器，两端共用同一自动发现逻辑。

配置保存在本应用系统userData目录中的projects.json，不写入项目，不与Cindy/kv自动同步。保存采用修订校验和原子替换；只支持单实例持久写入。本地只读检查额外显示实际Git根目录、分支、变更及项目根AGENTS.md/CONTRIBUTING.md的存在情况。规则发现不是完整嵌套规则解析或提交准入，界面明确标识；基础Git读写已接入共享服务，详见basic-git.md；AI调用与独立工作流执行尚未实现。

macOS和Windows开发机均可运行npm run desktop:package，生成忽略目录desktop-builds/中的平台包。macOS生成.app及ZIP；Windows x64生成便携ZIP，解压后打开“极心许愿.exe”，须保留同目录运行库和resources文件夹，不能单独复制exe。包含Electron运行时，不要求使用者安装Node或Cindy；Git检查需要本机已安装Git。macOS使用ad-hoc签名，未做Developer ID签名/公证；Windows尚未代码签名，不冒称系统已信任。

Desktop packages工作流在main推送或手动触发时构建Windows x64包，从交付ZIP重新解压后启动真实exe，检查版本、无Cindy依赖、renderer隔离、真实临时Git项目检查、配置保存/重载及路径穿越拒绝。仅通过后上传jixin-windows-x64 artifact，含ZIP与SHA256SUMS.txt；验收JSON与截图单独提供。Actions附件保留30天；这不是正式Release。正式分发仍需按用户授权打tag并走Release流程，不把CI成功等同于已在用户Windows电脑验收。

## 验证

- npm test：共享配置、真实文件检查、独立配置持久化与冲突、临时Git仓库只读状态、Cindy配置控制器、原绑定/连续任务及Host式Node worker。
- npm run test:release：版本/发布/规范门禁；package-lock随版本文件同步。
- npm run check：设置页CSP、manifest引用、共享与桌面代码语法及规范检查。
- 浏览器/桌面验收：设置PLAYWRIGHT_MODULE_PATH为已安装Playwright的index.mjs路径，PLAYWRIGHT_BROWSERS_PATH为浏览器缓存后，运行node tests/dual-ui-check.mjs。启动真实Electron并使用临时用户数据/项目，再以模拟Host验证Cindy配置页。安装依赖后也可不设置PLAYWRIGHT_MODULE_PATH，默认使用锁定的playwright-core；仅桌面验收设JIXIN_NATIVE_ONLY=1，并用JIXIN_DESKTOP_EXECUTABLE指向打包后的可执行文件。不会在真实用户项目执行Git写入或AI任务。

基础Git验收：node tests/git-ui-check.mjs，真实Electron临时仓库完成分支/暂存/提交、DCO，模拟Host验证基础/高级切换、Git RPC和320/860px明暗布局。未创建真实远端PR，未执行新版安装。
