import {configurationState} from './core/project-config.mjs';
import {diagnosisPacket,diagnosisPrompt,redactDiagnosis} from './core/diagnosis.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function createDiagnosisService({store,git,askText,now=()=>Date.now(),newId=()=>crypto.randomUUID()}) {
 const prepared=new Map();let active=false;
 async function current(params){const data=await store.read(),config=configurationState(data),project=config.configuration.projects.find(p=>p.id===config.configuration.activeProjectId&&p.id===params.projectId);if(!project||config.revision!==params.revision)fail('CONFIG_CONFLICT','项目配置已变化，请重新打开诊断。');return {project,data};}
 return async function handle(method,params={}) {
  const {project,data}=await current(params);
  if(method==='diagnosis-read'){const record=data.diagnosisReceipt;if(!record||record.projectId!==project.id||record.revision!==params.revision)return null;return {...record,...(record.state==='running'&&now()-record.startedAt>90000?{state:'uncertain'}:{})};}
  if(method==='diagnosis-prepare'){
   if(typeof params.problem!=='string'||params.problem.length>2000||typeof (params.failure||'')!=='string'||(params.failure||'').length>10000)fail('INVALID_REQUEST','请将问题缩短到2000字以内。');
   let snapshot,error;try{snapshot=await git(project.directory,{action:'diagnosis-status'});}catch(e){error=e;}
   await current(params);const packet=diagnosisPacket({project,snapshot,error,problem:params.problem,failure:params.failure,now:now()});
   for(const [key,value]of prepared)if(value.expires<now())prepared.delete(key);
   if(prepared.size>=12)prepared.delete(prepared.keys().next().value);
   const token=newId();prepared.set(token,{packet,projectId:project.id,revision:params.revision,english:!!params.english,expires:now()+300000});
   return {token,packet,available:typeof askText==='function',ai:typeof askText==='function'?'Cindy 插件所选模型（未指定时使用快速通道）':'独立应用尚未接入 AI；可保留此诊断信息交给负责人',previous: data.diagnosisReceipt?.projectId===project.id&&data.diagnosisReceipt?.revision===params.revision?data.diagnosisReceipt:null};
  }
  if(method!=='diagnosis-run')fail('UNKNOWN_ACTION','未知诊断操作。');
  if(typeof params.operationId!=='string'||!/^[a-zA-Z0-9-]{16,60}$/.test(params.operationId))fail('INVALID_REQUEST','诊断请求编号无效。');
  if(data.diagnosisReceipt?.operationId===params.operationId)return data.diagnosisReceipt;
  if(!askText)fail('AI_UNAVAILABLE','独立应用尚未配置 AI。请使用 Cindy 插件的 AI 诊断；本地诊断信息和 Git 功能仍可使用。');
  if(active||data.diagnosisReceipt?.state==='running'&&now()-data.diagnosisReceipt.startedAt<90000)fail('BUSY','上次诊断仍在处理中，请先检查诊断结果。');
  const item=prepared.get(params.token);if(!item||item.expires<now()||item.projectId!==project.id||item.revision!==params.revision)fail('DIAGNOSIS_EXPIRED','诊断预览已过期，请重新检查并预览，再确认发送。');
  active=true;let record={operationId:params.operationId,projectId:project.id,revision:params.revision,state:'running',startedAt:now()};
  try{
   await store.update(()=>({diagnosisReceipt:record}));prepared.delete(params.token);
   await current(params);
   const reply=await askText(diagnosisPrompt(item.packet,item.english));
   if(!reply?.ok||typeof reply.text!=='string'||!reply.text.trim()) {
    const code=reply?.errorCode||'AI_UNAVAILABLE';record={...record,state:'failed',code,message:code==='PERMISSION_DENIED'?'尚未允许此插件调用 AI，请在 Cindy 插件详情中检查 AI 提问权限。':code==='NO_CANDIDATE'?'当前没有可用的 AI 模型，请在 Cindy 插件详情的模型与任务中配置后重新诊断。':'AI 未返回诊断结果，请检查模型连接后重新预览。未执行修复。'};
   }else{
    const text=redactDiagnosis(reply.text);let end=text.length;while(new TextEncoder().encode(text.slice(0,end)).length>12000)end=Math.floor(end*.85);
    record={...record,state:'completed',text:text.slice(0,end),truncated:end<text.length,model:redactDiagnosis(reply.model||'宿主未返回型号').slice(0,200)};
   }
   await store.update(()=>({diagnosisReceipt:record}));return record;
  }catch(error){
   // A missing answer is not proof that inference never ran. Do not repeat it.
   record={...record,state:'uncertain',message:'诊断回执未确认，请点“检查诊断结果”；不会自动重复请求 AI。'};
   try{await store.update(()=>({diagnosisReceipt:record}));}catch{}
   throw Object.assign(new Error(record.message),{code:'RESPONSE_UNCONFIRMED'});
  }finally{active=false;}
 };
}
