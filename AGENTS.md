# 极心许愿：安装与开发入口

## 用户贴仓库链接并要求安装时

按 INSTALL.md 获取最新正式GitHub Release（非draft、非prerelease），记录精确tag，从同一Release下载版本化.cindy、DISTRIBUTION.json和SHA256SUMS.txt，校验后使用系统正常打开并核对最终Host安装回执。本仓公开附件无需GitHub授权；不能用main源码版本代替已发布版本，当前文件树不再提供安装包，不需要为安装者重新开发或发布。开发者可运行 python3 scripts/install_local.py --dir 下载目录 --check，明确要求安装才用--open；普通用户无需额外依赖。不得跳过Host确认、注入安装目录或自动重试取消的安装；打开包不等于安装成功。

## 开发约定

当前实现为Cindy插件；下一阶段目标见docs/product-goals.md：独立桌面应用＋Cindy插件，共享项目/Git/规则核心。允许扩展独立应用，不修改Cindy编辑器Core。原插件需求来源为xindong/xdrpg#190，新阶段以已确认产品目标为准。

- 写插件前读取当前宿主 `ghost_forge_guide`，以实时作者契约和源码事实为准。
- 保留五个工作流及用户已确认的「每次点击新建独立任务」语义。
- 不捆绑、改写或伪造目标项目的 `_S/*.md`、`_E/merge.md`、`xd-pr-review`。
- Cindy适配器的任务权限、模型、项目目录由Host管理；独立应用使用用户显式选择的项目与AI接入，不模拟Host授权。无业务需要不增加插件能力。
- 不自动重试不确定的派发；显式恢复沿用持久 requestKey。
- 界面只用 Host 注入白名单主题变量，同时支持明暗；语言只取 `/app-context`。
- 提交前执行 `npm test` 和 `npm run check`，修改插件后再用 Forge 校验打包。
- 提交时保留真实作者信息；不要提交凭证、缓存、用户数据。所有.cindy、分发元数据和校验文件均不入库，仅作为Release附件或被忽略的本地产物；禁止通过强制add恢复根包。不重写历史Git提交。
- 不自动安装、更新、发布插件，不自动执行真实 PR 或分支清理来测试。

## 硬性版本规则

1. 日常修改提交：自动 +0.0.1，例如0.1.1→0.1.2，包括文档、测试与CI修改。
2. 大版本升级：明确选择时 +0.1.0，补丁位归零，例如0.1.2→0.2.0。这里“大版本”指minor升级，不是major加1；同一提交只执行这一种升级，不再额外加patch。

以上取代此前“不改版本”的约定。package.json、plugin/ghost.json、package-lock.json和README标题同步；提交阶段不构建/提交安装包。不能只改文档版本，也不能在打tag时才补版本。

本地先运行 python3 scripts/install_hooks.py（或 npm run prepare）安装本仓pre-commit；正常暂存后git commit即自动处理。版本文件/README若有未暂存修改，先明确暂存或收起，避免意外纳入提交。其它插件文件支持部分暂存，不把未暂存源码纳入提交。

GitHub网页/API不运行本地hook：通过插件push_files上传时，必须上传本地hook生成的完整提交（含所有源码版本文件，不含安装包），不重复再升一次。main每次push还有云端兜底，按每条修改提交递增并自动修复遗漏；自动修复提交只落地这些已计算的版本，不作为新开发修改再次递增。空提交不升版；重跑CI不重复升版。不要移动已发布tag，只有用户要求发布时才新建与当前版本匹配的tag。

需要大版本升级时，先暂存修改，再运行 python3 scripts/bump_version.py --minor，最后正常git commit。该命令暂存 VERSION_BUMP.json（base为父提交版本，level为minor）并同步源码版本；hook重复执行不叠加升级。意图文件保留为历史记录，仅在本次提交修改它且base匹配父提交时生效，下一次普通提交恢复patch递增。云端也读取同一意图，不会将大版本改回patch；失效或格式错误的升级意图会拒绝提交/同步。只有用户明确选择大版本时才使用此入口，不据此自动升级当前minor或自动发布Release。

## Release 专属分发

.cindy、DISTRIBUTION.json与SHA256SUMS.txt只由Release流程从对应tag构建上传，main CI仅升版/测试/源码回提交。普通提交不意味着可下载的新版本；安装只取最新正式Release，不访问已删除的根包URL。构建器本地默认输出release-assets/，--out可指定新产物目录，--check仅检查本地产物；校验器用--dir指向同一Release的三附件。不为本次分发方案变更移动既有tag或重写已有Release。

## 规范门禁（本地与 CI 共用）

参考 tavern-of-convallaria 的单一事实来源、暂存区检查与完整树 CI 分层方式，仅采用本插件实际需要的规则。repository-policy.json 是显示名、插件 ID 与实际 GitHub owner/repo 的唯一规范入口；仓库名与插件 ID 是独立字段，改仓库名必须先完成 GitHub 改名，再同步该配置和安装链接，不能只替换文案冒称迁移完成。

