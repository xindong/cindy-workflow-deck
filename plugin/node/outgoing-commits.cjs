// Local remote-tracking refs are a cached observation, never a live server query.
async function read(ctx,state,withEntries=false) {
  const result={known:false,count:null,behind:null,target:'',cached:true,checkedAt:new Date().toISOString(),entries:[]};
  if(!state.head||!state.branch)return {...result,reason:'no-branch'};
  const upstream=(await ctx.run(['for-each-ref','--format=%(upstream)','refs/heads/'+state.branch])).trim();
  if(upstream&&!upstream.startsWith('refs/remotes/'))return {...result,reason:'local-upstream'};
  const candidate=upstream||'refs/remotes/origin/'+state.branch;
  let exists=false;
  try {await ctx.run(['rev-parse','--verify',candidate+'^{commit}']);exists=true;}catch(error){if(typeof error.code!=='number')throw error;}
  let range;
  if(exists) {
    const [behind,count]=(await ctx.run(['rev-list','--left-right','--count',candidate+'...HEAD'])).trim().split(/\s+/).map(Number);
    Object.assign(result,{known:true,count,behind,target:candidate.replace(/^refs\/remotes\//,''),reason:upstream?'upstream':'same-name'});range=[candidate+'..HEAD'];
  } else {
    if(upstream&&!upstream.startsWith('refs/remotes/origin/'))return {...result,target:upstream.replace(/^refs\/remotes\//,''),reason:'missing-upstream'};
    const refs=(await ctx.run(['for-each-ref','--format=%(refname)','refs/remotes/origin/'])).trim();
    if(!refs)return {...result,reason:'no-remote-cache'};
    range=['HEAD','--not','--remotes=origin'];Object.assign(result,{known:true,count:Number((await ctx.run(['rev-list','--count',...range])).trim()),target:'origin/*',reason:upstream?'missing-upstream':'unpublished-branch'});
  }
  if(withEntries&&result.count) {
    const fields=(await ctx.run(['log','-100','-z','--no-show-signature','--format=%H%x00%h%x00%s%x00%an%x00%cI',...range])).split('\0');
    for(let i=0;i+4<fields.length;i+=5)result.entries.push({id:fields[i],short:fields[i+1],subject:fields[i+2],author:fields[i+3],createdAt:fields[i+4]});
    result.limited=result.count>result.entries.length;
  }
  return result;
}
module.exports={read};
