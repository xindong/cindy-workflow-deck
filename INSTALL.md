# 从仓库链接安装极心许愿

用户在 Cindy 聊天中发送：

> 请安装 https://github.com/xindong/cindy-workflow-deck 的极心许愿插件。按仓库 INSTALL.md 下载、校验并打开根目录 .cindy，完成后核对安装结果。

根目录 [jixin-make-a-wish.cindy](jixin-make-a-wish.cindy) 是可安装包，不是源码 ZIP。显示名称为“极心许愿”，ID 和命令为 jixin-make-a-wish，版本固定为 0.1.0，要求 Cindy 0.1.109+。

## 给 Cindy AI 的安装步骤

1. 本仓库已公开，可匿名读取，无需 GitHub 授权。确定默认分支的确切 commit，再从 raw.githubusercontent.com 下载文件；也可使用已有 GitHub 插件。若读取失败，报告实际状态，不索取聊天中的凭证。
2. 从同一 commit 下载根目录 .cindy 和 DISTRIBUTION.json，保存到独立临时目录。GitHub Contents API 的 content 为 base64，必须解码为二进制，不能下载网页 HTML 充当安装包。
3. 校验整包 SHA256、ZIP 文件清单及逐文件 SHA256，以及包内 ghost.json 的 ID、名称、版本和最低版本。DISTRIBUTION.json 是本仓分发元数据，不是 Cindy 官方发现协议或签名。完整克隆后可运行 python3 scripts/install_local.py --check。
4. 用户明确要求安装时，使用系统正常打开此 .cindy：macOS 使用 open -a Cindy 后接包的绝对路径；Windows 通过关联应用打开文件。完整克隆可运行 python3 scripts/install_local.py --open。没有 Python 时由 AI 用现有文件工具校验并打开，安装者无需另装开发依赖。
5. 这会进入 Cindy 的正式安装确认。确认由用户操作，不能写 Host 配置、复制到安装目录或伪造批准；取消后停止，不循环重试。核对最终安装回执/已安装清单中的 jixin-make-a-wish 和 0.1.0，才报告成功。仅打开文件不代表已安装。
6. 在目标项目聊天发送 $jixin-make-a-wish，点新卡片绑定。旧 workflow-deck 的日志和绑定不自动迁移。

公开仓库无需 GitHub 授权即可下载。只贴链接不会绕过 Cindy 首次安装权限确认；未签名包可能显示“未验证”。

## 自动维护安装包

修改 plugin/ 后运行 python3 scripts/build_distribution.py，生成根目录固定安装包和 DISTRIBUTION.json，无需改版本。--check 检查分发包是否过期。同一源码生成确定性 ZIP。

GitHub Actions 在 main 的插件/打包脚本变化后运行测试，自动刷新包与校验文件并提交，也可手动触发。仅根目录此固定分发包入库，历史安装包仍忽略。