scripts/check_repository.py 检查名称/大小写、manifest/package/locale/面板标题、README源码版本、README/INSTALL的实际仓库和最新正式Release链接；禁止跟踪分发包、元数据、缓存、.env、gitlink、符号链接及大小写冲突路径。明确历史记录不做全库链接替换。不扫描或联网获取用户项目、凭证或私有数据。

提交hook升版后，先在完整暂存区快照运行同一校验，失败不写回受管文件；npm run check 在 CI 校验整个跟踪树，pull_request 与 main push 均有只读 Repository checks，Release 构建前重复执行。发布标题从规范配置生成，并检查当前 GitHub 仓库身份与 tag/manifest版本；源码版本不要求等于最新正式Release，禁止为消除差异移动历史tag。npm run test:release 包含反例测试，新增规则必须证明错误输入会失败。

GitHub Required status checks 需仓库管理员另行配置；存在workflow本身不代表已禁止管理员直接推送或合并失败检查。建议将 Repository checks / checks 设为 main 的必需检查；本任务不擅自修改组织或分支保护策略。

## 新阶段产品约束

docs/product-goals.md是已确认目标，不是现有功能说明。基础界面提供Git，高级界面保留五工作流；项目与脚本显式绑定，聊天不是唯一入口。所有操作遵循目标项目适用规则与hooks，修复也走同一门禁；不把本仓版本规则强加其它项目。AI支持本机工具和用户配置API，无AI不影响基础Git。现有Host主题/语言限制仅适用于Cindy适配器，独立应用有自己的主题/语言入口。不得因目标扩展修改Host Core、擅自安装或发布。

双形态第一阶段现状见docs/dual-runtime.md。项目配置共享模型在plugin/core，Cindy设置经逻辑页串行合并/kv；独立桌面通过隔离preload与允许列表IPC访问应用服务，不能开放任意shell。独立端未实现写操作前不得用规则发现冒充提交门禁。新改动需跑共享/桌面服务测试，UI修改应运行真实Electron与模拟Host设置页验收；两者与真实Cindy安装验收分开记录。package-lock纳入版本同步，依赖固定版本；不得提交node_modules、artifacts或desktop-builds。

用户最新配置约束：两端只让用户选择项目根目录，名称自动派生、五工作流指令自动发现。不要恢复逐项路径输入、外部路径开关或文件选择配置。发现限制在当前项目、只读且有界；缺失/歧义/未完成不能随意选文件。保留旧手动配置兼容读取，新页面保存切换自动发现。


用户最新启动约束：项目在插件配置内选择并保存后，按钮应直接可用，不要求用户发送$工具或点击聊天绑定卡。不得再把聊天绑定作为正常入口。使用Host公开的agent.errand转述亲选目录（新增能力须在安装确认展示），每次点击唯一sessionKey创建独立任务；Host同一时间一单，等待状态必须可见并在完成后恢复。后台仅查询未完成job，不自动重发不确定请求；解除阻塞必须用户先核对且只允许后续新请求。模型/权限采用Host插件任务设置；原生显式目录覆盖优先须明确告知，不得把提示词目录当作实际cwd已验证或绕过Host目录授权。旧卡可兼容保留，但不得覆盖已选配置项目或因前台聊天切换禁用它。

用户最新基础界面约束：面向没有Git基础的美术，仅支持已有项目；主要操作是更新、查看改动、勾选文件并用一句话提交。分支/暂存/上传/PR由服务处理，专业工具保留高级入口，不重新暴露为默认流程。自动开分支也必须保留hooks和项目人工前提；单个PR模板只建未假勾验收的草稿，多模板不随意选。复合操作持久记录、防重放、跨运行时互斥，不确定结果交负责人核对。


宿主边界：仅修改插件和独立应用，禁止修改 Cindy 源码或依赖定制宿主接口。插件通过正式宿主公开契约运行。基础 Git 的业务错误保留准确错误码，确认前只读核对当前状态；只有规则与工作树指纹未变化时才续用新检查凭据，未知写入结果不得自动重放。已结束的更新获取或预检失败且未进入本地变更阶段可显式重新尝试；暂存、合并、取回及上传结果不确定时仍需人工核对。

用户明确指定版本对齐时（本次0.1.27），使用 python3 scripts/bump_version.py --align-version 目标版本，记录与父提交匹配的 VERSION_BUMP.json（level=align、version=目标版本）。目标必须高于父版本；正常hook和云端同步共同保留该版本，不跳过hook、不伪造提交。下一次普通修改仍+0.0.1。安装与正式Release的tag、源码manifest和分发元数据版本保持一致，不单独递增本机试装号；源码分支更新本身不代表已发布。
