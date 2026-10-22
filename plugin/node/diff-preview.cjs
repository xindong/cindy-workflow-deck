const http=require('node:http');
const {randomBytes}=require('node:crypto');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages=new Map();let server,starting;
async function open(diff,english=false) {
  if(!starting)starting=new Promise((resolve,reject)=>{
    server=http.createServer((req,res)=>{
      const page=pages.get(req.url);
      if(req.method!=='GET'||!page||page.expires<Date.now()||req.headers.host!=='127.0.0.1:'+server.address().port){res.writeHead(404);res.end('Preview expired');return;}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});res.end(page.html);
    });
    server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.unref();resolve();});
  });
  await starting;
  for(const [key,p] of pages)if(p.expires<Date.now())pages.delete(key);
  while(pages.size>=12)pages.delete(pages.keys().next().value);
  const route='/diff/'+randomBytes(32).toString('hex');
  const title=english?'Online version → local file':'线上版本 → 本地文件';
  const lines=diff.output.split('\n').map(l=>'<span class="'+(l.startsWith('+')?'added':l.startsWith('-')?'removed':'context')+'">'+escape(l)+'</span>').join('\n');
  pages.set(route,{expires:Date.now()+15*60*1000,html:'<!doctype html><html lang="'+(english?'en':'zh-CN')+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(diff.path)+'</title><style>:root{color-scheme:light dark;font:14px/1.65 system-ui}body{margin:20px}h1{font-size:18px;overflow-wrap:anywhere}p{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 ui-monospace,monospace}pre span{display:inline}.added{font-weight:650}.removed{text-decoration:line-through}.context{opacity:.8}</style><h1>'+escape(diff.path)+'</h1><p>'+title+'<br>'+escape(diff.target)+' · '+escape(diff.commit)+'<br>'+escape(diff.checkedAt)+'</p><p>'+(english?'Read-only snapshot. Reopen from the file list for the latest comparison. Binary and LFS files may only show a change summary.':'只读差异快照；重新双击文件可获取最新对比。二进制及 LFS 文件可能仅显示变化摘要。')+'</p><pre>'+lines+'</pre></html>'});
  return 'http://127.0.0.1:'+server.address().port+route;
}
module.exports={open};
