import {redactDiagnosis} from './core/diagnosis.mjs';
export function mountDiagnosis({transport,context,isBusy,english=false}) {
 const $=id=>document.getElementById(id),say=(zh,en)=>english?en:zh;let busy=false,preview,operationId='',generation=0;
 const panel=document.createElement('section');panel.id='diagnosis-panel';panel.className='beginner-sheet';panel.hidden=true;
 function node(tag,text){const n=document.createElement(tag);if(text)n.textContent=text;return n;}
 const heading=node('h3',say('AI 诊断问题','AI issue diagnosis')),help=node('p',say('描述遇到的问题，先检查并预览，再发送给 AI。诊断只分析并给出建议，不执行修复。','Describe the issue, review the information, then send it to AI. Diagnosis gives advice without executing repairs.'));
 const label=node('label',say('遇到了什么问题？','What went wrong?')),problem=node('textarea');problem.id='diagnosis-problem';problem.rows=3;problem.maxLength=2000;label.append(problem);
 const failureLabel=node('label',say('最近错误（可修改或清空）','Recent error (edit or clear)')),failure=node('textarea');failure.id='diagnosis-failure';failure.rows=3;failure.maxLength=10000;failureLabel.append(failure);
 const controls=node('div');controls.className='row';
 const prepare=node('button',say('检查并预览','Check and preview')),send=node('button',say('确认发送，仅诊断','Send for diagnosis only')),check=node('button',say('检查诊断结果','Check diagnosis result')),close=node('button',say('收起','Close'));
 prepare.id='diagnosis-prepare';send.id='diagnosis-send';check.id='diagnosis-check';for(const n of [prepare,send,check,close])n.type='button';send.hidden=true;controls.append(prepare,send,check,close);
 const status=node('p');status.id='diagnosis-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const ai=node('p');ai.id='diagnosis-ai';const details=node('details'),summary=node('summary',say('将发送的信息（已做常见敏感信息脱敏，请核对）','Information to send (common secrets redacted; please review)')),packet=node('pre');details.id='diagnosis-preview';details.hidden=true;packet.id='diagnosis-packet';details.append(summary,packet);
 const errorDetails=node('details'),errorSummary=node('summary',say('技术详情','Technical details')),errorText=node('pre');errorDetails.id='diagnosis-error-details';errorDetails.hidden=true;errorDetails.append(errorSummary,errorText);
 const result=node('pre');result.id='diagnosis-result';result.setAttribute('role','log');
 panel.append(heading,help,label,failureLabel,controls,status,ai,details,errorDetails,result);$('beginner-sheet').after(panel);
 if(english)$('beginner-diagnose').querySelector('strong').textContent='AI issue diagnosis';
 const entry=node('button',say('让 AI 诊断这个问题','Diagnose this issue with AI'));entry.type='button';entry.id='diagnosis-from-error';entry.hidden=true;$('beginner-message').after(entry);
 function ctxKey(){return JSON.stringify([context().projectId,context().revision]);}
 function update(){const can=context().ready&&!isBusy();$('beginner-diagnose').disabled=entry.disabled=!can||busy;prepare.disabled=!can||busy;send.disabled=!can||busy||!preview?.available;check.disabled=!can||busy;problem.disabled=failure.disabled=busy;}
 function clearPreview(){preview=undefined;operationId='';errorDetails.hidden=true;send.hidden=true;details.hidden=true;packet.textContent='';ai.textContent='';}
 function show(record){
  if(!record){status.textContent=say('尚未发送诊断请求。','No diagnosis has been sent.');return;}
  operationId=record.operationId;errorDetails.hidden=true;

  if(record.state==='completed'){result.textContent=record.text+(record.truncated?say('\n（结果过长，已截短）','\n(Result truncated)'):'');ai.textContent=say('本次实际模型：','Actual model: ')+record.model;status.textContent=say('诊断已返回。建议尚未执行，请核对后再决定处理。','Diagnosis received. No suggested repair has been executed.');}
  else if(record.state==='failed'){status.textContent=record.message;errorText.textContent=record.code;errorDetails.hidden=false;}
  else status.textContent=record.message||say('诊断正在处理中；可稍后检查结果。请勿重复发送。','Diagnosis is pending; check the result later. Do not send it again.');
 }
 async function work(fn){if(busy)return;const key=ctxKey(),epoch=generation;busy=true;update();try{const value=await fn();if(epoch===generation&&key===ctxKey()&&context().ready)return value;}catch(error){if(epoch===generation&&key===ctxKey()){status.textContent=redactDiagnosis(error.message||say('诊断暂不可用，请检查 AI 连接。','Diagnosis is unavailable; check the AI connection.'));errorText.textContent=error.code||'';errorDetails.hidden=!error.code;}}finally{busy=false;update();}}
 function open(){panel.hidden=false;$('beginner-sheet').hidden=true;failure.value=redactDiagnosis(($('beginner-result-details').hidden?'':$('beginner-detail').textContent)||$('file-action-status')?.textContent||$('git-output').textContent||'').slice(0,10000);clearPreview();result.textContent='';status.textContent='';update();panel.scrollIntoView({block:'nearest'});}
 $('beginner-diagnose').onclick=entry.onclick=open;close.onclick=()=>{panel.hidden=true;};
 for(const input of [problem,failure])input.oninput=()=>{clearPreview();status.textContent=say('内容已变化，请重新检查并预览。','Information changed; check and preview again.');update();};
 prepare.onclick=async()=>{clearPreview();result.textContent='';status.textContent=say('正在读取本地状态，尚未发送给 AI…','Reading local status; nothing sent to AI yet…');const value=await work(()=>transport.call('diagnosis-prepare',{...context(),problem:problem.value,failure:failure.value,english}));if(!value)return;preview=value;packet.textContent=JSON.stringify(value.packet,null,2);details.hidden=false;details.open=true;ai.textContent=value.ai;send.hidden=!value.available;status.textContent=value.available?say('请核对待发送内容；确认后才会调用 AI，可能产生模型费用。','Review the information. AI is called only after confirmation and may incur model costs.'):say('独立应用尚未接入 AI。下方本地信息仍可查看；可在 Cindy 插件内使用 AI 诊断。','AI is not connected in the standalone app. Review the local information below or use AI diagnosis in the Cindy plugin.');update();};
 send.onclick=async()=>{if(send.disabled||!preview)return;const token=preview.token;operationId=crypto.randomUUID();send.hidden=true;status.textContent=say('AI 正在分析，请稍候…','AI is analyzing…');const value=await work(()=>transport.call('diagnosis-run',{...context(),token,operationId}));if(value)show(value);preview=undefined;update();};
 check.onclick=async()=>{const value=await work(()=>transport.call('diagnosis-read',{...context()}));if(value!==undefined)show(value);};
 document.addEventListener('configuration-invalidated',()=>{generation++;panel.hidden=true;clearPreview();problem.value=failure.value=result.textContent=status.textContent='';entry.hidden=true;update();});
 new MutationObserver(()=>{entry.hidden=!$('beginner-message').textContent.trim()||$('beginner-result-details').hidden;}).observe($('beginner-message'),{childList:true,characterData:true,subtree:true});
 for(const id of ['beginner-update','beginner-view','beginner-submit'])$(id).addEventListener('click',()=>{panel.hidden=true;});
 return {update};
}
