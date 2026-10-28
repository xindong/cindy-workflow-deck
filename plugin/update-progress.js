import { errorHelp } from './error-help.js';
// Stage progress comes only from the operation journal. No timed percentages,
// automatic write retries, or coupling between observation and write completion.
export function createUpdateProgress({call,getRoot=()=>'',english=false,kind='update'}) {
  const say=(zh,en)=>english?en:zh;
  const submit=kind==='submit',prefix=submit?'submit-progress':'update-progress';
  const success=record=>submit?['awaiting-review','review-draft'].includes(record?.state):record?.state==='updated';
  const completion=()=>submit?say('上传完成，等待团队审核','Uploaded; awaiting team review'):say('更新完成','Update complete');
  const box=document.createElement('section');box.id=prefix+'';box.hidden=true;
  box.className='update-progress';box.setAttribute('aria-label',submit?say('上传进度','Upload progress'):say('更新进度','Update progress'));
  const title=document.createElement('strong');title.id=prefix+'-title';title.setAttribute('role','status');title.setAttribute('aria-live','polite');
  const bar=document.createElement('progress');bar.id=prefix+'-bar';bar.max=1;bar.setAttribute('aria-label',submit?say('上传操作进度','Upload operation progress'):say('更新操作进度','Update operation progress'));
  const steps=document.createElement('p');steps.id=prefix+'-steps';
  const meta=document.createElement('p');meta.id=prefix+'-time';
  const caption=document.createElement('p');caption.className='update-progress-caption';caption.textContent=submit?say('提交修改 · 实时进度','Submit changes · Live progress'):say('项目更新 · 实时进度','Project update · Live progress');
  const target=document.createElement('p');target.id=prefix+'-target';
  const timeline=document.createElement('ol');timeline.id=prefix+'-log';timeline.setAttribute('aria-label',say('操作步骤记录','Operation step log'));
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=say('查看步骤详情','Step details');details.append(summary,target,timeline);
  box.append(caption,title,bar,steps,meta,details);document.querySelector('.beginner-heading').after(box);
  const labels={branch:say('正在创建工作分支…','Creating work branch…'),stage:say('正在整理所选文件…','Preparing selected files…'),commit:say('正在保存修改并运行项目检查…','Saving changes and running project checks…'),push:say('正在上传修改…','Uploading changes…'),review:say('正在提交团队审核…','Requesting team review…'),prepare:say('正在核对项目状态…','Checking project state…'),fetch:say('正在获取团队最新版本…','Fetching team updates…'),preflight:say('正在检查冲突和修改恢复…','Checking conflicts and restoration…'),stash:say('正在备份本地修改…','Backing up local changes…'),merge:say('正在更新项目文件…','Updating project files…'),restore:say('正在取回修改及原暂存状态…','Restoring changes and staging…')};
  const done=submit?{branch:say('建立工作分支','Create work branch'),stage:say('整理所选文件','Prepare selected files'),commit:say('保存并检查','Save and check'),push:say('上传修改','Upload changes'),review:say('提交审核','Request review')}:{fetch:say('获取团队版本','Fetch team version'),preflight:say('冲突预检','Check conflicts'),stash:say('备份修改','Back up changes'),merge:say('更新文件','Update files'),restore:say('取回修改','Restore changes')};
  const rows=new Map();
  for(const [name,label] of Object.entries(done)) {
    const row=document.createElement('li'),marker=document.createElement('span'),text=document.createElement('span'),status=document.createElement('span');
    marker.className='update-step-marker';marker.setAttribute('aria-hidden','true');text.textContent=label;status.className='update-step-status';
    row.append(marker,text,status);timeline.append(row);rows.set(name,{row,marker,status});
  }
  function renderLog(completed=[],step='',settled=false) {
    for(const [name,{row,marker,status}] of rows) {
      const state=completed.includes(name)?'done':name===step?(settled?'attention':'running'):'pending';
      row.dataset.state=state;marker.textContent=state==='done'?'✓':state==='running'?'●':state==='attention'?'!':'○';
      status.textContent=state==='done'?say('已完成','Done'):state==='running'?say('进行中','In progress'):state==='attention'?say('已停止','Stopped'):say('未记录完成','Not recorded');
      if(state==='running')row.setAttribute('aria-current','step');else row.removeAttribute('aria-current');
    }
  }
  let generation=0,timer,poller,started=0,active=false,lastStep='prepare',unavailable=false,lastCompleted=[],observedId='';
  function clock(){const seconds=Math.floor((Date.now()-started)/1000);meta.textContent=say('已用时 ','Elapsed ')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+(active?(unavailable?say(' · 进度暂不可用；操作结果仍在等待，请勿重复操作。',' · Progress unavailable; still awaiting the update result. Do not retry.'):say(' · 请稍候',' · Please wait')):'');}
  function show(record) {
    lastStep=record?.step||lastStep;
    title.textContent=labels[lastStep]||say('正在处理更新…','Updating…');
    const completed=(record?.completed||[]).filter(name=>done[name]);
    lastCompleted=completed;renderLog(completed,lastStep);
    steps.textContent='';steps.hidden=true;
    clock();
  }
  function stop(){active=false;generation++;clearInterval(timer);clearTimeout(poller);clock();}
  return {
    isRunning:()=>active,
    start(operationId) {
      generation++;clearInterval(timer);clearTimeout(poller);const current=generation;
      active=true;started=Date.now();lastStep='prepare';unavailable=false;lastCompleted=[];
      observedId=operationId;
      target.textContent=getRoot();target.hidden=!target.textContent;
      box.hidden=false;box.dataset.state='running';bar.removeAttribute('value');show(null);
      box.scrollIntoView({block:'nearest',behavior:'instant'});
      timer=setInterval(clock,1000);
      async function poll(){
        try {
          const record=await call('operation-progress',{operationId});
          if(current!==generation)return;
          unavailable=false;if(record?.id===operationId)show(record);
        } catch {if(current!==generation)return;unavailable=true;clock();}
        if(current===generation)poller=setTimeout(poll,1000);
      }
      // Let the write request start first; only one observation can be in flight.
      poller=setTimeout(poll,600);
    },
    finish(result) {
      stop();
      renderLog(result?.completed||lastCompleted,result?.step||lastStep,true);
      steps.hidden=false;
      if(success(result)) {
        box.dataset.state='done';bar.value=1;
        title.textContent=completion();
        steps.textContent=result.message||say('项目已更新。','Project updated.');
      } else {
        box.dataset.state='attention';bar.value=0;
        title.textContent=say('操作已停止，请查看下一步','Operation stopped; check the next step');
        steps.textContent=result?.message||say('请核对操作详情，勿重复操作。','Check operation details before trying again.');
      }
    },
    fail(error) {
      stop();box.dataset.state='attention';bar.value=0;
      renderLog(lastCompleted,lastStep,true);
      title.textContent=say('操作未确认完成','Completion unconfirmed');steps.hidden=false;
      steps.textContent=errorHelp(error,english).message;
    },
    sync(record) {
      if(!active&&record?.id===observedId&&success(record)&&box.dataset.state!=='done') {
        box.dataset.state='done';bar.value=1;renderLog(record.completed,record.step,true);
        title.textContent=completion()+say('（已核对）',' (verified)');steps.hidden=false;steps.textContent=record.message||'';
      }
    },
    clear(){stop();observedId='';box.hidden=true;},
  };
}
