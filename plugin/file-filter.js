export function createFileFilter({state,onChange,onRestore,english=false}) {
 const say=(zh,en)=>english?en:zh,$=id=>document.getElementById(id);
 const bar=document.createElement('div');bar.id='beginner-file-filters';bar.className='file-filters';
 const searchLabel=document.createElement('label'),search=document.createElement('input'),typeLabel=document.createElement('label'),type=document.createElement('select'),restore=document.createElement('button');
 search.type='search';search.id='beginner-file-search';search.placeholder=say('目录或文件名','Folder or filename');searchLabel.textContent=say('筛选文件','Filter files');searchLabel.append(search);
 type.id='beginner-file-type';typeLabel.textContent=say('文件类型','File type');typeLabel.append(type);
 restore.id='beginner-restore-filtered';restore.type='button';restore.textContent=say('还原筛选结果','Restore filtered files');bar.append(searchLabel,typeLabel,restore);$('beginner-files').before(bar);
 const extension=name=>{const file=name.split('/').pop(),dot=file.lastIndexOf('.');return dot>0?file.slice(dot).toLowerCase():'<none>';};
 function matches(item){return item.path.toLowerCase().includes(search.value.trim().toLowerCase())&&(type.value==='*'||extension(item.path)===type.value);}
 function visible(){return (state()?.changes||[]).filter(matches);}
 function apply(){for(const row of $('beginner-files').children){row.hidden=!matches({path:row.dataset.path});if(row.hidden){const check=row.querySelector('input');if(check)check.checked=false;}}}
 function render(){
  const previous=type.value||'*',counts=new Map();for(const item of state()?.changes||[]){const ext=extension(item.path);counts.set(ext,(counts.get(ext)||0)+1);}
  type.replaceChildren(new Option(say('全部类型','All types'),'*'),...[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([ext,count])=>new Option((ext==='<none>'?say('无扩展名','No extension'):ext)+' ('+count+')',ext)));
  type.value=counts.has(previous)?previous:'*';apply();
 }
 function update(can,blocked){const files=visible();search.disabled=type.disabled=!can;restore.disabled=!can||!!blocked||!files.length||files.length>200||!state()?.head||files.some(f=>/[URC]/.test(f.status)||['AA','DD'].includes(f.status));}
 search.oninput=type.onchange=()=>{apply();onChange();};restore.onclick=()=>{if(!restore.disabled)onRestore(visible());};
 render();return {visible,render,update,reset(){search.value='';type.value='*';render();},setHidden(value){bar.hidden=value;}};
}
