import {errorHelp} from './error-help.js';
// Recovery checks are read-only. A retry always opens a fresh confirmation;
// acknowledging a verified repair never replays the interrupted operation.
export function createUpdateRecovery({state,ready,isBusy,isUpdating=()=>false,canRefresh,perform,refresh,reviewedCall,openUpdate,english=false}) {
  const say=(zh,en)=>english?en:zh;
  const box=document.createElement('section');box.id='update-recovery';box.hidden=true;
  const title=document.createElement('h3'),help=document.createElement('p'),backup=document.createElement('p');help.id='update-recovery-help';backup.id='update-recovery-backup';
  const actions=document.createElement('div');actions.className='row';
  const check=document.createElement('button'),retry=document.createElement('button');check.id='update-recovery-check';retry.id='update-recovery-retry';check.type=retry.type='button';
  check.textContent=say('检查恢复状态','Check recovery status');retry.textContent=say('重新尝试更新','Try updating again');actions.append(check,retry);
  const label=document.createElement('label');label.className='check';label.id='update-recovery-confirm-label';
  const confirmation=document.createElement('input');confirmation.type='checkbox';confirmation.id='update-recovery-confirm';
  const text=document.createElement('span');text.textContent=say('我已在负责人协助下核对文件、暂存状态及备份，并完成项目要求；允许后续新操作。','With the project owner, I verified files, staging and backups and completed project requirements; allow new operations.');label.append(confirmation,text);
  const acknowledge=document.createElement('button');acknowledge.type='button';acknowledge.id='update-recovery-acknowledge';acknowledge.textContent=say('确认已恢复，解除操作限制','Confirm repair and unlock operations');
  box.append(title,help,backup,actions,label,acknowledge);document.getElementById('update-progress').after(box);
  let uncertain=false,receiptKey='';
  function render() {
    const current=state(),record=current?.beginnerReceipt;
    const failed=record?.action==='beginner-update'&&['blocked','needs-verification','running'].includes(record.state);
    box.hidden=isUpdating()||!uncertain&&!failed&&!current?.operationLocked;
    const key=record?.id+':'+record?.state+':'+current?.fingerprint;
    if(key!==receiptKey){confirmation.checked=false;receiptKey=key;}
    const can=ready()&&!isBusy()&&!!current,locked=!!current?.operationLocked;
    const safe=can&&!locked&&record?.retryable===true;
    check.disabled=isBusy()||!canRefresh();retry.hidden=!record?.retryable||uncertain||locked;
    retry.disabled=!safe||!current?.hooksReady||current?.incomplete||!!current?.fileRevertReceipt&&!['restored','acknowledged'].includes(current.fileRevertReceipt.state);
    const manual=can&&failed&&!record.retryable&&!uncertain&&!locked;
    label.hidden=acknowledge.hidden=!manual;confirmation.disabled=isBusy();
    acknowledge.disabled=!manual||!confirmation.checked||!current?.hooksReady||current?.incomplete||!!current?.fileRevertReceipt&&!['restored','acknowledged'].includes(current.fileRevertReceipt.state);
    backup.textContent=record?.stash?say('已保留的修改备份：','Retained changes backup: ')+record.stash:'';backup.hidden=!backup.textContent;
    title.textContent=uncertain?say('先核对上次更新结果','Verify the previous update result'):locked?say('项目操作尚未解锁','Project operation is still locked'):safe?say('更新失败，可以检查后重试','Update failed; check and retry'):say('更新中断，需要核对恢复','Update interrupted; verify recovery');
    if(uncertain)help.textContent=say('最终结果尚未确认。先检查实际状态；检查不会再次拉取、应用备份或修改文件。','The final result is unconfirmed. Check actual state first; checking does not fetch, apply a backup or change files.');
    else if(locked)help.textContent=say('项目仍被另一项操作占用，或上次意外中断后尚未解除。请等待完成后再检查；若持续如此，请负责人核对后台操作状态。检查不会自动解除限制或重放更新。','The project is in use by another operation, or remains locked after interruption. Check again when it finishes. If this persists, ask the owner to inspect background operations. Checking does not unlock or replay an update.');
    else if(record?.retryable)help.textContent=(record.step==='fetch'?errorHelp({code:record.failureCode,message:record.detail||record.message},english).message:record.message||'')+say(' 本次尚未改动本地文件。处理原因后点“重新尝试更新”，重新检查后再确认；不需要解除限制。',' No local files were changed. Fix the cause, then try updating again and confirm after a fresh check; no unlock is needed.');
    else help.textContent=say('上次可能已经备份、更新或取回了部分文件，不能直接重复拉取。请负责人依据操作详情和备份核对、恢复文件；完成后勾选下方确认并解除限制。解除只允许后续新操作，不会重放上次更新。','Files may have been backed up, updated or partially restored. Do not repeat the update. Ask the owner to verify and repair using operation details and backups, then confirm below. Unlocking only permits new operations; it does not replay the update.');
  }
  check.onclick=()=>perform(async()=>{confirmation.checked=false;await refresh();uncertain=false;render();});
  retry.onclick=()=>perform(async()=>{
    confirmation.checked=false;await refresh();uncertain=false;render();
    const current=state();if(!ready()||!current?.beginnerReceipt?.retryable||current.operationLocked)return;
    openUpdate();
  });
  confirmation.onchange=render;
  acknowledge.onclick=()=>perform(async()=>{
    const record=state()?.beginnerReceipt;if(!confirmation.checked||!record)return;
    await reviewedCall('beginner-acknowledge',{recordId:record.id,rulesConfirmed:true});
    await refresh();uncertain=false;render();
  });
  return {render,error(){uncertain=true;confirmation.checked=false;render();},checked(){uncertain=false;render();},clear(){uncertain=false;confirmation.checked=false;receiptKey='';box.hidden=true;}};
}
