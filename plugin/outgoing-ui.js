import {errorHelp} from './error-help.js';
export function mountOutgoing({state,ready,isBusy,call,perform,english=false}) {
  const say=(zh,en)=>english?en:zh,node=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const button=node('button');button.id='outgoing-summary';button.type='button';document.getElementById('beginner-state').after(button);
  const box=node('section');box.id='outgoing-panel';box.className='beginner-sheet';box.hidden=true;
  const title=node('h3',say('已提交、未推送','Committed, not pushed')),help=node('p'),list=node('div'),status=node('p'),close=node('button',say('收起','Close'));close.type='button';list.id='outgoing-commits';list.className='stash-list';status.setAttribute('role','status');
  help.textContent=say('依据本机上次获取的远端记录判断，不会联网、修改文件或推送。需要核对服务器最新状态时，先在专业工具获取远端，再重新检查。','Based on cached remote-tracking refs; no network access, file changes or pushes. To verify the latest server state, fetch in the expert tools, then check again.');
  box.append(title,help,status,list,close);document.getElementById('beginner-message').before(box);
  let generation=0,root='';
  function update(){const current=state(),out=current?.outgoing;button.hidden=!ready();button.disabled=isBusy()||!ready();button.textContent=out?.known?(out.reason==='unpublished-branch'||out.reason==='missing-upstream'?say('当前分支尚未确认上传 · ','Branch publication unconfirmed · '):'')+say('已提交、未推送：'+out.count+' 条','Committed, not pushed: '+out.count)+(out.behind?say(' · 落后 '+out.behind+' 条',' · behind '+out.behind):''):say('上传状态待核对','Upload status unverified');button.title=say('依据上次获取的远端记录；点击查看提交。','Based on cached remote refs; click to view commits.');if(root&&(!ready()||current?.root!==root))invalidate();}
  function invalidate(){generation++;root='';box.hidden=true;list.replaceChildren();status.textContent='';}
  button.onclick=()=>{if(!ready()||isBusy())return;const n=generation,selected=state().root;return perform(async()=>{
    root=selected;box.hidden=false;list.replaceChildren();status.textContent=say('正在读取本地提交…','Reading local commits…');
    try {const result=await call('outgoing-list');if(n!==generation||!ready()||state()?.root!==selected)return;
      status.textContent=!result.known?say('缺少有效远端跟踪记录，暂不能判断哪些提交未推送；请先获取远端并重新检查。','No usable remote-tracking refs; fetch and check again to determine outgoing commits.'):say('对比目标：','Compared with: ')+result.target+' · '+result.count+say(' 条未推送',' outgoing commits')+(result.limited?say('，仅显示最近100条','; showing the latest 100'):'');
      for(const commit of result.entries){const row=node('article'),name=node('strong',commit.short+' · '+commit.subject),info=node('p',commit.author+' · '+commit.createdAt);row.append(name,info);list.append(row);}
    }catch(error){if(n===generation)status.textContent=errorHelp(error,english).message;if(error.code==='CONFIG_CONFLICT')throw error;}
  });};close.onclick=()=>{box.hidden=true;};update();return {update,invalidate};
}
