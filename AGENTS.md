# 极心许愿：安装与开发入口

## 用户贴仓库链接并要求安装时

先按 INSTALL.md 获取根目录 jixin-make-a-wish.cindy 和 DISTRIBUTION.json。本仓库已公开，无需GitHub授权；从同一commit匿名下载、校验后，使用系统正常打开 .cindy，交给Cindy确认与安装；不需要重新开发或发布。完整克隆后可运行 python3 scripts/install_local.py --check，用户明确要求安装时才用 --open。没有Python时使用现有文件工具，不要求安装者额外安装开发依赖。优先匿名读取公开仓库，不索取Token。不得跳过Host确认、注入安装目录或自动重试取消的安装；打开包不等于安装成功，应核对最终回执。

## 开发约定

这个仓库只开发 Cindy 插件，不修改编辑器 Core。需求正本为 xindong/xdrpg#190。

- 写插件前读取当前宿主 `ghost_forge_guide`，以实时作者契约和源码事实为准。
- 保留五个工作流及用户已确认的「每次点击新建独立任务」语义。
- 不捆绑、改写或伪造目标项目的 `_S/*.md`、`_E/merge.md`、`xd-pr-review`。
- 任务权限、模型、项目目录由 Host 管理；无业务需要不增加插件能力。
- 不自动重试不确定的派发；显式恢复沿用持久 requestKey。
- 界面只用 Host 注入白名单主题变量，同时支持明暗；语言只取 `/app-context`。
- 提交前执行 `npm test` 和 `npm run check`，修改插件后再用 Forge 校验打包。
- 提交时保留真实作者信息；不要提交凭证、缓存、用户数据。按用户指定，仅根目录固定分发包 jixin-make-a-wish.cindy 及 DISTRIBUTION.json 入库，plugin/ 下历史包仍忽略。
- 不自动安装、更新、发布插件，不自动执行真实 PR 或分支清理来测试。

## 硬性版本规则

每次包含文件修改的开发提交，补丁版本必须自动 +1（如0.1.0→0.1.1），包括文档、测试与CI修改；取代此前“不改版本”的约定。package.json、plugin/ghost.json、根目录.cindy、DISTRIBUTION.json和README标题同步。不能只改文档版本，也不能在打tag时才补版本。

本地先运行 python3 scripts/install_hooks.py（或 npm run prepare）安装本仓pre-commit；正常暂存后git commit即自动处理。版本/分发包/README若有未暂存修改，先明确暂存或收起，避免意外纳入提交。其它插件文件支持部分暂存，构建仅取Git暂存区。

GitHub网页/API不运行本地hook：通过插件push_files上传时，必须上传本地hook生成的完整提交（含所有版本与二进制包文件），不重复再升一次。main每次push还有云端兜底，按每条修改提交递增并自动修复遗漏；自动修复提交只落地这些已计算的版本，不作为新开发修改再次递增。空提交不升版；重跑CI不重复升版。不要移动已发布tag，只有用户要求发布时才新建与当前版本匹配的tag。
