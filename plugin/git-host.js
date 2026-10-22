import { requestNode } from './node-request.js';
// Keep application failures inside result: they are not JSON-RPC protocol failures.
export async function gitWithHost(node, dir, params) {
  const reply=await requestNode(node,{method:'project/git',params:{...params,dir},timeoutMs:120000,...(params.action?.startsWith('beginner-')?{maxTotalMs:900000}:{})});
  if(!reply?.ok || reply.error) throw Object.assign(new Error(reply?.error?.message || reply?.message || 'Git 操作未完成，请重新检查'),{code:reply?.error?.data?.code || reply?.errorCode || 'GIT_OPERATION_FAILED'});
  const result=reply.result;
  if(result?.kind==='jixin-git-result-v1') {
    if(!result.ok)throw Object.assign(new Error(result.error?.message || 'Git 操作未完成，请重新检查'),{code:result.error?.code || 'GIT_OPERATION_FAILED'});
    return result.value;
  }
  return result; // Compatible with earlier workers during an update.
}
