# Cindy Workflow Deck

运行在 Cindy 编辑器中的 Agent 工作流快捷面板。任务来源：[xindong/xdrpg#190 · FRONTEND-8766](https://github.com/xindong/xdrpg/issues/190)。

## 第一版行为

| 按钮 | Agent 要读取的流程 |
| --- | --- |
| 开始实验性工作 | 项目根目录 `_S/experiment.md` |
| 开始功能开发 | 项目根目录 `_S/feature.md` |
| 开始工具开发 | 项目根目录 `_S/tooling.md` |
| 提交 PR 并走 PR 流程 | 已安装的 `xd-pr-review` Skill |
| 清理分支并更新回 main | 项目根目录 `_E/merge.md` |

**每次点击都新建一个独立的普通任务，不复用任务或聊天上下文。** 这是本项目确认后的交互选择。用户可先填写可选的工作目标；它会附在新任务指令里。缺少流程文件、Skill 或明确目标时，Agent 被要求停止并说明缺项或询问用户。插件不捆绑、不猜测这些业务流程的正文。

面板使用 Cindy 原生停靠容器。标题栏的撑满、独立窗口和最小化按钮由 Cindy 提供；插件不仿制系统窗口，不修改编辑器源码。

## 安装与使用

1. 将 `workflow-deck-0.1.0.cindy` 导入 Cindy，在权限卡中批准插件的任务能力。
2. 在插件详情的「任务设置」中选择真正的项目目录、可用模型和合适权限。插件不把自己源码目录当成工作目录，不硬编码模型或提升权限。
3. 启用并打开「工作流」面板。需要独立窗口或最小化时，使用 Cindy 标题栏按钮。
4. 点击任一工作流；在 Cindy 任务列表查看、回复、审批或停止新任务。
5. 面板的「最近发起」保留任务编号和目录。「已受理」只代表任务输入被 Host 接收，实际完成情况以任务和手动「刷新状态」读到的运行状态为准。

出现「待核实」时先检查 Cindy 任务列表。点击「核对原请求」会沿用持久化的请求键，请求 Host 对账，不另起第二条任务。权限拒绝不会自动重弹确认或重试。

## 兼容性与边界

- 目标宿主：Cindy Desktop `0.1.109`。`minCindyVersion` 采用本项目明确支持的起始版本；尚未验证更早版本。
- 依据当前宿主下发的 `ghost_forge_guide`（schema v3、`agent.tasks`、`cindy.tasks.create/send/getRun`）开发，启动时检查实际 capabilities。
- 本地参考编辑器仓库是 `xindong/cindy@8f4f2042e`；其中插件文档仍为旧版，不能据此假定旧宿主具备新任务 API。插件不回退到会复用任务的旧 errand 接口。
- 仅使用 Host 提供的任务能力和同源 `/wake`、`/kv`、`/app-context`；无自主联网、Node 工作进程、文件读写或凭证权限。
- 界面跟随 Cindy 语言与主题；提供简中和英文，其他语言按契约回退英文。Light/Dark 通过白名单主题变量适配。
- 独立任务的上下文彼此隔离，但若选择同一项目目录，它们仍会操作同一工作区；插件没有声称提供 Git worktree 隔离。
- 流程文件和 Skill 的实际执行依赖用户项目与所选 Agent 的权限。插件测试不会自动执行真实 PR、合并或分支清理。

## 开发

零运行依赖，无需 npm install。开发检查需要 Node.js 22+：

```sh
npm test
npm run check
```

源码结构：

```text
plugin/                 # 唯一打包目录，不混入测试、仓库或开发工具
  ghost.json            # schema v3 身份卡，最小任务权限
  workflows.js          # 五个流程与 Agent 指令
  controller.js         # 串行派发、持久去重、显式恢复
  main.js / runtime.js  # 沙箱后台入口与面板消息通道
  panel.html/css/js     # 零特权面板
tests/                  # Node 单元测试与浏览器验收夹具
scripts/check.mjs       # 本地轻量检查
docs/                   # 验收清单与设计决策
```

在 Cindy 中调用 `ghost_forge_pack`，`dir` 指向本仓库的 `plugin/` 绝对目录。只打包，不自动安装。安装与更新使用独立的 `ghost_forge_install`，需要用户明确要求并批准 Host 权限卡。不要修改已经安装的插件目录。
