// Reassemble result pages without retrying the operation that produced them.
export async function requestNode(node,options) {
 const reply=await node.request(options),descriptor=reply?.result;
 if(!reply?.ok||descriptor?.kind!=='jixin-transfer-v1')return reply;
 const fail=()=>{throw Object.assign(new Error('读取结果已中断，请重新检查项目状态；不要重复提交或更新。'),{code:'RESULT_TRANSFER_EXPIRED'});};
 const {token,length}=descriptor;
 if(typeof token!=='string'||!Number.isSafeInteger(length)||length<1||length>16*1024*1024)fail();
 let text='';
 try {
  while(text.length<length){
   const page=await node.request({method:'result/read',params:{token,offset:text.length},timeoutMs:30000});
   if(!page?.ok||page.error)fail();const chunk=page.result;
   if(chunk?.token!==token||chunk.offset!==text.length||typeof chunk.text!=='string'||chunk.text.length!==Math.min(65536,length-text.length))fail();
   text+=chunk.text;
  }
  let result;try{result=JSON.parse(text);}catch{fail();}return {...reply,result};
 } finally {
  // Cleanup failure cannot invalidate a known result; expiry also releases it.
  try{await node.request({method:'result/release',params:{token},timeoutMs:1000});}catch{}
 }
}
