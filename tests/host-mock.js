// Test-only Host simulation. Not distributed in the plugin.
const settings=new URLSearchParams(location.search),dark=settings.get('theme')==='dark';
for(const [name,value]of Object.entries(dark?{'--panel-bg':'#1f1f1e','--surface':'#1f1f1e','--surface-elevated':'#2c2c2a','--surface-chip':'#3c3c3a','--border-default':'#3c3c3a','--text-primary':'#d4d4d4','--text-secondary':'#a3a3a3'}:{'--panel-bg':'#f8f8f6','--surface':'#f8f8f6','--surface-elevated':'#fff','--surface-chip':'#e5e5e5','--border-default':'#d7d7d4','--text-primary':'#262626','--text-secondary':'#737373'}))document.documentElement.style.setProperty(name,value);
document.documentElement.style.colorScheme=dark?'dark':'light';
const calls={cards:[],results:[],agentRuns:[],inspections:[],creates:[],errands:[]},options={files:'all',failNode:false,deny:false,lose:false,jobStatus:'running'};
let handler,click=0,offset=0;const nativeNow=Date.now;Date.now=()=>nativeNow()+offset;
const context={session_id:'source-chat',workdir:'/preview/selected-project',workdir_is_local:true,workdir_is_read_only:false};
const cards=document.createElement('div');cards.id='test-cards';cards.style.cssText='position:fixed;top:0;right:0;max-width:240px;max-height:190px;overflow:auto;overflow-wrap:anywhere;z-index:100';document.body.append(cards);
function requestBinding(ctx=context){handler({type:'tool-call',tool:'get_workflows',callId:'source-card',args:{session_context:ctx}});}
globalThis.mockHost={calls,options,context,deliver:msg=>handler(msg),requestBinding,advanceTime:()=>{offset+=11000;}};
globalThis.cindy={
 async pick(){return {ok:true,path:'/preview/selected-project'};},
 onHostMessage(cb){handler=cb;if(!settings.has('direct'))requestBinding();},
 async send(message){
  if(message.type==='tool-result'){calls.results.push(message);cards.dataset.lastResult=message.callId;return{ok:true};}
  if(message.type!=='card-update')return{ok:true};calls.cards.push(message);
  let el=document.getElementById(message.callId);if(!el){el=document.createElement('section');el.id=message.callId;cards.append(el);}el.innerHTML=message.html;return{ok:true};
 },
 node:{async request(req){
  calls.inspections.push(req);if(options.failNode)return{ok:false};
  if(req.method==='project/git') return {ok:true,result:{root:req.params.dir,branch:'main',head:'fixture',changes:[],branches:['main'],protectedBranches:['main','master'],sources:[{path:'AGENTS.md',content:'Main requires PR.'}],incomplete:false,hooksPath:'.git/hooks',hooks:[],hooksReady:true,requirements:{},token:'mock-review-token'}};
  const defaults={experiment:'_S/experiment.md',feature:'_S/feature.md',tooling:'_S/tooling.md',pr:'.agents/skills/xd-pr-review/SKILL.md',merge:'_E/merge.md'};
  return{ok:true,result:{checkedAt:new Date().toISOString(),workflows:Object.fromEntries(Object.keys(defaults).map(id=>{
   const configured=req.params?.project?.workflows?.[id];
   const file=configured?configured.path:defaults[id];
   const present=!!file&&(options.files==='all'||options.files==='partial'&&id==='feature');
   return[id,{ok:present,reason:!file?'not_configured':id==='pr'?'skill_unverified':'missing',source:file?(file.startsWith('/')?file:(req.params?.dir||context.workdir)+'/'+file):''}];
  }))}};
 }},
 agent:{async errand(req){calls.errands.push(req);if(options.lose)throw new Error('Lost receipt');if(options.deny)return{ok:false,errorCode:'PERMISSION_DENIED'};return{ok:true,jobId:'direct-'+calls.errands.length};},
 async queryErrand({jobId}){return options.expired?{ok:false,errorCode:'JOB_NOT_FOUND'}:{ok:true,jobId,status:options.jobStatus,sessionId:'task-'+jobId};},
 async run(req){calls.agentRuns.push(req);if(options.lose)throw new Error('Lost receipt');if(options.deny)return{ok:false,errorCode:'PERMISSION_DENIED'};const sessionId='preview-task-'+calls.agentRuns.length;if(options.autoSwitch)handler({type:'event',name:'did-session-switched',data:{sessionId,workdir:context.workdir}});return{ok:true,sessionId};}},
 tasks:{async capabilities(){return{operations:['getRun']};},async getRun(){return{status:'running'};}},
};
cards.addEventListener('click',event=>{const button=event.target.closest('[data-ghost-action]');if(!button)return;handler({type:'card-action',actionId:button.dataset.ghostAction,callId:'source-card',spawnCallId:'binding-result-'+(++click),sessionId:context.session_id,userActionToken:'test-ticket-'+click});});
await import('/main.js');
