import { errorHelp } from './error-help.js';
export function createFileActions({state,ready,isBusy,call,perform,reviewedCall,refresh,canRefresh=ready,english=false}) {
  const say=(zh,en)=>english?en:zh;
  const dialog=document.createElement('dialog');dialog.className='file-dialog';
  const title=document.createElement('h3'),help=document.createElement('p'),body=document.createElement('pre'),rule=document.createElement('label'),check=document.createElement('input'),ruleText=document.createElement('span'),actions=document.createElement('div'),confirm=document.createElement('button'),cancel=document.createElement('button');
  check.type='checkbox';rule.className='check';ruleText.textContent=say('我已核对项目规则，完成还原所需的人工前提。','I reviewed project rules and completed any required prerequisites for restoring this file.');rule.append(check,ruleText);
  const status=document.createElement('p');status.id='file-action-status';status.setAttribute('role','status');document.getElementById('beginner-files').after(status);
  const recheck=document.createElement('button');recheck.id='file-action-recheck';recheck.type='button';recheck.hidden=true;recheck.textContent=say('重新检查还原结果','Check restore result');status.after(recheck);
  const errorDetails=document.createElement('details'),errorTitle=document.createElement('summary'),errorOutput=document.createElement('pre');
  errorDetails.id='file-action-details';errorDetails.hidden=true;errorTitle.textContent=say('操作详情（可交给项目负责人）','Details for the project owner');errorDetails.append(errorTitle,errorOutput);status.after(errorDetails);
  const recovery=document.createElement('div'),recoveryText=document.createElement('p'),ack=document.createElement('button');recovery.hidden=true;recovery.id='file-revert-recovery';ack.type='button';ack.textContent=say('核对上次还原结果','Verify the previous restore');recovery.append(recoveryText,ack);status.after(recovery);
  actions.className='row';confirm.type=cancel.type='button';cancel.textContent=say('取消','Cancel');actions.append(confirm,cancel);dialog.append(title,help,body,rule,actions);document.body.append(dialog);
  let pending,generation=0;
  const clearFeedback=()=>{errorDetails.hidden=true;errorDetails.open=false;errorOutput.textContent='';recheck.hidden=true;};
  const showError=(error,prefix)=>{const diagnostic=errorHelp(error,english);status.textContent=prefix+diagnostic.message;errorOutput.textContent=diagnostic.detail;errorDetails.hidden=!diagnostic.detail;recheck.hidden=false;};
  recheck.onclick=()=>perform(async()=>{
    const requested=generation;
    try {await refresh();if(requested!==generation||!ready())return;clearFeedback();status.textContent=say('已重新读取实际文件与操作记录；未再次执行还原。请核对文件清单及下方待核对提示。','Actual files and operation records checked; restore was not repeated. Review the file list and any verification notice.');recheck.hidden=true;}
    catch(error){if(requested===generation)showError(error,say('检查未完成：','Check did not complete: '));throw error;}
  });
  const close=()=>{pending=undefined;dialog.close();};
  cancel.onclick=close;dialog.addEventListener('cancel',()=>{pending=undefined;});
  check.onchange=()=>{confirm.disabled=!!pending?.requiresRules&&!check.checked;};
  function compare(item) {
    return perform(async()=>{
      const root=state()?.root;
      clearFeedback();
      status.textContent=say('正在读取线上版本并比对，请稍候…','Fetching the online version and comparing…');
      let result;
      try {result=await call('file-open',{path:item.path,english});}
      catch(error) {
        const diagnostic=errorHelp(error,english);
        status.textContent=say('线上差异未打开，可点击“对比线上”重试：','Online comparison did not open. Click Compare online to retry: ')+diagnostic.message;
        errorOutput.textContent=diagnostic.detail;errorDetails.hidden=!diagnostic.detail;
        if(error.code==='CONFIG_CONFLICT')throw error;
        return;
      }
      if(!ready()||state()?.root!==root)return;
      status.textContent=say('已对比 ','Compared ')+result.target+' · '+result.commit.slice(0,12)+(result.previewOpened?say('，已在 Cindy 侧边栏打开。','; opened in the Cindy sidebar.'):'');
      if(!result.previewOpened) {
        pending=undefined;title.textContent=item.path;help.textContent=say('线上版本 → 本地文件：','Online version → local file: ')+result.target+' · '+result.commit;body.textContent=result.output;body.hidden=false;rule.hidden=true;confirm.hidden=true;cancel.textContent=say('关闭','Close');dialog.showModal();
      }
    });
  }
  function askRestore(item) {
    const current=state();if(!ready()||isBusy()||!current)return;
    pending={path:item.path,root:current.root,fingerprint:current.fingerprint,requiresRules:current.sources.length>0};
    title.textContent=say('还原这个文件？','Restore this file?');
    help.textContent=item.path+'\n'+say('将丢弃此文件在工作区和暂存区的修改，恢复到本机最近提交（HEAD）。新增文件会被移除。不会改成线上版本，也不会处理其他文件。先保存该文件的备份，再执行还原。','Discard this file’s working-tree and staged changes and restore the latest local commit (HEAD). Added files will be removed. This does not restore the online version or touch other files. A backup is saved first.');
    body.hidden=true;rule.hidden=!pending.requiresRules;check.checked=false;confirm.hidden=false;confirm.disabled=pending.requiresRules;confirm.textContent=say('确认还原此文件','Restore this file');cancel.textContent=say('取消','Cancel');dialog.showModal();
  }
  function askRestoreMany(items) {
    const current=state();if(!ready()||isBusy()||!current||!items.length||items.length>200)return;
    pending={paths:items.map(item=>item.path),root:current.root,fingerprint:current.fingerprint,requiresRules:current.sources.length>0};
    title.textContent=say('还原这 '+items.length+' 个文件？','Restore these '+items.length+' files?');
    help.textContent=say('仅还原下列筛选结果到本机最近提交（HEAD），丢弃它们的工作区及暂存修改；新增文件会被移除。执行前逐个备份，其他文件不变。中途失败会停止并保留备份，不自动重试。','Restore only the listed filtered files to local HEAD, discarding their working and staged changes; added files are removed. Every file is backed up first. Other files stay unchanged. Failure stops the batch with backups retained; no automatic retry.');
    body.textContent=pending.paths.join('\n');body.hidden=false;rule.hidden=!pending.requiresRules;check.checked=false;confirm.hidden=false;confirm.disabled=pending.requiresRules;confirm.textContent=say('确认还原这 '+items.length+' 个文件','Restore these '+items.length+' files');cancel.textContent=say('取消','Cancel');dialog.showModal();
  }
  ack.onclick=()=>{
    const current=state(),receipt=current?.fileRevertReceipt;if(!ready()||isBusy()||!receipt)return;
    pending={root:current.root,fingerprint:current.fingerprint,requiresRules:true,recordId:receipt.backup};
    title.textContent=say('确认已核对实际文件与备份？','Have you verified the actual file and backup?');help.textContent=say('请先与负责人核对文件、暂存区和备份。此操作只允许后续新操作，不会重放上次还原。备份：','Verify the file, index and backup with the project owner. This only allows future operations and never repeats the previous restore. Backup: ')+receipt.backup;
    body.hidden=true;rule.hidden=false;check.checked=false;confirm.hidden=false;confirm.disabled=true;confirm.textContent=say('已核对，允许后续操作','Verified; allow future operations');cancel.textContent=say('取消','Cancel');dialog.showModal();
  };
  confirm.onclick=()=>{
    const choice=pending;if(!choice||choice.requiresRules&&!check.checked)return;close();
    return perform(async()=>{
      const requested=generation;let result;clearFeedback();
      status.textContent=choice.recordId?say('正在保存核对结果…','Saving verification…'):say('正在备份并还原 '+(choice.paths?.length||1)+' 个文件，请勿重复操作…','Backing up and restoring '+(choice.paths?.length||1)+' files; do not repeat the operation…');
      status.scrollIntoView({block:'nearest'});
      try {
        if(!ready()||state()?.root!==choice.root||state()?.fingerprint!==choice.fingerprint)throw Object.assign(new Error(say('文件或项目已变化，请刷新后重新确认。','The project or files changed. Refresh and confirm again.')),{code:'STALE_REVIEW'});
        result=await reviewedCall(choice.recordId?'file-revert-acknowledge':'file-revert',{...(choice.paths?{paths:choice.paths,confirmPaths:choice.paths}:{path:choice.path,confirmPath:choice.path}),recordId:choice.recordId,rulesConfirmed:true});
      } catch(error) {
        if(requested!==generation)return;
        showError(error,choice.recordId?say('核对结果未保存或尚未确认：','Verification was not saved or is unconfirmed: '):say('还原未完成或结果尚未确认：','Restore did not complete or its result is unconfirmed: '));
        if(error.code==='CONFIG_CONFLICT')throw error;
        // Read the actual result and journal only. Never replay a failed write.
        try {await refresh();}catch(checkError){if(requested===generation)status.textContent+=say(' 状态读取也未完成，请点“重新检查还原结果”。',' State check also failed. Click Check restore result.');throw checkError;}
        return;
      }
      if(requested!==generation)return;
      try {await refresh();}
      catch(error) {if(requested===generation)showError(error,(result.message||say('操作已返回成功。','Operation confirmed.'))+say(' 清单刷新失败；不要再次还原，请先重新检查。',' List refresh failed; check the result before restoring again.'));throw error;}
      if(requested===generation&&ready()&&state()?.root===choice.root)status.textContent=result.message;
    });
  };
  function append(container,item,checkbox) {
    const row=document.createElement('div'),info=document.createElement('div'),tag=document.createElement('strong'),name=document.createElement('span'),buttons=document.createElement('div'),diff=document.createElement('button'),restore=document.createElement('button');
    row.className='beginner-file';row.dataset.path=item.path;info.className='file-name';buttons.className='file-actions';
    name.textContent=item.path;name.tabIndex=0;name.setAttribute('role','button');name.title=say('双击在侧边栏对比线上差异','Double-click to compare with the online version in the sidebar');
    name.ondblclick=()=>compare(item);name.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void compare(item);}};
    diff.type=restore.type='button';diff.textContent=say('对比线上','Compare online');restore.textContent=say('还原','Restore');
    diff.onclick=()=>compare(item);restore.onclick=()=>askRestore(item);
    restore.dataset.restore='true';
    restore.dataset.unsupported=String(!state()?.head||/[URC]/.test(item.status)||['AA','DD'].includes(item.status));
    restore.title=say('恢复到本机最近提交（HEAD），执行前保存备份','Restore the latest local commit (HEAD), saving a backup first');
    info.append(tag,name);buttons.append(diff,restore);row.append(checkbox,info,buttons);container.append(row);return tag;
  }
  function update(){
    recheck.disabled=isBusy()||!canRefresh();
    const current=state(),receipt=current?.fileRevertReceipt,blocked=receipt&&!['restored','acknowledged'].includes(receipt.state);
    const updatePending=current?.beginnerReceipt&&!current.beginnerReceipt.retryable&&['running','blocked','needs-verification'].includes(current.beginnerReceipt.state);
    recovery.hidden=!blocked;recoveryText.textContent=blocked?say('上次还原结果待核对。备份：','Previous restore needs verification. Backup: ')+receipt.backup:'';ack.disabled=isBusy()||!ready();
    for(const button of document.querySelectorAll('.file-actions button'))button.disabled=isBusy()||!ready()||button.dataset.unsupported==='true'||!!(blocked||updatePending||current?.operationLocked)&&button.dataset.restore==='true';
  }
  return {append,update,askRestoreMany,invalidate:()=>{generation++;close();status.textContent='';clearFeedback();}};
}
