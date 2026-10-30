import {errorHelp} from './error-help.js';
// Checking is read-only. Continuing always opens a fresh user confirmation.
export function createUpdateRecovery({state,ready,isBusy,isUpdating=()=>false,canRefresh,perform,refresh,reviewedCall,openUpdate,repair,english=false}) {
  const say=(zh,en)=>english?en:zh;
  const node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const box=node('section');box.id='update-recovery';box.hidden=true;
  const title=node('h3'),help=node('p'),backup=node('p');help.id='update-recovery-help';backup.id='update-recovery-backup';
  const actions=node('div');actions.className='row';
  const check=node('button',say('检查恢复状态','Check recovery status')),retry=node('button',say('重新尝试更新','Try updating again')),assist=node('button',say('AI 协助处理…','AI-assisted repair…')),resume=node('button',say('处理后检查并继续','Check and continue after repair'));
  check.id='update-recovery-check';retry.id='update-recovery-retry';assist.id='conflict-assist';resume.id='conflict-continue';actions.append(assist,resume,check,retry);
  const details=node('details'),summary=node('summary',say('恢复详情','Recovery details')),explanation=node('p');details.append(summary,explanation,backup);
  const label=node('label');label.className='check';label.id='update-recovery-confirm-label';
  const confirmation=node('input');confirmation.type='checkbox';confirmation.id='update-recovery-confirm';
  const text=node('span',say('已核对文件与备份，完成项目要求。','Files, backups and project requirements verified.'));label.append(confirmation,text);
  const acknowledge=node('button',say('确认已恢复，解除操作限制','Confirm repair and unlock operations'));acknowledge.id='update-recovery-acknowledge';
  const status=node('p');status.id='conflict-status';status.setAttribute('role','status');
  const repairLabel=node('label');repairLabel.className='check';repairLabel.id='conflict-verify-label';
  const repairConfirm=node('input');repairConfirm.type='checkbox';repairConfirm.id='conflict-verify';
  repairLabel.append(repairConfirm,node('span',say('已到任务列表确认 AI 任务已停止或结束，并核对文件、备份与项目要求。','I verified in the task list that AI stopped or finished, and checked files, backups and project requirements.')));
  const repairAck=node('button',say('确认任务已结束，解除 AI 处理限制','Confirm task ended and release AI restriction'));repairAck.id='conflict-acknowledge';repairAck.type='button';
  const dispositionLabel=node('label',say('确认处理结果','Confirm outcome')),disposition=node('select');disposition.id='stash-repair-disposition';disposition.append(new Option(say('本条已完整取回或合并','Fully restored or merged'),'restored'),new Option(say('本地未改动，取消本次取回','Local state unchanged; cancel restore'),'cancelled'));dispositionLabel.append(disposition);dispositionLabel.hidden=true;
  const dialog=node('dialog');dialog.id='conflict-dialog';
  const heading=node('h3',say('AI 协助处理冲突','AI-assisted conflict repair'));
  const info=node('p',say('同一项目复用一个处理任务，在任务列表中交互，可能产生模型费用。遇到保留哪方、覆盖等选择，AI 会先询问你。','Actions for this project reuse one task and may incur model costs. AI will ask before choosing sides or overwriting changes.'));
  const strategyLabel=node('label',say('处理方式','Approach')),strategy=node('select');strategy.id='conflict-strategy';strategy.append(new Option(say('逐项询问我（推荐）','Ask me at each decision (recommended)'),'ask'),new Option(say('我先说明处理要求','I will provide instructions'),'instructions'));strategyLabel.append(strategy);
  const instructionsLabel=node('label',say('补充说明（可选）','Instructions (optional)')),instructions=node('textarea');instructions.id='conflict-instructions';instructions.rows=3;instructions.maxLength=1000;instructions.placeholder=say('例如：保留我的美术文件，其它冲突逐项询问。','For example: keep my art files; ask about other conflicts.');instructionsLabel.append(instructions);
  const send=node('button',say('确认，开始处理','Start repair')),cancel=node('button',say('取消','Cancel'));send.id='conflict-send';cancel.id='conflict-cancel';
  dialog.append(heading,info,strategyLabel,instructionsLabel,send,cancel);
  for(const button of [check,retry,assist,resume,acknowledge,send,cancel])button.type='button';
  box.append(title,help,actions,status,dispositionLabel,repairLabel,repairAck,label,acknowledge,details,dialog);document.getElementById('update-progress').after(box);
  let uncertain=false,receiptKey='',problemCode='',repairRecord,repairing=false,generation=0,stashTarget;
  const conflict=()=>{const record=state()?.beginnerReceipt;return !!stashTarget||['UPDATE_CONFLICT','UPDATE_DIVERGED','PROJECT_CONFLICT'].includes(['blocked','needs-verification','running'].includes(record?.state)?record.failureCode||problemCode:problemCode)||state()?.pendingGit===true;};
  function showRepair(record) {
    if(record&&!['running','uncertain','done','failed','rejected','acknowledged'].includes(record.state))throw new Error(say('处理任务状态暂不可读，请到任务列表核对。','Repair status unavailable; check the task list.'));
    if(record?.id!==repairRecord?.id||record?.state!==repairRecord?.state){repairConfirm.checked=false;disposition.value='restored';}
    repairRecord=record;
    if(record?.kind==='stash')stashTarget=record.state==='acknowledged'?undefined:{id:record.stashId,ref:record.stashRef};
    status.textContent=!record?'':record.state==='acknowledged'?say('已记录人工核对，旧任务不会重放；请重新检查项目后继续。','Manual verification recorded; the old task will not replay. Check the project to continue.'):record.unverified?say('处理结果待核对，请到任务列表查看。','Repair result unverified; check the task list.'):record.state==='running'?say('处理请求已受理，请在同一项目处理任务中回答 AI；完成后点击“处理后检查并继续”。','Repair accepted. Answer AI in the same project task, then check and continue.'):record.state==='done'?say('AI 已结束本次处理，请检查实际项目后继续。','AI finished this attempt. Verify the project before continuing.'):record.state==='rejected'?say('本次处理未启动，请检查插件的任务模型和权限设置后再试。','Request rejected. Check plugin model and permissions before retrying.'):say('处理结果待核对，请到任务列表查看；未重复创建任务。','Repair is unverified. Check the task list; no duplicate was created.');
  }
  function render() {
    const current=state(),record=current?.beginnerReceipt;
    const failed=['beginner-update','beginner-submit'].includes(record?.action)&&['blocked','needs-verification','running'].includes(record.state);
    const hasConflict=conflict();
    const stashMode=!!stashTarget||repairRecord?.kind==='stash';
    resume.textContent=stashMode?say('检查取回处理结果','Check stash restore result'):say('处理后检查并继续','Check and continue after repair');
    text.textContent=stashMode?say('已核对这条 Stash 的全部文件已取回或正确合并，原有修改、暂存状态及备份无遗漏。','I verified every file in this stash was restored or merged, with original changes, index state and backups accounted for.'):say('已核对文件与备份，完成项目要求。','Files, backups and project requirements verified.');
    repairLabel.querySelector('span').textContent=stashMode?(disposition.value==='cancelled'?say('已确认 AI 任务停止或结束，本地文件和暂存区未改动，取消本次取回。','AI has stopped or ended, local files and index are unchanged; cancel this restore.'):say('已确认 AI 任务停止或结束，并核对本条 Stash 已完整取回、原有修改和暂存状态及备份。','AI has stopped or ended; I verified this stash was fully restored, original changes, staged state and backups.')):say('已到任务列表确认 AI 任务已停止或结束，并核对文件、备份与项目要求。','I verified in the task list that AI stopped or finished, and checked files, backups and project requirements.');
    box.hidden=isUpdating()||!uncertain&&!failed&&!current?.operationLocked&&!hasConflict&&!repairRecord;
    const key=record?.id+':'+record?.state+':'+current?.fingerprint;
    if(key!==receiptKey){confirmation.checked=false;receiptKey=key;}
    const can=ready()&&!isBusy()&&!!current,locked=!!current?.operationLocked;
    const repairPending=!!current?.aiRepair||['running','uncertain'].includes(repairRecord?.state)||repairRecord?.unverified;
    dispositionLabel.hidden=!stashMode||!repairPending;disposition.disabled=isBusy()||repairing;
    const safe=can&&!locked&&!repairPending&&record?.retryable===true;
    repairLabel.hidden=repairAck.hidden=!repairPending;repairConfirm.disabled=isBusy()||repairing;
    repairAck.disabled=!can||locked||repairing||!repairConfirm.checked||!repairRecord||current?.pendingGit||!current?.hooksReady||current?.incomplete;
    check.disabled=isBusy()||!canRefresh()||repairing;retry.hidden=!record?.retryable||uncertain||locked||hasConflict;
    retry.disabled=!safe||!current?.hooksReady||current?.incomplete||!!current?.fileRevertReceipt&&!['restored','acknowledged'].includes(current.fileRevertReceipt.state);
    assist.hidden=!hasConflict&&!repairRecord||stashMode&&repairRecord?.state==='acknowledged';resume.hidden=!hasConflict&&!repairRecord;
    assist.disabled=isBusy()||repairing||!canRefresh()||locked||repair?.available===false||repairPending;
    resume.disabled=check.disabled;
    const manual=can&&failed&&!record.retryable&&!uncertain&&!locked&&!repairPending;
    label.hidden=acknowledge.hidden=!manual;confirmation.disabled=isBusy();
    acknowledge.disabled=!manual||!confirmation.checked||current?.pendingGit||!current?.hooksReady||current?.incomplete||!!current?.fileRevertReceipt&&!['restored','acknowledged'].includes(current.fileRevertReceipt.state);
    backup.textContent=record?.stash?say('修改备份：','Changes backup: ')+record.stash:'';backup.hidden=!backup.textContent;
    title.textContent=stashMode?(repairRecord?.state==='acknowledged'?say('Stash 取回已核对','Stash restore verified'):say('Stash 取回冲突','Stash restore conflict')):hasConflict?say('有冲突，需要处理后继续','Resolve conflicts to continue'):uncertain?say('先核对上次操作结果','Verify the previous operation'):locked?say('等待项目操作结束','Wait for the project operation'):safe?say('检查后可重试更新','Check, then retry update'):say('核对上次操作','Verify the previous operation');
    if(hasConflict)help.textContent=repair?.available===false?say('请负责人协助处理，然后点击检查。AI 修复可在 Cindy 插件中使用。','Ask the owner to repair, then check. AI repair is available in Cindy.'):say('让 AI 引导你处理，完成后检查并继续。','Let AI guide the repair, then check and continue.');
    else if(uncertain)help.textContent=say('先检查实际结果，检查不会重复操作。','Check actual results; this does not repeat the operation.');
    else if(locked)help.textContent=say('操作仍在进行或需要负责人核对，请稍后检查。','An operation is active or needs owner verification. Check again later.');
    else if(record?.retryable)help.textContent=say('本地文件未改动。处理原因后重新尝试。','Local files are unchanged. Fix the cause, then retry.');
    else help.textContent=say('核对文件与备份，确认恢复后再继续。','Verify files and backups before continuing.');
    explanation.textContent=record?.message||'';
    if(record?.failureCode)explanation.textContent+=' '+errorHelp({code:record.failureCode,message:record.detail||record.message},english).message;
  }
  async function inspect() {
    confirmation.checked=false;await refresh();uncertain=false;render();
    if(repair?.available!==false&&repair?.call&&(conflict()||repairRecord)) {
      const epoch=generation;
      try {const record=await repair.call('conflict-read',{});if(epoch===generation){showRepair(record);await refresh();render();}}catch(error){if(epoch===generation)status.textContent=errorHelp(error,english).message;}
    }
  }
  check.onclick=()=>perform(inspect);
  resume.onclick=()=>perform(async()=>{
    await inspect();const current=state();
    if(!ready()||current?.pendingGit||current?.operationLocked)return;
    if(['running','uncertain'].includes(repairRecord?.state)||repairRecord?.unverified){status.textContent=say('请先到任务列表核对 AI 任务已结束，再检查继续。','Verify the AI task has ended in the task list before continuing.');return;}
    if(repairRecord?.stashOutcome==='cancelled'){status.textContent=say('本轮取回已取消，原 Stash 保留；可重新预检后选择处理，不会重放旧请求。','This restore was cancelled; the stash is retained. Preflight again to choose an action; the old request will not replay.');return;}
    if(stashTarget||repairRecord?.kind==='stash'){status.textContent=say('已检查。请核对本条全部文件、原有修改和暂存状态；AI 任务结束后勾选确认取回完成。若下方取回恢复卡仍待核对，再确认解除其限制。不要再次整条取回。','Checked. Verify all stash files, original changes and index state, then confirm restore completion after the AI task ends. If the restore recovery card is pending, verify and acknowledge it too. Do not apply the whole stash again.');return;}
    // Retryable preflight must run again; absence of worktree U does not prove
    // that an isolated rehearsal conflict has been resolved.
    if(current?.beginnerReceipt?.retryable||!current?.beginnerReceipt||['acknowledged','updated'].includes(current.beginnerReceipt.state))openUpdate();
    else status.textContent=say('请先核对文件和备份，再确认解除操作限制。','Verify files and backups, then confirm the repair below.');
  });
  retry.onclick=()=>perform(async()=>{await inspect();const current=state();if(ready()&&current?.beginnerReceipt?.retryable&&!current.operationLocked)openUpdate();});
  function openDialog(){heading.textContent=stashTarget?say('AI 协助解决冲突并取回 Stash','AI-assisted stash conflict restore'):say('AI 协助处理冲突','AI-assisted conflict repair');info.textContent=stashTarget?say('在同一项目任务中解决冲突并完成本条取回，可能产生模型费用；先备份，文本优先合并，取舍会询问你，原记录保留。记录：','Resolve conflicts and complete this stash restore in the same project task; model costs may apply. Back up first, merge text, ask about decisions and retain the stash. Entry: ')+stashTarget.ref+' · '+stashTarget.id:say('同一项目复用一个处理任务，在任务列表中交互，可能产生模型费用。遇到保留哪方、覆盖等选择，AI 会先询问你。','Actions for this project reuse one task and may incur model costs. AI will ask before choosing sides or overwriting changes.');dialog.showModal();}
  assist.onclick=openDialog;cancel.onclick=()=>dialog.close();
  send.onclick=async()=>{
    if(repairing||!repair?.call)return;const epoch=generation;repairing=true;send.disabled=cancel.disabled=true;render();
    try {const record=await repair.call('conflict-start',{operationId:crypto.randomUUID(),strategy:strategy.value,instructions:instructions.value.trim(),...(stashTarget?{kind:'stash',stashId:stashTarget.id}:{})});if(epoch===generation){showRepair(record);dialog.close();await refresh();}}
    catch(error){if(epoch===generation){status.textContent=errorHelp(error,english).message;dialog.close();}}
    finally {repairing=false;send.disabled=cancel.disabled=false;render();}
  };
  confirmation.onchange=render;
  repairConfirm.onchange=render;
  disposition.onchange=()=>{repairConfirm.checked=false;render();};
  repairAck.onclick=()=>perform(async()=>{
    const epoch=generation,id=repairRecord?.id;if(!repairConfirm.checked||!id)return;
    const record=await repair.call('conflict-acknowledge',{recordId:id,confirmed:true,...(repairRecord?.kind==='stash'?(disposition.value==='cancelled'?{stashCancelled:true}:{stashRestored:true}):{})});
    if(epoch!==generation)return;showRepair(record);await refresh();render();
  });
  acknowledge.onclick=()=>perform(async()=>{
    const record=state()?.beginnerReceipt;if(!confirmation.checked||!record)return;
    await reviewedCall('beginner-acknowledge',{recordId:record.id,rulesConfirmed:true});
    await refresh();uncertain=false;render();
  });
  return {forUpdate(){if(!state()?.aiRepair&&!['running','uncertain'].includes(repairRecord?.state)){stashTarget=undefined;if(repairRecord?.kind==='stash')repairRecord=undefined;render();}},assistStash(entry){stashTarget={id:entry.id,ref:entry.ref};render();openDialog();},isPending:()=>repairing||['running','uncertain'].includes(repairRecord?.state)||!!repairRecord?.unverified,render,error(problem){uncertain=true;problemCode=problem?.code||'';confirmation.checked=false;render();},checked(){uncertain=false;if(!state()?.pendingGit)problemCode='';if(state()?.aiRepair&&!repairRecord)showRepair(state().aiRepair);if(!state()?.aiRepair&&!['running','uncertain'].includes(repairRecord?.state)&&['updated','awaiting-review','review-draft'].includes(state()?.beginnerReceipt?.state)){repairRecord=undefined;status.textContent='';}render();},clear(){generation++;uncertain=false;problemCode='';repairRecord=undefined;stashTarget=undefined;status.textContent='';confirmation.checked=repairConfirm.checked=false;receiptKey='';dialog.close();box.hidden=true;}};
}
