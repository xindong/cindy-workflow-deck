// Rehearse restoration in an isolated index/worktree, before stashing real files.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const execute=require('node:util').promisify(execFile);
async function stashHead(ctx) {
  try {return (await ctx.run(['rev-parse','--verify','refs/stash'])).trim();}
  catch(error){if(error.code===128)return '';throw error;}
}
async function preflight(ctx,state,target,env) {
  // Never temporarily shelve changes when fast-forwarding is impossible.
  try {await ctx.run(['merge-base','--is-ancestor',state.head,target]);}
  catch(error){if(error.code===1)throw Object.assign(new Error('本地版本与团队版本已分叉，请负责人处理。'),{code:'UPDATE_DIVERGED'});throw error;}
  const changes=(await ctx.run(['diff','--raw','--no-ext-diff','--no-textconv','--no-abbrev','--no-renames','-z',state.head,target],{filenameList:true})).split('\0');
  if(changes.some(row=>/^:(?:160000 \d{6}|\d{6} 160000) /.test(row)))
    throw Object.assign(new Error('团队版本改变了子模块，请负责人完整更新子模块后再继续；本地文件尚未修改。'),{code:'UPDATE_SUBMODULE_REQUIRED'});
  const incoming=(await ctx.run(['ls-tree','-r','--name-only','-z',target],{filenameList:true})).split('\0').filter(Boolean);
  const ignored=(await ctx.run(['ls-files','--others','--ignored','--exclude-standard','-z'],{filenameList:true})).split('\0').filter(Boolean);
  const untracked=[...state.changes.filter(c=>c.status==='??').map(c=>c.path),...ignored];
  // Even equal bytes must not silently turn an untracked asset into a tracked file.
  const exact=new Set(incoming), directories=new Set();
  for(const name of incoming)for(let i=name.indexOf('/');i!==-1;i=name.indexOf('/',i+1))directories.add(name.slice(0,i));
  const collisions=untracked.filter(name=>{
    if(exact.has(name)||directories.has(name))return true;
    for(let i=name.indexOf('/');i!==-1;i=name.indexOf('/',i+1))if(exact.has(name.slice(0,i)))return true;
    return false;
  });
  if(collisions.length)throw Object.assign(new Error('新增文件与团队文件重名：'+collisions.slice(0,10).join('、')),{code:'UPDATE_CONFLICT'});
  if(!state.changes.length)return;
  // stash create only writes objects: it does not modify files, index or refs/stash.
  const trackedStash=(await ctx.run(['stash','create','jixin-update-preflight'])).trim();
  if(!trackedStash)return;
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'jixin-update-preflight-'));
  try {
    const options={env:{...env,GIT_LFS_SKIP_SMUDGE:'1'},timeout:90000,maxBuffer:2*1024*1024,windowsHide:true};
    await execute(ctx.binary||'git',['clone','--shared','--no-checkout','--no-hardlinks','--',ctx.root,temporary],options);
    const run=args=>execute(ctx.binary||'git',['--no-optional-locks','-c','core.fsmonitor=false','-C',temporary,...args],options);
    // read-tree avoids checkout hooks; the trial must not run project scripts.
    await run(['read-tree','--reset','-u',target]);
    await run(['update-ref','HEAD',target]);
    try {await run(['stash','apply','--index',trackedStash]);}
    catch(error){throw Object.assign(new Error('团队更新与本地修改或暂存内容无法安全合并，请负责人处理。'),{code:'UPDATE_CONFLICT',stderr:error.stderr});}
  } finally {await fs.rm(temporary,{recursive:true,force:true});}
}
module.exports={preflight,stashHead};
