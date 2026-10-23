// Public messages describe the reason and next step. Raw diagnostics stay in details.
export function errorHelp(error={},english=false) {
 const code=String(error.code||error.errorCode||''),raw=String(error.message||'');
 const choose=(zh,en)=>english?en:zh;
 let message;
 if(code==='PROTOCOL_ERROR'&&/stdout|1\s*M(?:B|iB)|单行|超[过限]/i.test(raw))message=choose('项目信息较多，当前插件一次接收不下，因此没能显示项目状态。请升级插件后点“重新检查”；无需重新选择目录或删除文件。若刚执行过更新或提交，请先核对实际结果，不要重复操作。','There is more project information than this plugin can receive at once. Update the plugin and check again; do not delete files or select the folder again. If an update or submission was in progress, verify its result before retrying.');
 else if(['RESULT_TRANSFER_EXPIRED','RESULT_TOO_LARGE'].includes(code))message=choose('项目信息读取中断或超过显示容量，暂时无法显示完整结果。请点“重新检查”；如果仍失败，请把操作详情交给项目负责人。若刚执行过更新或提交，请先核对实际结果，不要重复操作。','Project information could not be read completely. Check again; if it still fails, share the details with the project owner. Verify any update or submission before repeating it.');
 else if(code==='HOST_NOT_READY')message=choose('当前没有可显示对比的任务对话。请先打开 Cindy 中的普通任务对话，再双击文件；伙伴聊天暂不能承载这个预览。','Open an ordinary Cindy task conversation, then double-click the file again. Teammate chats cannot currently host this preview.');
 else if(/Permission denied \(publickey\)|Authentication failed|could not read Username/i.test(raw)||['SSH_IDENTITY_INVALID','SSH_IDENTITY_REQUIRED'].includes(code))message=choose('无法连接团队仓库：当前项目的登录或 SSH 密钥未通过验证。请让项目负责人检查该项目绑定的账号、密钥和仓库访问权限，再重新检查。','Repository authentication failed. Ask the project owner to check this project’s account, SSH key and repository access, then check again.');
 else if(/does not appear to be a git repository|Could not read from remote repository|repository .*not found/i.test(raw))message=choose('无法访问团队仓库。请让项目负责人检查仓库地址和当前账号的访问权限，再重新尝试更新。','Cannot access the team repository. Ask the project owner to verify the repository address and account access, then try updating again.');
 else if(['EACCES','EPERM','PERMISSION_DENIED'].includes(code))message=choose('没有权限读取或操作这个项目。请确认所选目录允许访问，并让项目负责人检查文件权限；不要删除项目或重复提交。','Access to this project was denied. Check folder access and ask the project owner to review permissions; do not delete the project or repeat a submission.');
 else if(/git-lfs.*not found|git: 'lfs'|git-lfs: command not found/i.test(raw))message=choose('项目需要大文件组件 Git LFS，但这台电脑尚未准备好。请联系项目负责人配置后再重新检查。','This project needs Git LFS. Ask the project owner to set it up on this computer, then check again.');
 else {
  const messages={
   NOT_GIT_PROJECT:['这个目录不是已有的团队 Git 项目。请选择项目最外层文件夹；如果刚下载的是压缩包，请联系项目负责人获取完整项目。','This folder is not an existing Git project. Select the project root or ask the owner for a complete checkout.'],
   NOT_PROJECT_ROOT:['选到了项目内部的子文件夹。请选择包含整个项目的最外层文件夹。','Select the project root rather than a subfolder.'],
   GIT_REQUIRED:['这台电脑缺少版本管理组件 Git。请联系项目负责人配置后再试。','Git is missing. Ask the project owner to install it, then try again.'],
   HOOKS_NOT_READY:['项目要求的提交检查还没准备好。请联系项目负责人配置，完成后点“重新检查”。','Required project checks are not ready. Ask the owner to configure them, then check again.'],
   RULE_DISCOVERY_INCOMPLETE:['项目规则较多，暂时无法完整核对。请让项目负责人检查规则范围后重新检查，不要跳过规则提交。','Project rules could not be fully checked. Ask the owner to review the rule scope; do not bypass them.'],
   RULE_TOO_LARGE:['项目的一份规则文件过大或格式不符合要求。请把操作详情交给项目负责人处理，再点“重新检查”。','A project rule file is too large or unsupported. Share the details with the owner, then check again.'],
   RULE_SYMLINK:['项目规则指向了外部链接，无法安全核对。请让项目负责人确认规则文件的位置。','A project rule uses a symbolic link. Ask the owner to verify its location.'],
   STALE_REVIEW:['文件或项目规则刚刚发生变化。请点“重新检查”，核对后再选择操作。','Files or project rules changed. Check again and review before continuing.'],
   CONFIG_CONFLICT:['项目配置已在另一处改变。请重新加载配置，确认当前项目后再操作。','Project settings changed elsewhere. Reload and review the selected project.'],
   RESPONSE_UNCONFIRMED:['还没收到操作的最终结果。请先点“重新检查”核对；不要再次更新或提交。','The final result has not been confirmed. Check the actual state before repeating an update or submission.'],
   OPERATION_LOCKED:['项目有正在进行或尚未核对的操作，暂时不能还原。请先重新检查状态；如果仍提示待核对，请联系项目负责人处理，不要删除操作记录或备份。','An operation is running or needs verification. Check the state first; if it remains pending, ask the project owner to verify it. Keep operation records and backups.'],
   REVERT_UNCONFIRMED:['还原已停止，部分文件可能已经还原。请先重新检查结果，并与项目负责人核对文件、暂存内容及备份；不要再次还原同一批文件。','Restore stopped and some files may already be restored. Check the result and verify files, staged contents and backups with the project owner before any new restore.'],
   ERR_CHILD_PROCESS_STDIO_MAXBUFFER:['项目文件列表或检查结果超出了当前可读取的容量。请把操作详情交给项目负责人处理；无需删除项目文件。','The project file list or check output exceeds the current capacity. Share the details with the project owner; do not delete project files.'],
   TIMEOUT:['等待后台处理超时。请先点“重新检查”核对项目状态；若刚执行过更新或提交，不要直接重复操作。','The operation timed out. Check the actual state before repeating an update or submission.'],
   UNSUPPORTED_HOST:['当前 Cindy 版本不支持此功能。请更新 Cindy 后再试。','Update Cindy to use this feature.'],
   NETWORK_ERROR:['暂时无法连接团队仓库。请检查网络或公司 VPN，再重新检查项目。','Cannot reach the repository. Check your network or company VPN, then check again.'],
  };
  if(messages[code])message=messages[code][english?1:0];
  else if(/Could not resolve host|Could not resolve hostname|Failed to connect|Connection timed out|Network is unreachable/i.test(raw))message=choose('暂时无法连接团队仓库。请检查网络或公司 VPN，再重新检查项目。','Cannot reach the repository. Check your network or company VPN, then check again.');
  else if(/^[\u4e00-\u9fff]/.test(raw)&&!/^Command failed|stdout|stderr/i.test(raw))message=raw;
  else message=choose('操作没有完成。请先点“重新检查”核对项目状态；如果仍失败，请展开“操作详情”交给项目负责人。不要直接重复更新或提交。','The operation did not complete. Check the project state; if it still fails, share the details with the project owner. Do not repeat an update or submission without checking.');
 }
 return {message,detail:[code,raw].filter(Boolean).join('\n')};
}
