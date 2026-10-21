const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const execute=promisify(execFile);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const nameOK=value=>typeof value==='string'&&value.trim().length>0&&value.length<=200&&!/[<>\x00-\x1f\x7f]/.test(value);
const emailOK=value=>typeof value==='string'&&value.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)&&!/[\x00-\x1f\x7f]/.test(value);
async function current(ctx){
 const result={};
 for(const [field,key] of [['name','user.name'],['email','user.email']]){
  try{result[field]=(await ctx.run(['config','--get',key])).trim();}catch(e){if(e.code!==1)throw e;result[field]='';}
 }
 return result;
}
async function inspectIdentity(ctx,env){
 const existing=await current(ctx),missing=['name','email'].filter(k=>!existing[k]);
 if(!missing.length)return {state:'ready',...existing};
 // Never infer identity from project authors, OS usernames or directory names.
 let remote='';try{remote=(await ctx.run(['remote','get-url','origin'])).trim();}catch{}
 if(!/^(?:https:[/][/]github\.com[/]|git@github\.com:|ssh:[/][/]git@github\.com[/])[A-Za-z0-9_.-]+[/][A-Za-z0-9_.-]+(?:[/])?$/.test(remote))return {state:'unavailable',missing,message:'未能从当前项目确认 GitHub 账号来源，请先连接该项目使用的 GitHub 账号，再点重新检测；无需手填署名。'};
 const clean={...env};delete clean.GH_REPO;delete clean.GH_HOST;
 let user;
 try{user=JSON.parse((await execute('gh',['api','user','--hostname','github.com'],{cwd:ctx.root,env:clean,timeout:12000,maxBuffer:64*1024,windowsHide:true})).stdout);}catch{return {state:'unavailable',missing,message:'暂时无法读取本机 GitHub 账号，请先确认 GitHub CLI 已连接账号及网络正常，再点重新检测；无需手填姓名和邮箱。'};}
 if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,99})$/.test(user?.login||'')||!Number.isSafeInteger(user.id)||user.id<1)return {state:'unavailable',missing,message:'GitHub 返回的账号信息无法确认，请重新检测账号。'};
 const candidate={name:existing.name||(nameOK(user.name)?user.name.trim():user.login),email:existing.email||`${user.id}+${user.login}@users.noreply.github.com`};
 if(!nameOK(candidate.name)||!emailOK(candidate.email))return {state:'unavailable',missing,message:'现有署名格式无法确认，请负责人核对账号设置后重新检测。'};
 return {state:'available',missing,...candidate,login:user.login,source:'GitHub.com 当前登录账号；缺失邮箱使用 GitHub 免公开地址，仅保存到当前项目'};
}
async function fillIdentity(ctx,env,params){
 if(params.confirmIdentity!==true)fail('IDENTITY_NOT_CONFIRMED','请点一键补齐，确认使用检测到的账号署名。');
 const gitDir=path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-dir'])).trim()),common=path.resolve(ctx.root,(await ctx.run(['rev-parse','--git-common-dir'])).trim());
 if(gitDir!==common)fail('SETUP_SHARED_WORKTREE','当前工作目录共享 Git 设置，请负责人核对一次。');
 const found=await inspectIdentity(ctx,env);if(found.state==='ready')return found;
 if(found.state!=='available')fail('GIT_IDENTITY_REQUIRED',found.message);
 if(!params.identity||['name','email','login'].some(k=>params.identity[k]!==found[k]))fail('IDENTITY_CHANGED','检测到的账号或署名已变化，请重新检测后再点一键补齐。');
 const previous={};
 for(const key of found.missing){try{previous[key]=await ctx.run(['config','--local','--get',`user.${key}`]);}catch(e){if(e.code!==1)throw e;previous[key]=null;}}
 const written=[];
 try{
  for(const key of found.missing){written.push(key);await ctx.run(['config','--local',`user.${key}`,found[key]]);}
  const actual=await current(ctx);if(actual.name!==found.name||actual.email!==found.email)fail('IDENTITY_VERIFY_FAILED','署名保存结果不一致，请重新检测。');
  return {state:'ready',...actual,source:found.source};
 }catch(error){
  for(const key of written.reverse())try{await ctx.run(previous[key]===null?['config','--local','--unset-all',`user.${key}`]:['config','--local',`user.${key}`,previous[key].trimEnd()]);}catch{}
  fail('IDENTITY_SAVE_FAILED','署名未能完整保存，请重新检测当前项目后重试。');
 }
}
module.exports={inspectIdentity,fillIdentity};
