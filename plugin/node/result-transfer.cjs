// Bounded immutable result pages: a read never repeats the original operation.
const {randomUUID}=require('node:crypto');
const MAX_BYTES=16*1024*1024,BUDGET=32*1024*1024,TTL=120000,CHUNK=65536;
function createResultTransfer({now=Date.now}={}) {
 const results=new Map();
 function sweep(){for(const [key,value] of results)if(value.expires<=now())results.delete(key);}
 return {
  wrap(result){
   const text=JSON.stringify(result),bytes=Buffer.byteLength(text);if(bytes<512*1024)return result;
   sweep();const used=[...results.values()].reduce((n,v)=>n+v.bytes,0);
   if(bytes>MAX_BYTES||used+bytes>BUDGET||results.size>=8)throw Object.assign(new Error('项目返回的信息过多，暂时无法显示完整结果。请联系项目负责人；若刚执行过更新或提交，请先核对实际结果，不要重复操作。'),{code:'RESULT_TOO_LARGE'});
   const token=randomUUID();results.set(token,{text,bytes,expires:now()+TTL});return {kind:'jixin-transfer-v1',token,length:text.length};
  },
  read({token,offset}={}){
   sweep();const value=results.get(token);
   if(!value||!Number.isSafeInteger(offset)||offset<0||offset>=value.text.length||offset%CHUNK!==0)throw Object.assign(new Error('读取结果已过期或不完整。请重新检查项目状态；不要重复提交或更新。'),{code:'RESULT_TRANSFER_EXPIRED'});
   return {token,offset,text:value.text.slice(offset,offset+CHUNK)};
  },
  release({token}={}){results.delete(token);return {released:true};},
 };
}
module.exports={createResultTransfer};
