export function changeLabel(status,english=false) {
  if(/U/.test(status)||['AA','DD'].includes(status)) return english?'Needs help':'需要协助';
  if(status==='??'||status.includes('A')) return english?'Added':'新增';
  if(status.includes('D')) return english?'Deleted':'删除';
  if(/[RC]/.test(status)) return english?'Renamed':'改名';
  return english?'Modified':'修改';
}
export function mountBeginner({state,ready,isBusy,call,refresh,perform,english=false}) {
  const $=id=>document.getElementById(id),say=(zh,en)=>english?en:zh;
  let mode='view',rendered='',renderedRoot='',selected=new Set();
  if(english) {
    const labels={'日常工作':'Daily work','基础':'Basic','我的项目':'My project','更新项目':'Update project','拿到团队最新内容':'Get the latest team version','查看我的改动':'View my changes','看这次改了哪些文件':'See changed files','提交我的修改':'Submit my changes','选文件，写一句说明':'Choose files and describe the change','重新检查':'Check again','这次改了什么？':'What changed?','用一句话说明':'Describe your change','如果团队要求这次修改先做验收或审批，我已经完成。':'I completed any tests or approvals required by the team for this change.','确认提交':'Confirm submission','先不操作':'Not now','操作详情（可交给项目负责人）':'Details for the project owner','本项目的提交要求（不确定请联系负责人）':'Project requirements (ask the owner if unsure)','更多工具（项目负责人）':'More tools (project owner)','我已核对上次操作，允许后续新操作':'I verified the previous operation; allow new operations'};
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){const text=node.textContent.trim();if(labels[text])node.textContent=node.textContent.replace(text,labels[text]);}
    $('beginner-summary').placeholder='For example: adjusted the character clothing colors';
  }
  function chosen(){return [...document.querySelectorAll('#beginner-files input:checked')].map(item=>item.value);}
  function update() {
    const current=state(),can=ready()&&!isBusy()&&!!current;
    for(const id of ['beginner-update','beginner-view','beginner-submit'])$(id).disabled=!can;
    const blocked=current && (!current.hooksReady || current.incomplete || current.beginnerReceipt && ['running','blocked','needs-verification'].includes(current.beginnerReceipt.state));
    $('beginner-confirm').disabled=!can || blocked || (mode==='submit' && (!chosen().length || !$('beginner-summary').value.trim() || (current.sources.length>0 && !$('beginner-manual').checked)));
    $('beginner-cancel').disabled=isBusy();
    if(isBusy())$('beginner-acknowledge').disabled=true;
    $('beginner-summary').disabled=isBusy();
    $('beginner-manual').disabled=isBusy();
    for(const box of document.querySelectorAll('#beginner-files input'))box.disabled=isBusy();
    if(isBusy())$('beginner-state').textContent=say('正在处理，请不要重复点击…','Working, please do not click again…');
  }
  function render() {
    const current=state();if(!current){update();return;}
    $('beginner-project').textContent=current.root.split(/[\\/]/).filter(Boolean).pop()||say('我的项目','My project');
    $('beginner-state').textContent=current.changes.length?say('有 '+current.changes.length+' 个文件尚未提交','You have '+current.changes.length+' unsubmitted files'):say('电脑里的修改已保存，没有待提交文件','No unsubmitted files on this computer');
    if(renderedRoot!==current.root) {selected.clear();rendered='';$('beginner-summary').value='';$('beginner-manual').checked=false;$('beginner-sheet').hidden=true;for(const box of document.querySelectorAll('#beginner-files input'))box.checked=false;}
    if(rendered!==current.fingerprint) {
      $('beginner-manual').checked=false;
      selected=new Set(chosen());$('beginner-files').replaceChildren();
      for(const item of current.changes) {
        const label=document.createElement('label'),check=document.createElement('input'),info=document.createElement('span'),tag=document.createElement('strong'),filename=document.createElement('span');
        label.className='check beginner-file';check.type='checkbox';check.value=item.path;check.checked=selected.has(item.path);check.setAttribute('aria-label',item.path);
        tag.textContent=changeLabel(item.status,english);filename.textContent=item.path;info.append(tag,filename);label.append(check,info);check.onchange=update;$('beginner-files').append(label);
      }
      rendered=current.fingerprint;renderedRoot=current.root;
    }
    $('beginner-rules').replaceChildren();
    for(const source of current.sources) {
      const detail=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('pre');
      title.textContent=source.path;body.textContent=source.content;detail.append(title,body);$('beginner-rules').append(detail);
    }
    const receipt=current.beginnerReceipt;
    let message='';
    if(!current.hooksReady)message=say('这个项目的提交检查还没有配置好。请联系项目负责人，你的文件没有被改动。','Project checks are not configured yet. Contact the project owner; your files are unchanged.');
    else if(current.incomplete)message=say('还不能完整确认团队规则，请让项目负责人核对后再操作。','Team rules could not be fully checked. Contact the project owner before continuing.');
    else if(receipt && receipt.state!=='acknowledged') message=receipt.message || say('上一次操作还需要核对，请联系项目负责人，不要重复提交。','The previous operation needs verification. Contact the project owner; do not submit again.');
    else message=say('更新不会覆盖未提交的修改；提交只包含你勾选的文件。','Updates preserve your unsubmitted work. Only selected files are submitted.');
    $('beginner-message').textContent=message;
    $('beginner-detail').textContent=receipt ? [receipt.message||'',receipt.completed?.join(' → ')||'',receipt.reviewUrl||'',receipt.templateNotice||'',receipt.detail||''].filter(Boolean).join('\n') : '';
    $('beginner-result-details').hidden=!receipt;
    $('beginner-acknowledge').disabled=!receipt || !['running','blocked','needs-verification'].includes(receipt.state);
    update();
  }
  function open(next) {
    mode=next;$('beginner-manual').checked=false;$('beginner-sheet').hidden=false;$('beginner-confirmation').hidden=false;$('beginner-confirm').hidden=next==='view';$('beginner-plan').hidden=next==='view';
    $('beginner-sheet-title').textContent=next==='update'?say('更新到团队最新内容','Get team updates'):say('这次改了什么？','What changed?');
    $('beginner-sheet-help').textContent=next==='update'?say('电脑里有未提交修改时会暂停，不会自动覆盖或丢弃。','Updates stop if you have unsubmitted changes; nothing is overwritten or discarded.'):say('只勾选这次要交给团队的文件，不要勾选别人的修改。','Select only the files you want to share. Do not include someone else’s work.');
    $('beginner-team-rules').hidden=next!=='submit'||!state()?.sources.length;$('beginner-files').hidden=next==='update';$('beginner-summary-label').hidden=next!=='submit';
    $('beginner-manual-label').hidden=next!=='submit'||!state()?.sources.length;
    $('beginner-plan').textContent=next==='update'?say('工具会安全获取团队版本；无法自动处理时会停止并说明。','The tool gets the team version safely and stops if assistance is required.'):say('正式版本不能直接修改。工具会先建立独立工作分支，运行项目检查，再上传送审；通过团队审核后才能合入。下方是本项目要求，拿不准请先联系负责人。','The tool creates a separate work branch, runs project checks and uploads for team review. It never commits directly to the primary branch or merges automatically. Check the project requirements below; ask the project owner if unsure.');
    $('beginner-confirm').textContent=next==='update'?say('确认更新','Confirm update'):say('确认提交','Confirm submission');
    update();
  }
  $('beginner-view').onclick=()=>open('view');$('beginner-submit').onclick=()=>open('submit');$('beginner-update').onclick=()=>open('update');
  $('beginner-summary').oninput=update;$('beginner-manual').onchange=update;
  $('beginner-cancel').onclick=()=>{$('beginner-sheet').hidden=true;};
  $('beginner-confirm').onclick=()=>perform(async()=>{
    const current=state(),action=mode==='update'?'beginner-update':'beginner-submit';
    const result=await call(action,{token:current.token,operationId:crypto.randomUUID(),paths:chosen(),summary:$('beginner-summary').value.trim(),rulesConfirmed:mode==='update'||!current.sources.length||$('beginner-manual').checked});
    $('beginner-sheet').hidden=true;$('beginner-manual').checked=false;
    await refresh();$('beginner-message').textContent=result.message||say('操作结果需要核对。','Please verify the operation result.');
    if(result.state==='awaiting-review'||result.state==='review-draft')$('beginner-summary').value='';
  });
  $('beginner-acknowledge').onclick=()=>perform(async()=>{
    if(!$('git-confirm').checked)throw new Error('请先核对实际项目状态，再勾选上方确认项。');
    await call('beginner-acknowledge',{token:state().token,recordId:state().beginnerReceipt.id,rulesConfirmed:true});await refresh();
  });
  function error(problem) {
    const messages={STALE_REVIEW:'文件或项目规则已经变化。请点“重新检查”，再选择要提交的内容。',HOOKS_NOT_READY:'项目的提交检查还没配置好，请联系项目负责人。文件没有被提交或上传。',NOT_PROJECT_ROOT:'请选择已有项目的最外层文件夹。',RULE_DISCOVERY_INCOMPLETE:'还不能完整确认团队规则，请联系项目负责人。',CONFIG_CONFLICT:'选择的项目发生了变化，请重新打开项目后再试。',RESPONSE_UNCONFIRMED:'操作结果还没确认。请点“重新检查”核对，不要再次提交。'};
    $('beginner-message').textContent=messages[problem.code]||problem.message||'操作未完成，请联系项目负责人。';
    $('beginner-detail').textContent=(problem.code||'')+'\n'+problem.message;$('beginner-result-details').hidden=false;
  }
  update();return {render,update,error};
}
