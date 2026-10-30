const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const LIMIT=1024*1024,MAX_FILES=2000;
async function list(ctx) {
  const fields=(await ctx.run(['stash','list','-101','-z','--format=%H%x00%gd%x00%gs%x00%cI'])).split('\0');
  const entries=[];
  for(let i=0;i+3<fields.length;i+=4)entries.push({id:fields[i],ref:fields[i+1],subject:fields[i+2],createdAt:fields[i+3]});
  return {entries:entries.slice(0,100),limited:entries.length>100};
}
async function selected(ctx,id) {
  if(typeof id!=='string'||! /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id))fail('INVALID_STASH','请选择列表中的暂存记录。');
  const entry=(await list(ctx)).entries.find(item=>item.id===id);
  if(!entry)fail('STASH_CHANGED','这条暂存记录已移除或超出显示范围，请刷新列表后重选。');
  const parents=(await ctx.run(['rev-list','--parents','-1',id])).trim().split(' ').slice(1);
  if(parents.length<2||parents.length>3)fail('INVALID_STASH','暂存记录结构无法识别，请使用项目专业工具核对。');
  return {...entry,base:parents[0],index:parents[1],untracked:parents[2]||''};
}
function validPath(name) {
  if(typeof name!=='string'||!name||name.includes('\0')||name.includes('\\')||name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'))fail('INVALID_PATHS','暂不支持此文件路径，请使用项目专业工具查看。');
  if(process.platform==='win32'&&name.split('/').some(p=>/[<>:"|?*\x00-\x1f]/.test(p)||/[ .]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('INVALID_PATHS','此文件名不适用于 Windows，请使用项目专业工具查看。');
}
async function files(ctx,entry) {
  const rows=new Map();
  for(const [tree,area] of [[entry.id,'working'],[entry.index,'staged']]) {
    const fields=(await ctx.run(['diff-tree','--no-commit-id','-r','--no-renames','--name-status','-z',entry.base,tree,'--'],{filenameList:true})).split('\0');
    for(let i=0;i+1<fields.length;i+=2) {
      const status=fields[i],name=fields[i+1];if(!status)continue;
      let row=rows.get(name);if(!row){row={path:name,status,areas:[]};rows.set(name,row);}
      row.areas.push(area);if(area==='working')row.status=status;
      if(rows.size>MAX_FILES)fail('STASH_TOO_LARGE','这条暂存记录超过2000个文件，请使用项目专业工具查看。');
    }
  }
  if(entry.untracked)for(const name of (await ctx.run(['ls-tree','-r','--name-only','-z',entry.untracked],{filenameList:true})).split('\0').filter(Boolean)) {
    rows.set(name,{path:name,status:'A',areas:['untracked']});
    if(rows.size>MAX_FILES)fail('STASH_TOO_LARGE','这条暂存记录超过2000个文件，请使用项目专业工具查看。');
  }
  return [...rows.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
async function treeFile(ctx,tree,name) {
  const text=await ctx.run(['ls-tree','-l','-z',tree,'--',':(literal)'+name]);
  if(!text)return {exists:false,mode:'',size:0};
  const tab=text.indexOf('\t'),[mode,type,oid,sizeText]=text.slice(0,tab).trim().split(/\s+/);
  if(text.slice(tab+1,-1)!==name||!['100644','100755'].includes(mode)||type!=='blob')fail('UNSUPPORTED_FILE','链接、目录或子模块请使用项目专业工具对比。');
  const size=Number(sizeText),result={exists:true,mode,size};
  if(!Number.isSafeInteger(size)||size<0)fail('UNSUPPORTED_FILE','无法确定文件大小，请使用项目专业工具对比。');
  if(size>LIMIT)return result;
  return {...result,content:await ctx.run(['cat-file','blob',oid],{raw:true})};
}
async function localFile(ctx,name) {
  let target=ctx.root;
  for(const part of name.split('/')) {
    target=path.join(target,part);
    try {const stat=await fs.lstat(target);if(stat.isSymbolicLink())fail('UNSUPPORTED_FILE','本地路径是链接，请使用项目专业工具对比。');}
    catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return {exists:false,mode:'',size:0};throw error;}
  }
  const relative=path.relative(ctx.root,await fs.realpath(target));
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))fail('INVALID_PATHS','文件不在当前项目内。');
  const handle=await fs.open(target,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));
  try {
    const stat=await handle.stat();if(!stat.isFile())fail('UNSUPPORTED_FILE','本地对应路径不是普通文件，请使用项目专业工具对比。');
    const result={exists:true,size:stat.size,mode:stat.mode&0o111?'100755':'100644'};
    if(stat.size>LIMIT)return result;
    const buffer=Buffer.alloc(LIMIT+1);let count=0;
    while(count<buffer.length){const {bytesRead}=await handle.read(buffer,count,buffer.length-count,null);if(!bytesRead)break;count+=bytesRead;}
    if(count>LIMIT)return {...result,size:count};
    return {...result,content:buffer.subarray(0,count)};
  } finally {await handle.close();}
}
async function latestRemote(ctx,state) {
  let branch='';
  const upstream=state.branch?(await ctx.run(['for-each-ref','--format=%(upstream:remotename)%00%(upstream:remoteref)','refs/heads/'+state.branch])).trim().split('\0'):[];
  if(upstream[0]) {
    if(upstream[0]!=='origin'||!upstream[1]?.startsWith('refs/heads/'))fail('REMOTE_NOT_SUPPORTED','当前分支跟踪的不是 origin，请联系负责人核对线上目标。');
    branch=upstream[1].slice(11);
  } else {
    // Query the server, not the possibly stale origin/* cache.
    const refs=await ctx.run(['ls-remote','--symref','origin',...(state.branch?['refs/heads/'+state.branch]:[]),'HEAD']);
    if(state.branch&&refs.split('\n').some(line=>line.endsWith('\trefs/heads/'+state.branch)))branch=state.branch;
    else branch=refs.split('\n').find(line=>line.startsWith('ref: refs/heads/'))?.match(/^ref: refs\/heads\/(.+)\tHEAD$/)?.[1]||'';
  }
  if(!branch)fail('TEAM_NOT_CONFIGURED','无法确定服务器上的对比分支，请联系项目负责人配置 origin。');
  await ctx.run(['check-ref-format','refs/heads/'+branch]);
  try {await ctx.run(['fetch','--no-tags','--no-recurse-submodules','origin','+refs/heads/'+branch+':refs/remotes/origin/'+branch]);}
  catch(error){fail('STASH_REMOTE_FAILED','暂时无法获取服务器最新版本，请检查网络和项目连接后重试；没有使用旧缓存冒充最新版本。\n'+(error.stderr||error.message));}
  const commit=(await ctx.run(['rev-parse','--verify','refs/remotes/origin/'+branch+'^{commit}'])).trim();
  return {target:'origin/'+branch,commit};
}
const isBinary=buffer=>buffer?.includes(0);
const isLfs=buffer=>buffer?.subarray(0,100).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1');
async function compare(ctx,state,params,entry,rows) {
  validPath(params.path);
  const row=rows.find(item=>item.path===params.path);if(!row)fail('STASH_CHANGED','文件不在这条暂存记录中，请刷新后重选。');
  if(!['local','remote'].includes(params.target))fail('INVALID_TARGET','请选择本地或服务器最新版本。');
  const saved=await treeFile(ctx,row.areas.includes('untracked')?entry.untracked:entry.id,row.path);
  const remote=params.target==='remote'?await latestRemote(ctx,state):null;
  const other=remote?await treeFile(ctx,remote.commit,row.path):await localFile(ctx,row.path);
  const english=params.english===true,say=(zh,en)=>english?en:zh;
  const metadata={saved:{exists:saved.exists,size:saved.size,mode:saved.mode},other:{exists:other.exists,size:other.size,mode:other.mode}};
  const result={entry:entry.id,path:row.path,target:remote?.target||say('当前本地工作区','Current local working tree'),commit:remote?.commit||'',checkedAt:new Date().toISOString(),...metadata};
  if(saved.size>LIMIT||other.size>LIMIT)return {...result,summaryOnly:true,output:say('文件超过1 MiB，仅显示大小、存在状态和权限摘要。请使用项目专业工具查看内容差异。','A file exceeds 1 MiB. Only size, presence and mode are shown; use project tools for content comparison.')};
  if(isLfs(saved.content)||isLfs(other.content))return {...result,summaryOnly:true,output:say('这是 Git LFS 文件，仅比较指针元数据，不下载资源本体。','Git LFS file: comparing pointer metadata only; assets are not downloaded.')+'\n\nStash:\n'+(saved.content?.toString('utf8')||'(missing)')+'\n'+result.target+':\n'+(other.content?.toString('utf8')||'(missing)')};
  if(isBinary(saved.content)||isBinary(other.content))return {...result,summaryOnly:true,output:say('二进制文件：','Binary file: ')+(saved.content?.equals(other.content||Buffer.alloc(0))&&saved.exists===other.exists?say('内容一致。','Contents match.'):say('内容不同（含新增或删除），请使用项目专业工具查看。','Contents differ (including additions or deletions); use project tools to inspect.'))};
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'jixin-stash-diff-'));
  let output='';
  try {
    const left=path.join(temporary,'stash'),right=path.join(temporary,'comparison');
    await fs.writeFile(left,saved.content||Buffer.alloc(0),{mode:0o600});await fs.writeFile(right,other.content||Buffer.alloc(0),{mode:0o600});
    try {output=await ctx.run(['diff','--no-index','--no-color','--no-ext-diff','--no-textconv','--',left,right]);}
    catch(error){if(error.code===1)output=error.stdout;else throw error;}
    output=output.split('\n').map(line=>line.startsWith('diff --git ')?'diff --git '+JSON.stringify('stash/'+row.path)+' '+JSON.stringify(params.target+'/'+row.path):line.startsWith('--- ')?'--- '+(saved.exists?'stash/'+row.path:'/dev/null'):line.startsWith('+++ ')?'+++ '+(other.exists?params.target+'/'+row.path:'/dev/null'):line).join('\n');
  } finally {await fs.rm(temporary,{recursive:true,force:true});}
  if(!output&&saved.exists!==other.exists)output=say('空文件的存在状态不同。','Empty file presence differs.');
  if(!output&&saved.mode!==other.mode)output=say('内容一致，文件权限不同。','Contents match; file modes differ.');
  return {...result,output:output||say('内容一致。','Contents match.')};
}
async function request(ctx,state,params) {
  if(params.action==='stash-list')return list(ctx);
  const entry=await selected(ctx,params.stashId),rows=await files(ctx,entry);
  if(params.action==='stash-files')return {entry,files:rows};
  return compare(ctx,state,params,entry,rows);
}
module.exports={request,selected,files,validPath};
