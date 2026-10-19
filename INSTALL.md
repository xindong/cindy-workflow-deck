# 从 GitHub Release 安装极心许愿

在 Cindy 聊天发送：

> 请安装 https://github.com/xindong/cindy-workflow-deck 的极心许愿插件。按 INSTALL.md 从最新正式 Release 下载并校验安装包，交给 Cindy 正常安装，核对最终结果。

[打开最新正式 Release](https://github.com/xindong/cindy-workflow-deck/releases/latest)。在 Assets 下载 jixin-make-a-wish-版本.cindy，不要选择 GitHub 自动生成的 Source code ZIP/TAR。仓库当前源码树没有安装包；main版本可能比已发布版本新，安装必须以选定Release为准。

## 给 Cindy AI 的步骤

1. 获取最新正式、非draft且非prerelease的Release。可使用已有GitHub插件的 get_latest_release，或匿名访问 GitHub Releases API / releases/latest 页面并确认实际tag。网络失败或限流时报告实际状态，不索取聊天凭证、不把源码分支版本当成发布版本。
2. 记录Release的ID/tag及其精确附件URL。从同一个Release下载版本化.cindy、DISTRIBUTION.json和SHA256SUMS.txt到独立目录。下载应为二进制，不能把HTML网页存成安装包；不混用不同Release或旧根目录元数据。
3. 先检查SHA256SUMS.txt中安装包及DISTRIBUTION.json的SHA256，再检查元数据的整包SHA256、ZIP清单及逐文件哈希、manifest的ID/名称/版本/最低Cindy版本。tag去掉可选v后必须等于metadata和manifest版本，ID及command均为jixin-make-a-wish。下载版本要求的最低Cindy版本以manifest为准（现有版本为0.1.109+）。
4. 已克隆仓库的开发者可运行 python3 scripts/install_local.py --dir 下载目录 --check；不克隆、不装Python也能由Cindy AI使用现有文件工具校验，普通用户无需额外开发依赖。校验和是本仓一致性信息，不是签名或官方发现协议。
5. 用户明确要求安装后，使用系统正常打开该.cindy：macOS用 open -a Cindy 后接包的绝对路径；Windows通过文件关联打开。开发者也可运行 python3 scripts/install_local.py --dir 下载目录 --open。这只转交Cindy正式确认，不能写Host配置或安装目录、跳过确认、伪造批准；用户取消后停止，不自动重试。
6. 核对Host最终安装回执/已安装清单中的ID和本次所选Release版本，才能报告成功；仅打开文件不等于完成安装。在目标项目聊天发送 $jixin-make-a-wish，用新卡绑定；旧workflow-deck的数据不自动迁移。

公开仓库附件可匿名下载，无需GitHub授权；Cindy首次安装确认保留，未签名包可能显示“未验证”。固定版本安装时指定一个正式Release，并始终从同一Release取三附件。

## 开发与发布

日常提交只同步源码版本：默认+0.0.1，显式大版本+0.1.0且patch归零。main版本CI不构建或提交安装包。推送匹配版本tag后，Release workflow从tag源码测试、构建、校验并上传三附件。

本地需要包预检时，可运行 python3 scripts/build_distribution.py --out 新的产物目录，再用 python3 scripts/install_local.py --dir 产物目录 --check。默认产物目录为被Git忽略的release-assets/，不要提交.cindy或DISTRIBUTION.json。只有发布Release才向安装者提供新包；规则和历史验证见README、AGENTS.md和docs/verification.md。
