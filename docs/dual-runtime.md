# 双形态第一阶段：项目配置与只读检查

当前已实现：同一份项目/流程配置模型、校验和页面，分别接入Cindy设置与独立Electron桌面程序。每个项目配置五类指令文件；支持相对路径、显式允许的外部绝对路径、留空禁用、项目切换、重载持久配置、多窗口修订冲突提示。只读检查非空普通文件，不执行脚本、不修改目标项目。

## 在Cindy里配置

安装包含本阶段改动的.cindy后，在插件详情的配置区域填写；不是原聊天卡里的目标输入框。添加项目→选择本机项目目录→配置各流程路径→保存→检查已保存项目。Host目前只提供目录选择器，流程文件填写相对路径即可；外部绝对路径需勾选允许。配置保存到本插件/kv，由逻辑页串行合并，保留原日志与派发回执。移除/更新插件遵循Host自身的存储规则。

保存目录不等于给Host任务设置了工作目录。高级工作流仍需在目标聊天点新绑定卡取得真实关联；会话目录与某项配置目录匹配时使用该项的指令文件。配置其它项目不会使现有聊天越权派发到那个目录。未配置项目保留旧版默认路径检查，以兼容已有绑定。配置项目中空白流程明确禁用，不退回默认文件或用户全局技能。

新增pick能力；安装或更新仍由用户通过Host确认，本阶段没有自动安装。配置页浏览器回归使用模拟Host，不等于新版已在真实Cindy完成安装交互验收。

## 独立桌面运行

完全不需要Cindy进程、登录或SDK。开发运行需要Node22+，从仓库运行：

    npm ci --ignore-scripts
    node node_modules/electron/install.js
    npm run desktop

忽略安装scripts是为了明确分开下载Electron与本仓hook安装；开发提交仍需单独运行python3 scripts/install_hooks.py。Electron版本和完整依赖已锁定。桌面窗口提供配置页面与系统目录/文件选择器；文件选择器对项目内文件存相对路径，项目外选中文件会显示绝对路径并标记允许。

配置保存在本应用系统userData目录中的projects.json，不写入项目，不与Cindy/kv自动同步。保存采用修订校验和原子替换；只支持单实例持久写入。本地只读检查额外显示实际Git根目录、分支、变更及项目根AGENTS.md/CONTRIBUTING.md的存在情况。规则发现不是完整嵌套规则解析或提交准入，界面明确标识；没有实现Git写入、AI调用和独立工作流执行，不能用此阶段程序宣称完整开发工具已交付。

macOS开发机可运行npm run desktop:package，生成忽略目录desktop-builds/中的.app及ZIP。包含Electron运行时，不要求使用者安装Node或Cindy；使用ad-hoc签名，未做Developer ID签名/公证，不冒称系统已信任。Windows源码入口已提供，但目前尚无Windows实机或经过验证的Windows安装包。

## 验证

- npm test：共享配置、真实文件检查、独立配置持久化与冲突、临时Git仓库只读状态、Cindy配置控制器、原绑定/连续任务及Host式Node worker。
- npm run test:release：版本/发布/规范门禁；package-lock随版本文件同步。
- npm run check：设置页CSP、manifest引用、共享与桌面代码语法及规范检查。
- 浏览器/桌面验收：设置PLAYWRIGHT_MODULE_PATH为已安装Playwright的index.mjs路径，PLAYWRIGHT_BROWSERS_PATH为浏览器缓存后，运行node tests/dual-ui-check.mjs。启动真实Electron并使用临时用户数据/项目，再以模拟Host验证Cindy配置页。不会在真实用户项目执行Git写入或AI任务。
