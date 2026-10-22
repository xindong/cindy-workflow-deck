import { errorHelp } from './error-help.js';
export function createFileActions({state,ready,isBusy,call,perform,reviewedCall,refresh,english=false}) {
  const say=(zh,en)=>english?en:zh;
  const dialog=document.createElement('dialog');dialog.className='file-dialog';
  const title=document.createElement('h3'),help=document.createElement('p'),body=document.createElement('pre'),rule=document.createElement('label'),check=document.createElement('input'),ruleText=document.createElement('span'),actions=document.createElement('div'),confirm=document.createElement('button'),cancel=document.createElement('button');
  check.type='checkbox';rule.className='check';ruleText.textContent=say('我已核对项目规则，完成还原所需的人工前提。','I reviewed project rules and completed any required prerequisites for restoring this file.');rule.append(check,ruleText);
  const status=document.createElement('p');status.setAttribute('role','status');document.getElementById('beginner-files').after(status);
  const recovery=document.createElement('div'),recoveryText=document.createElement('p'),ack=document.createElement('button');recovery.hidden=true;recovery.id='file-revert-recovery';ack.type='button';ack.textContent=say('核对上次还原结果','Verify the previous restore');recovery.append(recoveryText,ack);status.after(recovery);
  actions.className='row';confirm.type=cancel.type='button';cancel.textContent=say('取消','Cancel');actions.append(confirm,cancel);dialog.append(title,help,body,rule,actions);document.body.append(dialog);
  let pending;
  const close=()=>{pending=undefined;dialog.close();};
  cancel.onclick=close;dialog.addEventListener('cancel',()=>{pending=undefined;});
  check.onchange=()=>{confirm.disabled=!!pending?.requiresRules&&!check.checked;};
  function compare(item) {
    return perform(async()=>{
      const root=state()?.root;
      status.textContent=say('正在读取线上版本并比对，请稍候…','Fetching the online version and comparing…');
      let result;
      try {result=await call('file-open',{path:item.path,english});}
      catch(error) {
        status.textContent=say('线上差异未打开，可点击“对比线上”重试：','Online comparison did not open. Click Compare online to retry: ')+errorHelp(error,english).message;
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
  ack.onclick=()=>{
    const current=state(),receipt=current?.fileRevertReceipt;if(!ready()||isBusy()||!receipt)return;
    pending={root:current.root,fingerprint:current.fingerprint,requiresRules:true,recordId:receipt.backup};
    title.textContent=say('确认已核对实际文件与备份？','Have you verified the actual file and backup?');help.textContent=say('请先与负责人核对文件、暂存区和备份。此操作只允许后续新操作，不会重放上次还原。备份：','Verify the file, index and backup with the project owner. This only allows future operations and never repeats the previous restore. Backup: ')+receipt.backup;
    body.hidden=true;rule.hidden=false;check.checked=false;confirm.hidden=false;confirm.disabled=true;confirm.textContent=say('已核对，允许后续操作','Verified; allow future operations');cancel.textContent=say('取消','Cancel');dialog.showModal();
  };
  confirm.onclick=()=>{
    const choice=pending;if(!choice||choice.requiresRules&&!check.checked)return;close();
    return perform(async()=>{
      if(!ready()||state()?.root!==choice.root||state()?.fingerprint!==choice.fingerprint)throw Object.assign(new Error(say('文件或项目已变化，请刷新后重新确认。','The project or files changed. Refresh and confirm again.')),{code:'STALE_REVIEW'});
      const result=await reviewedCall(choice.recordId?'file-revert-acknowledge':'file-revert',{path:choice.path,confirmPath:choice.path,recordId:choice.recordId,rulesConfirmed:true});
      await refresh();
      status.textContent=result.message;
    });
  };
  function append(container,item,checkbox) {
    const row=document.createElement('div'),info=document.createElement('div'),tag=document.createElement('strong'),name=document.createElement('span'),buttons=document.createElement('div'),diff=document.createElement('button'),restore=document.createElement('button');
    row.className='beginner-file';info.className='file-name';buttons.className='file-actions';
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
    const receipt=state()?.fileRevertReceipt,blocked=receipt&&!['restored','acknowledged'].includes(receipt.state);
    recovery.hidden=!blocked;recoveryText.textContent=blocked?say('上次还原结果待核对。备份：','Previous restore needs verification. Backup: ')+receipt.backup:'';ack.disabled=isBusy()||!ready();
    for(const button of document.querySelectorAll('.file-actions button'))button.disabled=isBusy()||!ready()||button.dataset.unsupported==='true'||!!blocked&&button.dataset.restore==='true';
  }
  return {append,update,invalidate:()=>{close();status.textContent='';}};
}
