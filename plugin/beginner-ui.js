import { errorHelp } from './error-help.js';
import { createUpdateProgress } from './update-progress.js';
import { createFileFilter } from './file-filter.js';
import { createFileActions } from './file-actions.js';
export function changeLabel(status,english=false) {
  if(/U/.test(status)||['AA','DD'].includes(status)) return english?'Needs help':'需要协助';
  if(status==='??'||status.includes('A')) return english?'Added':'新增';
  if(status.includes('D')) return english?'Deleted':'删除';
  if(/[RC]/.test(status)) return english?'Renamed':'改名';
  return english?'Modified':'修改';
}
export function mountBeginner({state,ready,isBusy,call,refresh,perform,reviewedCall=call,canRefresh=ready,english=false}) {
  const $=id=>document.getElementById(id),say=(zh,en)=>english?en:zh;
  const progress=createUpdateProgress({call,english});
  const fileActions=createFileActions({state,ready,isBusy,call,perform,reviewedCall,refresh,english});
  const filter=createFileFilter({state,english,onChange:()=>{$('beginner-manual').checked=false;update();},onRestore:items=>fileActions.askRestoreMany(items)});
  let mode='view',rendered='',renderedRoot='',selected=new Set(),issueRows=[],issueLoading=false,issueGeneration=0,checkingChanges=false,changesGeneration=0;
  if(english) {
    const labels={'全选':'Select all','全不选':'Select none','关联 GitHub 事项（Issue）':'Link a GitHub issue','事项范围':'Issue filter','分配给我的':'Assigned to me','我创建的':'Created by me','加载我的事项':'Load my issues','对应事项':'Related issue','暂不关联':'No issue selected','只读取当前项目、当前 GitHub 账号的未关闭事项；关联不会自动关闭事项。':'Only open issues in this project for the current GitHub account. Linking does not close issues.','日常工作':'Daily work','基础':'Basic','我的项目':'My project','更新项目':'Update project','拿到团队最新内容':'Get the latest team version','查看我的改动':'View my changes','看这次改了哪些文件':'See changed files','提交我的修改':'Submit my changes','选文件，写一句说明':'Choose files and describe the change','重新检查':'Check again','这次改了什么？':'What changed?','用一句话说明':'Describe your change','如果团队要求这次修改先做验收或审批，我已经完成。':'I completed any tests or approvals required by the team for this change.','确认提交':'Confirm submission','先不操作':'Not now','操作详情（可交给项目负责人）':'Details for the project owner','本项目的提交要求（不确定请联系负责人）':'Project requirements (ask the owner if unsure)','更多工具（项目负责人）':'More tools (project owner)','我已核对上次操作，允许后续新操作':'I verified the previous operation; allow new operations'};
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){const text=node.textContent.trim();if(labels[text])node.textContent=node.textContent.replace(text,labels[text]);}
    $('beginner-summary').placeholder='For example: adjusted the character clothing colors';
  }
  function chosen(){return [...document.querySelectorAll('#beginner-files input:checked')].map(item=>item.value);}
  function update() {
    const current=state(),can=ready()&&!isBusy()&&!!current;
    for(const id of ['beginner-update','beginner-view','beginner-submit'])$(id).disabled=!can;
    const blocked=current && (!current.hooksReady || current.incomplete || current.fileRevertReceipt&&!['restored','acknowledged'].includes(current.fileRevertReceipt.state) || current.beginnerReceipt && !current.beginnerReceipt.retryable && ['running','blocked','needs-verification'].includes(current.beginnerReceipt.state));
    $('beginner-confirm').disabled=!can || blocked || issueLoading || (mode==='submit' && (!chosen().length || chosen().length>200 || !$('beginner-summary').value.trim() || (current.sources.length>0 && !$('beginner-manual').checked)));
    const total=current?.changes.length||0,count=chosen().length;
    $('beginner-refresh-changes').disabled=isBusy()||!canRefresh();
    $('beginner-refresh-changes').textContent=checkingChanges?say('正在比对…','Checking…'):say('刷新改动','Refresh changes');
    const visible=filter.visible().length;filter.update(can,blocked);
    $('beginner-all').disabled=!can||!visible||count===visible;
    $('beginner-none').disabled=!can||!count;
    $('beginner-selected').textContent=say('已选 '+count+' / '+total+' 个文件',count+' / '+total+' files selected')+say(' · 显示 '+visible+' 个',' · '+visible+' shown')+(count>200?say('（一次最多提交200个，请分批选择）',' (up to 200 files per submission)'):'');
    $('beginner-issue-load').disabled=!can||issueLoading;
    $('beginner-issue-scope').disabled=!can||issueLoading;
    $('beginner-issue').disabled=!can||issueLoading;
    $('beginner-cancel').disabled=isBusy();
    if(isBusy())$('beginner-acknowledge').disabled=true;
    $('beginner-summary').disabled=isBusy();
    $('beginner-manual').disabled=isBusy();
    for(const box of document.querySelectorAll('#beginner-files input'))box.disabled=isBusy();
    fileActions.update();
    if(progress.isRunning()) {
      $('beginner-message').textContent='';$('beginner-message').dataset.quiet='true';
      $('beginner-result-details').hidden=true;
    }
    if(isBusy())$('beginner-state').textContent=say('正在处理，请不要重复点击…','Working, please do not click again…');
    else if(!current)$('beginner-state').textContent=say('状态待检查，请点“重新检查”。','Status needs checking. Click Check again.');
  }
  function render() {
    const current=state();if(!current){update();return;}
    $('beginner-project').textContent=current.root.split(/[\\/]/).filter(Boolean).pop()||say('我的项目','My project');
    $('beginner-state').textContent=current.changes.length?say('有 '+current.changes.length+' 个文件尚未提交','You have '+current.changes.length+' unsubmitted files'):say('电脑里的修改已保存，没有待提交文件','No unsubmitted files on this computer');
    if(renderedRoot!==current.root) {filter.reset();selected.clear();clearIssues();rendered='';$('beginner-summary').value='';$('beginner-manual').checked=false;$('beginner-sheet').hidden=true;for(const box of document.querySelectorAll('#beginner-files input'))box.checked=false;}
    if(rendered!==current.fingerprint) {
      $('beginner-manual').checked=false;
      selected=new Set(chosen());$('beginner-files').replaceChildren();
      for(const item of current.changes) {
        const check=document.createElement('input');check.type='checkbox';check.value=item.path;check.checked=selected.has(item.path);check.setAttribute('aria-label',item.path);
        fileActions.append($('beginner-files'),item,check).textContent=changeLabel(item.status,english);check.onchange=()=>{$('beginner-manual').checked=false;update();};
      }
      filter.render();rendered=current.fingerprint;renderedRoot=current.root;
    }
    $('beginner-rules').replaceChildren();
    for(const source of current.sources) {
      const detail=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('pre');
      title.textContent=source.path;body.textContent=source.content;detail.append(title,body);$('beginner-rules').append(detail);
    }
    const receipt=current.beginnerReceipt?.state==='acknowledged' ? null : current.beginnerReceipt;
    let message='';
    if(!current.hooksReady)message=say('这个项目的提交检查还没有配置好。请联系项目负责人，你的文件没有被改动。','Project checks are not configured yet. Contact the project owner; your files are unchanged.');
    else if(current.incomplete)message=say('还不能完整确认团队规则，请让项目负责人核对后再操作。','Team rules could not be fully checked. Contact the project owner before continuing.');
    else if(receipt && receipt.state!=='acknowledged') message=receipt.message || say('上一次操作还需要核对，请联系项目负责人，不要重复提交。','The previous operation needs verification. Contact the project owner; do not submit again.');
    else message=say('更新不会覆盖未提交的修改；提交只包含你勾选的文件。','Updates preserve your unsubmitted work. Only selected files are submitted.');
    $('beginner-message').textContent=message;
    $('beginner-message').dataset.quiet=String(current.hooksReady && !current.incomplete && (!receipt || receipt.state==='acknowledged'));
    $('beginner-detail').textContent=receipt ? [receipt.message||'',receipt.completed?.join(' → ')||'',receipt.reviewUrl||'',receipt.issue?say('关联事项：','Related issue: ')+receipt.issue.url:'',receipt.templateNotice||'',receipt.stash?say('安全备份：','Safety backup: ')+receipt.stash:'',receipt.detail||''].filter(Boolean).join('\n') : '';
    $('beginner-result-details').hidden=!receipt;
    $('beginner-acknowledge').disabled=!receipt || !['running','blocked','needs-verification'].includes(receipt.state);
    update();
  }
  function open(next) {
    if(next!=='submit'&&issueLoading)clearIssues();
    mode=next;$('beginner-manual').checked=false;$('beginner-sheet').hidden=false;$('beginner-confirmation').hidden=false;$('beginner-confirm').hidden=next==='view';$('beginner-plan').hidden=next==='view';
    $('beginner-sheet-title').textContent=next==='update'?say('更新到团队最新内容','Get team updates'):say('这次改了什么？','What changed?');
    $('beginner-sheet-help').textContent=next==='update'?say('先预检冲突；通过后暂存本地修改、拉取团队版本，再取回修改及原暂存状态。','Check conflicts first, then back up local changes, update and restore changes and staging.'):say('只勾选这次要交给团队的文件，不要勾选别人的修改。','Select only the files you want to share. Do not include someone else’s work.');
    $('beginner-selection').hidden=next==='update';$('beginner-changes-status').hidden=next==='update';$('beginner-issue-section').hidden=next!=='submit';
    $('beginner-team-rules').hidden=next!=='submit'||!state()?.sources.length;$('beginner-files').hidden=next==='update';filter.setHidden(next==='update');$('beginner-summary-label').hidden=next!=='submit';
    $('beginner-manual-label').hidden=next!=='submit'||!state()?.sources.length;
    $('beginner-plan').textContent=next==='update'?say('工具会安全获取团队版本；无法自动处理时会停止并说明。','The tool gets the team version safely and stops if assistance is required.'):say('正式版本不能直接修改。工具会先建立独立工作分支，运行项目检查，再上传送审；通过团队审核后才能合入。下方是本项目要求，拿不准请先联系负责人。','The tool creates a separate work branch, runs project checks and uploads for team review. It never commits directly to the primary branch or merges automatically. Check the project requirements below; ask the project owner if unsure.');
    $('beginner-confirm').textContent=next==='update'?say('确认更新','Confirm update'):say('确认提交','Confirm submission');
    update();
  }
  function refreshChanges() {
    return perform(async()=>{
      const generation=++changesGeneration;
      checkingChanges=true;$('beginner-manual').checked=false;
      $('beginner-changes-status').hidden=false;
      $('beginner-changes-status').textContent=say('正在比对本地文件，请稍候…','Checking local files…');
      $('beginner-files').hidden=true;update();
      try {
        await refresh();
        if(generation!==changesGeneration)return;
        if(!ready()||!state())throw new Error(say('项目状态已变化，请重新检查。','Project state changed. Check again.'));
        const count=state().changes.length;
        const time=new Date().toLocaleTimeString(english?'en-GB':'zh-CN',{hour12:false});
        $('beginner-changes-status').textContent=say('已检查 ','Checked ')+time+' · '+(count?say('发现 '+count+' 个待提交文件','Found '+count+' changed files'):say('没有待提交文件','No changed files'));
      } catch(error) {
        if(generation===changesGeneration) {
          $('beginner-files').replaceChildren();rendered='';selected.clear();
          $('beginner-changes-status').textContent=say('比对失败，请点“刷新改动”重试；未显示旧清单。','Check failed. Refresh changes to retry; the old list is hidden.');
        }
        throw error;
      } finally {
        if(generation===changesGeneration){checkingChanges=false;$('beginner-files').hidden=mode==='update';update();}
      }
    });
  }
  function clearIssues() {
    issueGeneration++;issueLoading=false;issueRows=[];$('beginner-manual').checked=false;
    $('beginner-issue').replaceChildren(new Option(say('暂不关联','No issue selected'),''));
    $('beginner-issue-status').textContent=say('只读取当前项目、当前 GitHub 账号的未关闭事项；关联不会自动关闭事项。','Only open issues in this project for the current GitHub account. Linking does not close issues.');
  }
  $('beginner-all').onclick=()=>{for(const box of document.querySelectorAll('#beginner-files .beginner-file:not([hidden]) input'))box.checked=true;$('beginner-manual').checked=false;update();};
  $('beginner-none').onclick=()=>{for(const box of document.querySelectorAll('#beginner-files input'))box.checked=false;$('beginner-manual').checked=false;update();};
  $('beginner-issue-scope').onchange=()=>{clearIssues();$('beginner-manual').checked=false;update();};
  $('beginner-issue').onchange=()=>{$('beginner-manual').checked=false;update();};
  $('beginner-issue-load').onclick=async()=>{
    if(!ready()||isBusy()||issueLoading)return;
    clearIssues();const generation=issueGeneration,current=state();issueLoading=true;
    $('beginner-issue-status').textContent=say('正在读取我的事项…','Loading my issues…');update();
    try {
      const result=await call('issues-list',{scope:$('beginner-issue-scope').value});
      if(generation!==issueGeneration)return;
      if(state()!==current||!ready()){clearIssues();$('beginner-issue-status').textContent=say('项目状态已变化，请重新加载事项。','Project state changed. Load issues again.');update();return;}
      issueRows=result.issues;
      for(const issue of issueRows)$('beginner-issue').append(new Option('#'+issue.number+' · '+issue.title,String(issue.number)));
      $('beginner-issue-status').textContent=result.repository+' · '+result.login+' · '+(issueRows.length?say('找到 '+issueRows.length+' 项，请选择对应事项。','Found '+issueRows.length+' issues. Choose one.'):say('没有找到符合条件的未关闭事项。','No matching open issues.'))+(result.limited?say(' 仅显示前100项，可请负责人协助查找。',' Showing the first 100; ask the owner for help finding more.'):'');
    } catch(problem) {
      if(generation===issueGeneration)$('beginner-issue-status').textContent=problem.message||say('事项暂时无法读取，请检查账号和网络后重新加载。','Issues are unavailable. Check your account and connection, then reload.');
    } finally {if(generation===issueGeneration){issueLoading=false;update();}}
  };
  $('beginner-refresh-changes').onclick=refreshChanges;
  $('beginner-view').onclick=()=>{open('view');return refreshChanges();};$('beginner-submit').onclick=()=>{open('submit');return refreshChanges();};$('beginner-update').onclick=()=>open('update');
  $('beginner-summary').oninput=update;$('beginner-manual').onchange=update;
  $('beginner-cancel').onclick=()=>{$('beginner-sheet').hidden=true;};
  $('beginner-confirm').onclick=()=>perform(async()=>{
    const current=state(),action=mode==='update'?'beginner-update':'beginner-submit';
    const operationId=crypto.randomUUID();
    if(mode==='update')progress.start(operationId);
    let result;
    try {
      result=await reviewedCall(action,{token:current.token,operationId,paths:chosen(),summary:$('beginner-summary').value.trim(),issue:mode==='submit'?(issueRows.find(row=>String(row.number)===$('beginner-issue').value)||null):null,rulesConfirmed:mode==='update'||!current.sources.length||$('beginner-manual').checked});
      if(mode==='update')progress.finish(result);
    } catch(error) {if(mode==='update')progress.fail(error);throw error;}
    $('beginner-sheet').hidden=true;$('beginner-manual').checked=false;
    await refresh();$('beginner-message').textContent=result.message||say('操作结果需要核对。','Please verify the operation result.');
    if(result.state==='awaiting-review'||result.state==='review-draft'){$('beginner-summary').value='';clearIssues();}
  });
  $('beginner-acknowledge').onclick=()=>perform(async()=>{
    if(!$('git-confirm').checked)throw new Error('请先核对实际项目状态，再勾选上方确认项。');
    await reviewedCall('beginner-acknowledge',{token:state().token,recordId:state().beginnerReceipt.id,rulesConfirmed:true});await refresh();
  });
  function error(problem) {
    $('beginner-message').dataset.quiet='false';
    const help=errorHelp(problem,english);
    $('beginner-message').textContent=help.message;
    $('beginner-detail').textContent=help.detail;$('beginner-result-details').hidden=false;
  }
  function invalidate(){
    fileActions.invalidate();filter.reset();
    progress.clear();changesGeneration++;checkingChanges=false;
    $('beginner-changes-status').textContent='';$('beginner-changes-status').hidden=true;
    rendered='';renderedRoot='';selected.clear();clearIssues();
    $('beginner-files').replaceChildren();$('beginner-summary').value='';
    $('beginner-manual').checked=false;$('beginner-sheet').hidden=true;update();
  }
  update();return {render,update,error,invalidate};
}
