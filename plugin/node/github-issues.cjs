const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
async function repository(ctx) {
 let remote;try {remote=(await ctx.run(['config','--get','remote.origin.url'])).trim();}catch {fail('ISSUE_REPOSITORY_REQUIRED','当前项目还没有配置团队仓库，请联系项目负责人。');}
 const match=remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
 if(!match||[match[1],match[2]].some(s=>s==='.'||s==='..'))fail('ISSUE_REPOSITORY_REQUIRED','送审和关联事项需要当前项目的 origin 指向 GitHub.com 仓库。请联系项目负责人核对，文件不会被改动。');
 return match[1]+'/'+match[2];
}
function options(ctx,env) {
 const clean={...env};delete clean.GH_REPO;delete clean.GH_HOST;
 return {cwd:ctx.root,env:clean,timeout:20000,maxBuffer:512*1024,windowsHide:true};
}
async function json(ctx,env,args) {
 try {return JSON.parse((await execute('gh',args,options(ctx,env))).stdout);}
 catch {fail('ISSUE_READ_FAILED','暂时无法读取 GitHub 事项。请检查本机审核账号、网络和当前仓库访问权限，再点“加载我的事项”；不会提交文件或自动重试。');}
}
async function actor(ctx,env) {
 const user=await json(ctx,env,['api','user','--hostname','github.com']);
 if(typeof user.login!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(user.login))fail('ISSUE_READ_FAILED','无法确认当前 GitHub 账号，请联系项目负责人检查账号连接。');
 return user.login;
}
function issueValue(value,repo) {
 const url=value.html_url||value.url;
 if(!Number.isSafeInteger(value.number)||value.number<1||typeof value.title!=='string'||value.title.length>1000||typeof url!=='string'||url.toLowerCase()!==('https://github.com/'+repo+'/issues/'+value.number).toLowerCase())fail('ISSUE_INVALID','事项信息与当前项目不一致，请重新加载事项。');
 return {number:value.number,title:value.title,url,repository:repo};
}
const own=(value,login)=>[value.author?.login,value.user?.login,...(value.assignees||[]).map(a=>a.login)].some(s=>typeof s==='string'&&s.toLowerCase()===login.toLowerCase());
async function listIssues(ctx,params,env) {
 const scope=params.scope||'assigned';if(!['assigned','created'].includes(scope))fail('ISSUE_INVALID','请选择“分配给我的”或“我创建的”。');
 const repo=await repository(ctx),login=await actor(ctx,env);
 const rows=await json(ctx,env,['issue','list','--repo',repo,'--state','open',scope==='assigned'?'--assignee':'--author',login,'--limit','100','--json','number,title,url,author,assignees']);
 if(!Array.isArray(rows)||rows.length>100)fail('ISSUE_INVALID','事项列表无法读取，请重新加载。');
 const issues=rows.filter(row=>scope==='assigned'?(row.assignees||[]).some(a=>a.login?.toLowerCase()===login.toLowerCase()):row.author?.login?.toLowerCase()===login.toLowerCase()).map(row=>issueValue(row,repo));
 return {repository:repo,login,scope,issues,limited:rows.length===100};
}
async function validateIssue(ctx,selection,env) {
 if(!selection||!Number.isSafeInteger(selection.number)||selection.number<1||typeof selection.repository!=='string')fail('ISSUE_INVALID','请从当前项目的事项列表中选择，再确认提交。');
 const repo=await repository(ctx);if(selection.repository.toLowerCase()!==repo.toLowerCase())fail('ISSUE_INVALID','选择的事项属于另一个项目，请重新加载事项。');
 const login=await actor(ctx,env),value=await json(ctx,env,['api','repos/'+repo+'/issues/'+selection.number,'--hostname','github.com']);
 const result=issueValue(value,repo);
 if(value.pull_request||value.state!=='open'||!own(value,login))fail('ISSUE_UNAVAILABLE','该事项已关闭，或不再属于当前登录账号。请重新加载并选择自己的未关闭事项；本次未提交文件。');
 return {...result,login};
}
module.exports={listIssues,validateIssue,repository,options};
