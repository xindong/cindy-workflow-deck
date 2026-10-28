import {redactDiagnosis} from './core/diagnosis.mjs';
export function mountDiagnosis({transport,context,isBusy,english=false}) {
 const $=id=>document.getElementById(id),say=(zh,en)=>english?en:zh;let busy=false,operationId='',generation=0;
 const panel=document.createElement('section');panel.id='diagnosis-panel';panel.className='beginner-sheet';panel.hidden=true;
 function node(tag,text){const n=document.createElement(tag);if(text)n.textContent=text;return n;}
 const heading=node('h3',say('AI 诊断问题','AI issue diagnosis')),help=node('p',say('描述问题后开始诊断。仅分析脱敏状态，不修改文件；调用 AI 可能产生模型费用。','Describe the issue and diagnose. AI analyzes redacted status without modifying files; model costs may apply.'));
 const label=node('label',say('遇到了什么问题？','What went wrong?')),problem=node('textarea');problem.id='diagnosis-problem';problem.rows=3;problem.maxLength=2000;label.append(problem);
 const failureLabel=node('label',say('最近错误（可修改或清空）','Recent error (edit or clear)')),failure=node('textarea');failure.id='diagnosis-failure';failure.rows=3;failure.maxLength=10000;failureLabel.append(failure);
 const controls=node('div');controls.className='row';
 const prepare=node('button',say('开始诊断','Diagnose')),check=node('button',say('检查诊断结果','Check diagnosis result')),close=node('button',say('收起','Close'));
 prepare.id='diagnosis-prepare';check.id='diagnosis-check';for(const n of [prepare,check,close])n.type='button';controls.append(prepare,check,close);
 const status=node('p');status.id='diagnosis-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const ai=node('p');ai.id='diagnosis-ai';
 const errorDetails=node('details'),errorSummary=node('summary',say('技术详情','Technical details')),errorText=node('pre');errorDetails.id='diagnosis-error-details';errorDetails.hidden=true;errorDetails.append(errorSummary,errorText);
 const result=node('pre');result.id='diagnosis-result';result.setAttribute('role','log');
 const extra=node('details'),extraTitle=node('summary',say('补充错误（可选）','Additional error (optional)'));extra.append(extraTitle,failureLabel);
 panel.append(heading,help,label,extra,controls,status,ai,errorDetails,result);$('beginner-sheet').after(panel);
 if(english)$('beginner-diagnose').querySelector('strong').textContent='AI issue diagnosis';
 const entry=node('button',say('让 AI 诊断这个问题','Diagnose this issue with AI'));entry.type='button';entry.id='diagnosis-from-error';entry.hidden=true;$('beginner-message').after(entry);
 function ctxKey(){return JSON.stringify([context().projectId,context().revision]);}
 function update(){const can=context().ready&&!isBusy();$('beginner-diagnose').disabled=entry.disabled=!can||busy;prepare.disabled=!can||busy;check.disabled=!can||busy;problem.disabled=failure.disabled=busy;}
 function clearPreview(){operationId='';errorDetails.hidden=true;ai.textContent='';}
 function show(record){
  result.textContent='';
  if(!record){ai.textContent='';status.textContent=say('尚未发送诊断请求。','No diagnosis has been sent.');return;}
  operationId=record.operationId;errorDetails.hidden=true;

  if(record.state==='completed'){result.textContent=record.text+(record.truncated?say('\n（结果过长，已截短）','\n(Result truncated)'):'');ai.textContent=say('本次实际模型：','Actual model: ')+record.model;status.textContent=say('诊断已返回。建议尚未执行，请核对后再决定处理。','Diagnosis received. No suggested repair has been executed.');}
  else if(record.state==='failed'){status.textContent=record.message;errorText.textContent=record.code;errorDetails.hidden=false;}
  else status.textContent=record.message||say('诊断正在处理中；可稍后检查结果。请勿重复发送。','Diagnosis is pending; check the result later. Do not send it again.');
  if(record.staleSnapshot)status.textContent+=' '+say('这是配置变更前的诊断快照，请结合当前项目状态核对。','This diagnosis uses a snapshot from before the settings changed; check it against the current project.');
 }
 async function work(fn){if(busy)return;const key=ctxKey(),epoch=generation;busy=true;update();try{const value=await fn();if(epoch===generation&&key===ctxKey()&&context().ready)return value;}catch(error){if(epoch===generation&&key===ctxKey()){status.textContent=redactDiagnosis(error.message||say('诊断暂不可用，请检查 AI 连接。','Diagnosis is unavailable; check the AI connection.'));errorText.textContent=error.code||'';errorDetails.hidden=!error.code;}}finally{busy=false;update();}}
 function open(){panel.hidden=false;$('beginner-sheet').hidden=true;failure.value=redactDiagnosis(($('beginner-result-details').hidden?'':$('beginner-detail').textContent)||$('file-action-status')?.textContent||$('git-output').textContent||'').slice(0,10000);clearPreview();result.textContent='';status.textContent='';update();panel.scrollIntoView({block:'nearest'});}
 $('beginner-diagnose').onclick=entry.onclick=open;close.onclick=()=>{panel.hidden=true;};
 for(const input of [problem,failure])input.oninput=()=>{clearPreview();status.textContent=say('内容已变化，可以重新诊断。','Information changed; diagnose again.');update();};
 prepare.onclick=async()=>{
  if(busy||!context().ready||isBusy())return;
  clearPreview();result.textContent='';status.textContent=say('AI 正在诊断…','Diagnosing…');
  const ctx={...context()},epoch=generation;
  const value=await work(async()=>{
   const prepared=await transport.call('diagnosis-prepare',{...ctx,problem:problem.value,failure:failure.value,english});
   if(epoch!==generation||JSON.stringify([ctx.projectId,ctx.revision])!==ctxKey()||!context().ready)return;
   if(!prepared.available){status.textContent=say('独立应用尚未接入 AI，请在 Cindy 插件中诊断。','AI is not connected here. Use diagnosis in the Cindy plugin.');return;}
   operationId=crypto.randomUUID();
   return transport.call('diagnosis-run',{...ctx,token:prepared.token,operationId});
  });
  if(value)show(value);update();
 };
 check.onclick=async()=>{const value=await work(()=>transport.call('diagnosis-read',{...context()}));if(value!==undefined)show(value);};
 document.addEventListener('configuration-invalidated',()=>{generation++;panel.hidden=true;clearPreview();problem.value=failure.value=result.textContent=status.textContent='';entry.hidden=true;update();});
 new MutationObserver(()=>{entry.hidden=!$('beginner-message').textContent.trim()||$('beginner-result-details').hidden;}).observe($('beginner-message'),{childList:true,characterData:true,subtree:true});
 for(const id of ['beginner-update','beginner-view','beginner-submit'])$(id).addEventListener('click',()=>{panel.hidden=true;});
 return {update};
}
