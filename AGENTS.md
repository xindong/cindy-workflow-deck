# 极心许愿：安装与开发入口

## 用户贴仓库链接并要求安装时

按 INSTALL.md 获取最新正式GitHub Release（非draft、非prerelease），记录精确tag，从同一Release下载版本化.cindy、DISTRIBUTION.json和SHA256SUMS.txt，校验后使用系统正常打开并核对最终Host安装回执。本仓公开附件无需GitHub授权；不能用main源码版本代替已发布版本，当前文件树不再提供安装包，不需要为安装者重新开发或发布。开发者可运行 python3 scripts/install_local.py --dir 下载目录 --check，明确要求安装才用--open；普通用户无需额外依赖。不得跳过Host确认、注入安装目录或自动重试取消的安装；打开包不等于安装成功。

## 开发约定

这个仓库只开发 Cindy 插件，不修改编辑器 Core。需求正本为 xindong/xdrpg#190。

- 写插件前读取当前宿主 `ghost_forge_guide`，以实时作者契约和源码事实为准。
- 保留五个工作流及用户已确认的「每次点击新建独立任务」语义。
- 不捆绑、改写或伪造目标项目的 `_S/*.md`、`_E/merge.md`、`xd-pr-review`。
- 任务权限、模型、项目目录由 Host 管理；无业务需要不增加插件能力。
- 不自动重试不确定的派发；显式恢复沿用持久 requestKey。
- 界面只用 Host 注入白名单主题变量，同时支持明暗；语言只取 `/app-context`。
- 提交前执行 `npm test` 和 `npm run check`，修改插件后再用 Forge 校验打包。
- 提交时保留真实作者信息；不要提交凭证、缓存、用户数据。所有.cindy、分发元数据和校验文件均不入库，仅作为Release附件或被忽略的本地产物；禁止通过强制add恢复根包。不重写历史Git提交。
- 不自动安装、更新、发布插件，不自动执行真实 PR 或分支清理来测试。

## 硬性版本规则

1. 日常修改提交：自动 +0.0.1，例如0.1.1→0.1.2，包括文档、测试与CI修改。
2. 大版本升级：明确选择时 +0.1.0，补丁位归零，例如0.1.2→0.2.0。这里“大版本”指minor升级，不是major加1；同一提交只执行这一种升级，不再额外加patch。

以上取代此前“不改版本”的约定。package.json、plugin/ghost.json和README标题同步；提交阶段不构建/提交安装包。不能只改文档版本，也不能在打tag时才补版本。

本地先运行 python3 scripts/install_hooks.py（或 npm run prepare）安装本仓pre-commit；正常暂存后git commit即自动处理。版本文件/README若有未暂存修改，先明确暂存或收起，避免意外纳入提交。其它插件文件支持部分暂存，不把未暂存源码纳入提交。

GitHub网页/API不运行本地hook：通过插件push_files上传时，必须上传本地hook生成的完整提交（含所有源码版本文件，不含安装包），不重复再升一次。main每次push还有云端兜底，按每条修改提交递增并自动修复遗漏；自动修复提交只落地这些已计算的版本，不作为新开发修改再次递增。空提交不升版；重跑CI不重复升版。不要移动已发布tag，只有用户要求发布时才新建与当前版本匹配的tag。

需要大版本升级时，先暂存修改，再运行 python3 scripts/bump_version.py --minor，最后正常git commit。该命令暂存 VERSION_BUMP.json（base为父提交版本，level为minor）并同步源码版本；hook重复执行不叠加升级。意图文件保留为历史记录，仅在本次提交修改它且base匹配父提交时生效，下一次普通提交恢复patch递增。云端也读取同一意图，不会将大版本改回patch；失效或格式错误的升级意图会拒绝提交/同步。只有用户明确选择大版本时才使用此入口，不据此自动升级当前minor或自动发布Release。

## Release 专属分发

.cindy、DISTRIBUTION.json与SHA256SUMS.txt只由Release流程从对应tag构建上传，main CI仅升版/测试/源码回提交。普通提交不意味着可下载的新版本；安装只取最新正式Release，不访问已删除的根包URL。构建器本地默认输出release-assets/，--out可指定新产物目录，--check仅检查本地产物；校验器用--dir指向同一Release的三附件。不为本次分发方案变更移动既有tag或重写已有Release。
