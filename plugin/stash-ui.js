import {errorHelp} from './error-help.js';
import {mountStashRestore} from './stash-restore-ui.js';
export function mountStash({state,ready,isBusy,call,perform,reviewedCall,refresh,canRefresh=ready,english=false}) {
  const $=id=>document.getElementById(id),say=(zh,en)=>english?en:zh;
  const button=$('beginner-stashes'),name=button.querySelector('strong'),hint=button.querySelector('strong+span');
  name.textContent=say('查看暂存记录','View stashes');hint.textContent=say('查看 Stash 文件并对比','Inspect stash files and compare');
  const section=document.createElement('section');section.id='stash-browser';section.className='beginner-sheet';section.hidden=true;
  const header=document.createElement('div');header.className='row';
  const title=document.createElement('h3'),reload=document.createElement('button'),close=document.createElement('button');
  title.textContent=say('暂存记录 · Stash','Saved changes · Stash');reload.id='stash-refresh';reload.type=close.type='button';reload.textContent=say('刷新记录','Refresh stashes');close.textContent=say('收起','Close');header.append(title,reload,close);
  const help=document.createElement('p');help.textContent=say('查看和对比不改文件；选中记录后可预检并确认取回，原 Stash 保留。线上对比会先获取最新版本，只更新远端缓存。','Viewing and comparing leave files unchanged. Select a stash to preflight and confirm restoring it; the original stash is retained. Online comparison fetches the latest version and only updates remote caches.');
  const status=document.createElement('p');status.id='stash-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const errors=document.createElement('details'),errorTitle=document.createElement('summary'),errorBody=document.createElement('pre');errors.hidden=true;errorTitle.textContent=say('操作详情','Technical details');errors.append(errorTitle,errorBody);
  const entries=document.createElement('div');entries.id='stash-entries';entries.className='stash-list';
  const fileTitle=document.createElement('h4'),files=document.createElement('div');fileTitle.id='stash-file-title';files.id='stash-files';files.className='stash-list';
  const comparison=document.createElement('section'),diffTitle=document.createElement('h4'),diffInfo=document.createElement('p'),output=document.createElement('pre');
  comparison.id='stash-comparison';comparison.hidden=true;diffTitle.id='stash-diff-title';diffInfo.id='stash-diff-info';output.id='stash-diff';comparison.append(diffTitle,diffInfo,output);
  section.append(header,help,status,errors,entries,fileTitle,files,comparison);$('beginner-message').before(section);
  const restoring=mountStashRestore({state,ready,isBusy,call,perform,reviewedCall,refresh,canRefresh,english});
  let generation=0,currentRoot='',selectedId='';
  const valid=(n,root)=>n===generation&&ready()&&state()?.root===root;
  const clearError=()=>{errors.hidden=true;errorBody.textContent='';};
  const clearDiff=()=>{comparison.hidden=true;output.textContent='';diffInfo.textContent='';};
  async function read(work) {
    if(!ready()||isBusy())return;
    const n=generation,root=state()?.root;
    return perform(async()=>{
      clearError();
      try {await work(n,root);}
      catch(error){if(valid(n,root)){const help=errorHelp(error,english);status.textContent=help.message;errorBody.textContent=help.detail;errors.hidden=!help.detail;}if(error.code==='CONFIG_CONFLICT')throw error;}
    });
  }
  function load() {
    return read(async(n,root)=>{
      section.hidden=false;currentRoot=root;selectedId='';restoring.clear();entries.replaceChildren();files.replaceChildren();fileTitle.textContent='';clearDiff();
      status.textContent=say('正在读取暂存记录…','Loading stashes…');
      const result=await call('stash-list');if(!valid(n,root))return;
      status.textContent=result.entries.length?say('找到 '+result.entries.length+' 条暂存记录，选择一条查看文件。','Found '+result.entries.length+' stashes. Choose one to inspect.') : say('当前项目没有 Stash 暂存记录。','This project has no stashes.');
      if(result.limited)status.textContent+=say(' 仅显示最近100条。',' Showing the latest 100.');
      for(const entry of result.entries) {
        const pick=document.createElement('button'),label=document.createElement('strong'),date=document.createElement('span');
        pick.type='button';pick.className='stash-entry';pick.dataset.stashId=entry.id;pick.setAttribute('aria-pressed','false');
        label.textContent=entry.ref+' · '+entry.subject;date.textContent=entry.createdAt+' · '+entry.id.slice(0,12);pick.append(label,date);
        pick.onclick=()=>read(async(n,root)=>{
          selectedId=entry.id;restoring.clear();files.replaceChildren();fileTitle.textContent='';clearDiff();
          for(const item of entries.querySelectorAll('button'))item.setAttribute('aria-pressed',String(item===pick));
          status.textContent=say('正在读取记录中的文件…','Loading files in this stash…');
          const result=await call('stash-files',{stashId:entry.id});if(!valid(n,root)||selectedId!==entry.id)return;
          fileTitle.textContent=entry.ref+' · '+result.files.length+say(' 个文件',' files');
          restoring.select(result.entry);
          status.textContent=say('“−”为暂存记录内容，“+”为对比目标内容。暂存区标记仅说明保存时的来源，对比使用该记录最终工作区版本。','“−” is the stash content and “+” is the comparison target. The staged marker identifies its saved source; comparison uses the stash’s final working-tree version.');
          for(const file of result.files) {
            const row=document.createElement('div'),name=document.createElement('span'),actions=document.createElement('div');row.className='stash-file';row.dataset.path=file.path;actions.className='row';
            const areas=file.areas.map(area=>area==='staged'?say('含暂存区修改','Includes staged changes'):area==='untracked'?say('未跟踪文件','Untracked file'):say('工作区修改','Working changes'));
            name.textContent=file.status+' · '+file.path+' · '+areas.join(' / ');row.append(name,actions);
            for(const target of ['local','remote']) {
              const compare=document.createElement('button');compare.type='button';compare.dataset.target=target;compare.textContent=target==='local'?say('与本地对比','Compare local'):say('与服务器最新对比','Compare latest online');
              compare.onclick=()=>read(async(n,root)=>{
                clearDiff();status.textContent=target==='local'?say('正在与本地工作区对比…','Comparing with your working tree…'):say('正在获取服务器最新版本并对比…','Fetching and comparing the latest server version…');
                const result=await call('stash-diff',{stashId:entry.id,path:file.path,target,english});if(!valid(n,root)||selectedId!==entry.id)return;
                diffTitle.textContent=file.path;diffInfo.textContent=entry.ref+' · '+entry.id.slice(0,12)+' → '+result.target+(result.commit?' · '+result.commit.slice(0,12):'')+'\n'+result.checkedAt+'\n'+say('记录 / 目标：','Stash / target: ')+[result.saved,result.other].map(file=>file.exists?file.size+' B · '+file.mode:say('不存在','Missing')).join(' / ');
                output.textContent=result.output;comparison.hidden=false;status.textContent=result.summaryOnly?say('已读取摘要；此文件不显示文本差异。','Summary loaded; a text diff is unavailable for this file.'):say('对比完成，文件和暂存记录均未改动。','Comparison complete; files and stashes are unchanged.');
                comparison.scrollIntoView({block:'nearest'});
              });actions.append(compare);
            }
            files.append(row);
          }
        });entries.append(pick);
      }
    });
  }
  function invalidate(){generation++;currentRoot='';selectedId='';restoring.invalidate();section.hidden=true;entries.replaceChildren();files.replaceChildren();fileTitle.textContent='';clearDiff();clearError();status.textContent='';}
  function update(){if(currentRoot&&(!ready()||state()?.root!==currentRoot))invalidate();const disabled=!ready()||isBusy();button.disabled=disabled;reload.disabled=disabled;for(const item of section.querySelectorAll('.stash-list button'))item.disabled=disabled;restoring.update();}
  button.onclick=load;reload.onclick=load;close.onclick=()=>{section.hidden=true;};
  update();return {update,invalidate};
}
