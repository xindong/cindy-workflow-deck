import {errorHelp} from './error-help.js';
export function mountStashRestore({state,ready,isBusy,call,perform,reviewedCall,refresh,canRefresh=ready,english=false}) {
  const $=id=>document.getElementById(id),say=(zh,en)=>english?en:zh,node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const restore=node('button',say('取回整条记录到本地…','Restore this stash locally…'));restore.id='stash-restore';restore.type='button';restore.hidden=true;$('stash-file-title').after(restore);
  const dialog=node('dialog');dialog.id='stash-restore-dialog';dialog.className='file-dialog';
  const title=node('h3',say('取回这条暂存记录？','Restore this stash?')),help=node('p'),list=node('pre'),rules=node('details'),summary=node('summary',say('本项目适用规则','Applicable project rules')),ruleBody=node('pre');rules.append(summary,ruleBody);
  const label=node('label');label.className='check';const checked=node('input');checked.type='checkbox';checked.id='stash-restore-rules';label.append(checked,node('span',say('我已核对项目规则，完成取回所需的人工前提。','I reviewed project rules and completed required prerequisites.')));
  const actions=node('div');actions.className='row';const confirm=node('button',say('确认取回，保留原记录','Restore and keep the stash')),cancel=node('button',say('取消','Cancel'));confirm.id='stash-restore-confirm';cancel.id='stash-restore-cancel';confirm.type=cancel.type='button';actions.append(confirm,cancel);dialog.append(title,help,list,rules,label,actions);document.body.append(dialog);
  const status=node('p');status.id='stash-restore-status';status.setAttribute('role','status');restore.after(status);
  const details=node('details'),detailsTitle=node('summary',say('操作详情','Technical details')),detailBody=node('pre');details.hidden=true;details.append(detailsTitle,detailBody);status.after(details);
  const recovery=node('section');recovery.className='beginner-sheet';recovery.id='stash-restore-recovery';recovery.hidden=true;
  const recoveryTitle=node('h3',say('核对上次暂存取回','Verify the previous stash restore')),recoveryText=node('p'),checkResult=node('button',say('检查取回结果','Check restore result')),ackLabel=node('label'),ackCheck=node('input'),ack=node('button',say('确认已恢复，解除操作限制','Confirm recovery and unlock'));
  checkResult.id='stash-restore-check';ack.id='stash-restore-acknowledge';ackCheck.type='checkbox';ackCheck.id='stash-restore-verified';ackLabel.className='check';ackLabel.append(ackCheck,node('span',say('已核对实际文件、暂存区及备份，并完成项目要求。','I verified actual files, the index and backups, and met project requirements.')));checkResult.type=ack.type='button';recovery.append(recoveryTitle,recoveryText,checkResult,ackLabel,ack);$('beginner-message').before(recovery);
  let entry,pending,generation=0,uncertain=false,operation='',recordKey='';
  const active=(n,root)=>n===generation&&ready()&&state()?.root===root;
  const report=error=>{const h=errorHelp(error,english);status.textContent=h.message;detailBody.textContent=h.detail;details.hidden=!h.detail;};
  const clear=()=>{pending=undefined;dialog.close();};
  cancel.onclick=clear;dialog.addEventListener('cancel',()=>{pending=undefined;});checked.onchange=()=>{confirm.disabled=!!pending?.requiresRules&&!checked.checked;};
  restore.onclick=()=>{
    if(!entry||!ready()||isBusy())return;const selected=entry,n=generation,root=state().root;
    return perform(async()=>{
      details.hidden=true;status.textContent=say('正在隔离预检，原项目文件不会改动…','Checking in an isolated copy; original files stay unchanged…');
      try {
        await refresh();if(!active(n,root))return;
        const result=await call('stash-restore-preview',{stashId:selected.id});if(!active(n,root)||entry?.id!==selected.id)return;
        pending={...result,root};checked.checked=false;confirm.disabled=result.requiresRules;label.hidden=rules.hidden=!result.requiresRules;
        help.textContent=selected.ref+' · '+selected.id+'\n'+say('预检通过。取回下列全部文件及记录中的暂存状态。先备份本地文件和暂存区，再尝试合并；不会切换分支、删除原 Stash、提交或上传。','Preflight passed. Restore all listed files and saved staged state. Back up local files and index, then attempt the merge; no branch switch, stash deletion, commit or push.');
        list.textContent=result.files.map(f=>f.status+' '+f.path).join('\n');ruleBody.textContent=state().sources.map(s=>s.path+'\n'+s.content).join('\n\n');
        status.textContent=say('预检通过，等待确认。','Preflight passed; awaiting confirmation.');dialog.showModal();
      } catch(error){if(n===generation)report(error);if(error.code==='CONFIG_CONFLICT')throw error;}
    });
  };
  confirm.onclick=()=>{
    const choice=pending;if(!choice||choice.requiresRules&&!checked.checked)return;clear();
    const n=generation;operation=crypto.randomUUID();const id=operation;
    return perform(async()=>{
      status.textContent=say('正在备份并取回，请勿重复操作…','Backing up and restoring; do not repeat…');details.hidden=true;
      try {
        if(!active(n,choice.root)||state().fingerprint!==choice.fingerprint)throw Object.assign(new Error('文件或项目已经变化，请重新预检。'),{code:'STALE_REVIEW'});
        const result=await reviewedCall('stash-restore',{operationId:id,stashId:choice.entry.id,confirmStashId:choice.entry.id,previewFingerprint:choice.fingerprint,rulesConfirmed:true});
        if(n!==generation)return;uncertain=result.state!=='restored';
        await refresh();if(active(n,choice.root)){status.textContent=result.message;detailBody.textContent=(result.detail||'')+'\n'+say('备份：','Backup: ')+result.backup;details.hidden=false;}
      } catch(error) {
        if(n!==generation)return;
        uncertain=!['STALE_REVIEW','RULE_REVIEW_REQUIRED','HOOKS_NOT_READY','STASH_RESTORE_CONFLICT','STASH_CHANGED','STASH_CONFIRMATION_REQUIRED','STASH_ALREADY_RESTORED','STASH_BACKUP_SPACE','EMPTY_STASH','INVALID_REQUEST','UNSUPPORTED_FILE','UNSAFE_BACKUP','DETACHED_HEAD','PREVIOUS_OPERATION_PENDING','STASH_RESTORE_UNCONFIRMED','AI_REPAIR_PENDING','OPERATION_LOCKED','CONFIG_CONFLICT'].includes(error.code);report(error);
        try {await refresh();const record=state()?.stashRestoreReceipt;if(record?.id===id&&record.state==='restored'&&active(n,choice.root)){uncertain=false;status.textContent=say('已核对：这条记录已取回，未重复执行；原 Stash 仍保留。','Verified: this stash was restored without repeating the operation; the stash is retained.');}}
        catch(checkError){if(n===generation)status.textContent+=say(' 状态读取未完成，请点击“检查取回结果”。',' State check failed; click Check restore result.');}
        if(error.code==='CONFIG_CONFLICT')throw error;
      }
    });
  };
  checkResult.onclick=()=>perform(async()=>{
    try {await refresh();const record=state()?.stashRestoreReceipt;
      if(record?.id===operation&&['restored','acknowledged'].includes(record.state))uncertain=false;
      status.textContent=record?.message||say('已读取项目状态；未重复取回。请核对操作锁和实际文件。','Project state checked; restore was not repeated. Verify operation locks and actual files.');
    }catch(error){report(error);}
  });
  ackCheck.onchange=update;
  ack.onclick=()=>{
    const record=state()?.stashRestoreReceipt;if(!record||!ackCheck.checked||!ready()||isBusy())return;
    return perform(async()=>{try {await reviewedCall('stash-restore-acknowledge',{recordId:record.id,confirmed:true,rulesConfirmed:true});uncertain=false;await refresh();status.textContent=say('已记录核对，仅解除后续操作限制，未重复取回。','Verification recorded; future operations unlocked without repeating restore.');}catch(error){report(error);}});
  };
  function update() {
    const current=state(),record=current?.stashRestoreReceipt,blocked=record&&!['restored','acknowledged'].includes(record.state),key=record?.id+':'+record?.state+':'+current?.fingerprint;
    if(key!==recordKey){ackCheck.checked=false;recordKey=key;}
    restore.disabled=!ready()||isBusy()||uncertain||blocked||!!current?.aiRepair||current?.operationLocked||current?.pendingGit||!current?.hooksReady||current?.incomplete;
    recovery.hidden=!blocked&&!uncertain;
    recoveryText.textContent=(record?.message||say('上次取回结果待核对，请先检查，不要再次取回。','The last restore needs verification. Check before restoring again.'))+(record?.backup?'\n'+say('备份：','Backup: ')+record.backup:'');
    checkResult.disabled=isBusy()||!canRefresh();ackLabel.hidden=ack.hidden=!blocked;ackCheck.disabled=isBusy();
    ack.disabled=!ready()||isBusy()||!ackCheck.checked||!!current?.aiRepair||current?.operationLocked||current?.pendingGit||!current?.hooksReady||current?.incomplete;
  }
  return {select:selected=>{entry=selected;restore.hidden=false;status.textContent='';details.hidden=true;update();},clear:()=>{entry=undefined;restore.hidden=true;clear();},update,invalidate:()=>{generation++;entry=undefined;restore.hidden=true;clear();uncertain=false;status.textContent='';details.hidden=true;recovery.hidden=true;}};
}
