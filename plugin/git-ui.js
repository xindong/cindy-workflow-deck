export function mountGit({transport,context,notice,english=false}) {
  const $=id=>document.getElementById(id);
  let state, busy=false, inspectedContext='';
  const contextKey=()=>JSON.stringify([context().projectId,context().revision]);
  if(english) {
    const labels={'基础 · Git':'Basic · Git','项目配置':'Project settings','高级 · 工作流':'Advanced · Workflows','刷新状态':'Refresh status','工作区差异':'Working tree diff','暂存区差异':'Staged diff','提交历史':'History','项目规则与 hooks（操作前必读）':'Project rules and hooks (read before acting)','工作分支名称':'Work branch name','新建并切换分支':'Create and switch branch','切换已有分支':'Switch existing branch','暂存选中文件':'Stage selected files','取消选中文件暂存':'Unstage selected files','提交信息':'Commit message','提交暂存内容':'Commit staged changes','获取远端':'Fetch origin','快进拉取':'Fast-forward pull','推送当前工作分支':'Push work branch','创建 PR':'Create PR','目标分支':'Base branch','PR 标题':'PR title','PR 描述':'PR description','我已阅读适用规则，并完成此次操作要求的测试、审批等人工前提':'I reviewed the applicable rules and completed required tests, approvals and other manual prerequisites','先选择并保存项目根目录，再刷新 Git 状态。':'Choose and save a project root, then refresh Git status.','需要本机已安装并登录 gh。先推送工作分支；不会自动合并 PR。按项目模板填写描述。':'Requires an installed and authenticated gh CLI. Push the branch first; PRs are not automatically merged. Follow the project PR template.','主分支禁止直接提交和推送；先创建工作分支，再通过 PR 合入。自动检查仅覆盖下方列明的分支、状态和 hooks。文档中的测试、审批、锁定与业务条件仍需逐项核对，不能用勾选替代执行。':'Direct commits and pushes to primary branches are blocked. Create a work branch and merge through a PR. Automatic checks cover the displayed branch, state and hooks only. Tests, approvals, locks and business requirements in documents still require manual verification.'};
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())) {const key=node.textContent.trim();if(labels[key])node.textContent=node.textContent.replace(key,labels[key]);}
  }
  const say=text=>{ $('git-output').textContent=text; };
  function buttons() {
    const ready=context().ready && !busy && !!state && inspectedContext===contextKey();
    $('git-refresh').disabled=busy || !context().ready;
    for(const button of document.querySelectorAll('[data-git]')) {
      const action=button.dataset.git, read=['diff','diff-staged','history'].includes(action);
      button.disabled=!ready || (!read && (!$('git-confirm').checked || !state.hooksReady || state.incomplete)) || (['commit','push','pr'].includes(action) && state.protectedBranches.includes(state.branch));
    }
  }
  async function call(action,extra={}) {
    const ctx=context(); if(!ctx.ready) throw new Error('请先保存项目配置');
    return transport.call('git-request',{...ctx,action,...extra});
  }
  async function refresh() {
    state=await call('status'); inspectedContext=contextKey(); $('git-confirm').checked=false;
    $('git-state').textContent=state.root+' · '+(state.branch || 'detached HEAD')+' · '+state.changes.length+(english?' changes':' 个改动');
    const protectedBranch=state.protectedBranches.includes(state.branch);
    $('git-gate').textContent=english ? ((protectedBranch?'Primary branch: commit, push and PR creation are blocked. Create a work branch → stage → commit → push → PR.':'Work branch: native project hooks remain enabled. Push, then merge through a PR. No force push or hook bypass.')+(!state.hooksReady?' Hooks are not ready; writes are disabled.':'')+(state.incomplete?' Rule discovery is incomplete; writes are disabled.':'')) : (protectedBranch?'当前为主分支：提交、推送、创建 PR 已禁用。下一步：新建工作分支 → 暂存 → 提交 → 推送 → PR。':'当前为工作分支。提交保留项目 hooks，推送后通过 PR 合入；不提供强推、重置或跳过 hooks。') + (!state.hooksReady?' 项目 hooks 未启用或不可执行，写操作已禁用。':'')+(state.incomplete?' 规则读取未完成，写操作已禁用。':'');
    $('git-rules').replaceChildren();
    const hooks=document.createElement('p');hooks.textContent='Hooks: '+state.hooksPath+' · '+state.hooks.map(h=>h.name+(h.executable?' ✓':' ×')).join(', ');$('git-rules').append(hooks);
    for(const source of state.sources) {const detail=document.createElement('details'), summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent=source.path;pre.textContent=source.content;detail.append(summary,pre);$('git-rules').append(detail);}
    $('git-files').replaceChildren();
    for(const item of state.changes) {const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');label.className='check';check.type='checkbox';check.value=item.path;text.textContent=item.status+' '+item.path;label.append(check,text);$('git-files').append(label);}
    $('git-base').replaceChildren(...state.protectedBranches.map(b=>new Option(b,b)));
    $('git-branches').replaceChildren(...state.branches.map(b=>new Option(b,b)));
    const templates=state.sources.filter(s=>/pull_request_template/i.test(s.path));if(templates.length===1 && !$('git-body').value)$('git-body').value=templates[0].content;
  }
  async function run(work) {
    if(busy)return;busy=true;buttons();
    try {await work();}catch(e){state=undefined;$('git-confirm').checked=false;say((e.code?e.code+' · ':'')+e.message+'\n请刷新核对实际状态；未自动重试。');}
    finally {busy=false;buttons();}
  }
  $('git-refresh').onclick=()=>run(refresh);
  $('git-confirm').onchange=buttons;
  for(const button of document.querySelectorAll('[data-git]')) button.onclick=()=>run(async()=>{
    const action=button.dataset.git, read=['diff','diff-staged','history'].includes(action);
    const result=await call(action==='diff-staged'?'diff':action,{staged:action==='diff-staged',token:state?.token,rulesConfirmed:$('git-confirm').checked,branch:$('git-branch').value,paths:[...document.querySelectorAll('#git-files input:checked')].map(c=>c.value),message:$('git-message').value,title:$('git-title').value,body:$('git-body').value,base:$('git-base').value});
    say(result.output || '操作已返回成功。');if(!read)await refresh();
  });
  function tab(git) {$('git-view').hidden=!git;$('config-view').hidden=git;$('git-tab').setAttribute('aria-pressed',String(git));$('config-tab').setAttribute('aria-pressed',String(!git));buttons();}
  $('git-tab').onclick=()=>tab(true);$('config-tab').onclick=()=>tab(false);
  // Keep configuration reachable on first use; configured projects open the basic Git view.
  tab(!!document.getElementById('basic-view') && !!context().projectId);
  document.getElementById('configuration-form').addEventListener('input',()=>{state=undefined;buttons();});
  addEventListener('focus',buttons);buttons();
}
