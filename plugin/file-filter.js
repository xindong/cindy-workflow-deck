export function createFileFilter({state,onChange,onRestore,english=false}) {
 const say=(zh,en)=>english?en:zh,$=id=>document.getElementById(id);
 const bar=document.createElement('div');bar.id='beginner-file-filters';bar.className='file-filters';
 const searchLabel=document.createElement('label'),search=document.createElement('input'),typeLabel=document.createElement('label'),type=document.createElement('select'),restore=document.createElement('button');
 search.type='search';search.id='beginner-file-search';search.placeholder=say('目录或文件名','Folder or filename');searchLabel.textContent=say('筛选文件','Filter files');searchLabel.append(search);
 type.id='beginner-file-type';typeLabel.textContent=say('文件类型','File type');typeLabel.append(type);
 const directoryLabel=document.createElement('label'),directory=document.createElement('select'),selectDirectory=document.createElement('button');
 directory.id='beginner-file-directory';directoryLabel.textContent=say('按目录选择（含子目录）','Select by folder (including subfolders)');directoryLabel.append(directory);
 selectDirectory.id='beginner-select-directory';selectDirectory.type='button';selectDirectory.textContent=say('全选此目录','Select this folder');
 selectDirectory.title=say('勾选此目录及子目录中符合当前筛选条件的文件，保留其它已选文件','Select matching files in this folder and subfolders; keep other selections');
 const bottom=document.createElement('button');bottom.id='beginner-files-bottom';bottom.type='button';bottom.textContent=say('跳到底部','Jump to bottom');bottom.title=say('直接滚到当前文件列表的最后一项','Scroll to the last file in the current list');bottom.setAttribute('aria-controls','beginner-files');
 bottom.onclick=()=>{if(bottom.disabled)return;const list=$('beginner-files');list.focus({preventScroll:true});list.scrollTop=list.scrollHeight;};
 restore.id='beginner-restore-filtered';restore.type='button';restore.textContent=say('还原筛选结果','Restore filtered files');bar.append(searchLabel,typeLabel,directoryLabel,selectDirectory,bottom,restore);$('beginner-files').before(bar);
 const extension=name=>{const file=name.split('/').pop(),dot=file.lastIndexOf('.');return dot>0?file.slice(dot).toLowerCase():'<none>';};
 function matches(item){return item.path.toLowerCase().includes(search.value.trim().toLowerCase())&&(type.value==='*'||extension(item.path)===type.value);}
 function visible(){return (state()?.changes||[]).filter(matches);}
 function inDirectory(path){return directory.value==='.'?!path.includes('/'):!!directory.value&&path.startsWith(directory.value+'/');}
 function directoryBoxes(){return [...$('beginner-files').querySelectorAll('.beginner-file:not([hidden])')].filter(row=>inDirectory(row.dataset.path)).map(row=>row.querySelector('input[type=checkbox]')).filter(Boolean);}
 function renderDirectories(){
  const previous=directory.value,counts=new Map();
  for(const item of visible()){
   const parts=item.path.split('/');parts.pop();
   if(!parts.length)counts.set('.',(counts.get('.')||0)+1);
   for(let i=1;i<=parts.length;i++){const name=parts.slice(0,i).join('/');counts.set(name,(counts.get(name)||0)+1);}
  }
  directory.replaceChildren(new Option(say('请选择目录','Choose a folder'),''),...[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>new Option((name==='.'?say('根目录文件（不含子目录）','Root files (no subfolders)'):name+'/')+' ('+count+')',name)));
  directory.value=counts.has(previous)?previous:'';
 }
 function apply(){for(const row of $('beginner-files').children){row.hidden=!matches({path:row.dataset.path});if(row.hidden){const check=row.querySelector('input');if(check)check.checked=false;}}}
 function render(){
  const previous=type.value||'*',counts=new Map();for(const item of state()?.changes||[]){const ext=extension(item.path);counts.set(ext,(counts.get(ext)||0)+1);}
  type.replaceChildren(new Option(say('全部类型','All types'),'*'),...[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([ext,count])=>new Option((ext==='<none>'?say('无扩展名','No extension'):ext)+' ('+count+')',ext)));
  type.value=counts.has(previous)?previous:'*';apply();renderDirectories();
 }
 function update(can,blocked){const files=visible(),boxes=directoryBoxes();search.disabled=type.disabled=directory.disabled=!can;bottom.disabled=!can||!files.length;selectDirectory.disabled=!can||!boxes.some(box=>!box.checked);restore.disabled=!can||!!blocked||!files.length||files.length>200||!state()?.head||files.some(f=>/[URC]/.test(f.status)||['AA','DD'].includes(f.status));}
 search.oninput=type.onchange=()=>{apply();renderDirectories();onChange();};
 directory.onchange=()=>onChange();
 selectDirectory.onclick=()=>{if(selectDirectory.disabled)return;for(const box of directoryBoxes())if(!box.disabled)box.checked=true;onChange();};
 restore.onclick=()=>{if(!restore.disabled)onRestore(visible());};
 render();return {visible,render,update,reset(){search.value='';type.value='*';directory.value='';render();},setHidden(value){bar.hidden=value;}};
}
