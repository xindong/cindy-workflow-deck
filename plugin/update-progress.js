// Stage progress comes only from the operation journal. No timed percentages,
// automatic write retries, or coupling between observation and write completion.
export function createUpdateProgress({call,english=false}) {
  const say=(zh,en)=>english?en:zh;
  const box=document.createElement('section');box.id='update-progress';box.hidden=true;
  box.className='update-progress';box.setAttribute('aria-label',say('更新进度','Update progress'));
  const title=document.createElement('strong');title.id='update-progress-title';title.setAttribute('role','status');title.setAttribute('aria-live','polite');
  const bar=document.createElement('progress');bar.id='update-progress-bar';bar.max=1;bar.setAttribute('aria-label',say('更新操作进度','Update operation progress'));
  const steps=document.createElement('p');steps.id='update-progress-steps';
  const meta=document.createElement('p');meta.id='update-progress-time';
  box.append(title,bar,steps,meta);document.querySelector('.beginner-heading').after(box);
  const labels={prepare:say('正在核对项目状态…','Checking project state…'),fetch:say('正在获取团队最新版本…','Fetching team updates…'),preflight:say('正在检查冲突和修改恢复…','Checking conflicts and restoration…'),stash:say('正在备份本地修改…','Backing up local changes…'),merge:say('正在更新项目文件…','Updating project files…'),restore:say('正在取回修改及原暂存状态…','Restoring changes and staging…')};
  const done={fetch:say('获取团队版本','Fetch team version'),preflight:say('冲突预检','Check conflicts'),stash:say('备份修改','Back up changes'),merge:say('更新文件','Update files'),restore:say('取回修改','Restore changes')};
  let generation=0,timer,poller,started=0,active=false,lastStep='prepare',unavailable=false;
  function clock(){const seconds=Math.floor((Date.now()-started)/1000);meta.textContent=say('已用时 ','Elapsed ')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+(active?(unavailable?say(' · 进度暂不可用；更新结果仍在等待，请勿重复操作。',' · Progress unavailable; still awaiting the update result. Do not retry.'):say(' · 当前阶段耗时取决于网络和项目大小',' · Stage duration depends on network and project size')):'');}
  function show(record) {
    lastStep=record?.step||lastStep;
    title.textContent=labels[lastStep]||say('正在处理更新…','Updating…');
    const completed=(record?.completed||[]).filter(name=>done[name]);
    steps.textContent=completed.length?say('已完成：','Completed: ')+completed.map(name=>done[name]).join(' → '):say('操作正在进行，请勿重复点击。','Update in progress. Please do not click again.');
    clock();
  }
  function stop(){active=false;generation++;clearInterval(timer);clearTimeout(poller);clock();}
  return {
    isRunning:()=>active,
    start(operationId) {
      generation++;clearInterval(timer);clearTimeout(poller);const current=generation;
      active=true;started=Date.now();lastStep='prepare';unavailable=false;
      box.hidden=false;box.dataset.state='running';bar.removeAttribute('value');show(null);
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
      if(result?.state==='updated') {
        box.dataset.state='done';bar.value=1;
        title.textContent=say('更新完成','Update complete');
        steps.textContent=result.message||say('项目已更新。','Project updated.');
      } else {
        box.dataset.state='attention';bar.value=0;
        title.textContent=say('更新已停止，需要查看结果','Update stopped; check the result');
        steps.textContent=result?.message||say('请核对操作详情，勿重复操作。','Check operation details before trying again.');
      }
    },
    fail(error) {
      stop();box.dataset.state='attention';bar.value=0;
      title.textContent=say('更新未确认完成','Update completion unconfirmed');
      steps.textContent=error?.message||say('请重新检查实际项目状态，勿重复操作。','Check the actual project state; do not retry the operation.');
    },
    clear(){stop();box.hidden=true;},
  };
}
