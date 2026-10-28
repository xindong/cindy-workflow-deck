export function createFileFilter({state,onChange,onRestore,english=false}) {
 const say=(zh,en)=>english?en:zh,$=id=>document.getElementById(id);
 const bar=document.createElement('div');bar.id='beginner-file-filters';bar.className='file-filters';
 const searchLabel=document.createElement('label'),search=document.createElement('input'),typeLabel=document.createElement('label'),type=document.createElement('select'),restore=document.createElement('button');
 search.type='search';search.id='beginner-file-search';search.placeholder=say('目录或文件名','Folder or filename');searchLabel.textContent=say('筛选文件','Filter files');searchLabel.append(search);
 type.id='beginner-file-type';typeLabel.textContent=say('文件类型','File type');typeLabel.append(type);
 const directoryLabel=document.createElement('label'),directory=document.createElement('select'),selectDirectory=document.createElement('button');
 directory.id='beginner-file-directory';directoryLabel.textContent=say('按目录筛选（含子目录）','Filter by folder (including subfolders)');directoryLabel.append(directory);
 selectDirectory.id='beginner-select-directory';selectDirectory.type='button';selectDirectory.textContent=say('全选此目录','Select this folder');
 selectDirectory.title=say('勾选此目录及子目录中符合当前筛选条件的文件，保留其它已选文件','Select matching files in this folder and subfolders; keep other selections');
 const bottom=document.createElement('button');bottom.id='beginner-files-bottom';bottom.type='button';bottom.textContent=say('跳到底部','Jump to bottom');bottom.title=say('直接滚到当前文件列表的最后一项','Scroll to the last file in the current list');bottom.setAttribute('aria-controls','beginner-files');
 bottom.onclick=()=>{if(bottom.disabled)return;const list=$('beginner-files');list.focus({preventScroll:true});list.scrollTop=list.scrollHeight;};
 const clear=document.createElement('button');clear.id='beginner-clear-filters';clear.type='button';clear.textContent=say('清除筛选条件','Clear filters');
 clear.title=say('清空名称、类型和目录筛选，不修改文件或取消已有勾选','Reset name, type and folder filters without changing files or clearing checked files');
 restore.id='beginner-restore-filtered';restore.type='button';restore.textContent=say('丢弃筛选文件的修改…','Discard changes in filtered files…');
 restore.title=say('丢弃当前筛选结果中所有文件的暂存及未暂存修改，不以勾选为准；先查看确认清单并备份','Discard staged and unstaged changes in all filtered files, regardless of checkboxes; review the confirmation list and back up first');
 bar.append(searchLabel,typeLabel,directoryLabel,selectDirectory,bottom,clear,restore);$('beginner-files').before(bar);
 const extension=name=>{const file=name.split('/').pop(),dot=file.lastIndexOf('.');return dot>0?file.slice(dot).toLowerCase():'<none>';};
 function matchesNameType(item){return item.path.toLowerCase().includes(search.value.trim().toLowerCase())&&(type.value==='*'||extension(item.path)===type.value);}
 function matches(item){return matchesNameType(item)&&(!directory.value||inDirectory(item.path));}
 function visible(){return (state()?.changes||[]).filter(matches);}
 function inDirectory(path){return directory.value==='.'?!path.includes('/'):!!directory.value&&path.startsWith(directory.value+'/');}
 function directoryBoxes(){return [...$('beginner-files').querySelectorAll('.beginner-file:not([hidden])')].filter(row=>inDirectory(row.dataset.path)).map(row=>row.querySelector('input[type=checkbox]')).filter(Boolean);}
 function renderDirectories(){
  const previous=directory.value,counts=new Map();
  for(const item of (state()?.changes||[]).filter(matchesNameType)){
   const parts=item.path.split('/');parts.pop();
   if(!parts.length)counts.set('.',(counts.get('.')||0)+1);
   for(let i=1;i<=parts.length;i++){const name=parts.slice(0,i).join('/');counts.set(name,(counts.get(name)||0)+1);}
  }
  // Keep an explicit directory constraint when other filters yield no matches.
  // Drop it on refresh only if that directory no longer exists in the change list.
  if(previous&&!counts.has(previous)&&(state()?.changes||[]).some(item=>inDirectory(item.path)))counts.set(previous,0);
  directory.replaceChildren(new Option(say('全部目录','All folders'),''),...[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>new Option((name==='.'?say('根目录文件（不含子目录）','Root files (no subfolders)'):name+'/')+' ('+count+')',name)));
  directory.value=counts.has(previous)?previous:'';
 }
 function apply(){for(const row of $('beginner-files').children){row.hidden=!matches({path:row.dataset.path});if(row.hidden){const check=row.querySelector('input');if(check)check.checked=false;}}}
 function render(){
  const previous=type.value||'*',counts=new Map();for(const item of state()?.changes||[]){const ext=extension(item.path);counts.set(ext,(counts.get(ext)||0)+1);}
  type.replaceChildren(new Option(say('全部类型','All types'),'*'),...[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([ext,count])=>new Option((ext==='<none>'?say('无扩展名','No extension'):ext)+' ('+count+')',ext)));
  type.value=counts.has(previous)?previous:'*';renderDirectories();apply();
 }
 function update(can,blocked){const files=visible(),boxes=directoryBoxes();search.disabled=type.disabled=directory.disabled=!can;clear.disabled=!can||!(search.value||type.value!=='*'||directory.value);bottom.disabled=!can||!files.length;selectDirectory.disabled=!can||!boxes.some(box=>!box.checked);restore.disabled=!can||!!blocked||!files.length||files.length>200||!state()?.head||files.some(f=>/[URC]/.test(f.status)||['AA','DD'].includes(f.status));}
 search.oninput=type.onchange=()=>{renderDirectories();apply();onChange();};
 directory.onchange=()=>{apply();$('beginner-files').scrollTop=0;onChange();};
 selectDirectory.onclick=()=>{if(selectDirectory.disabled)return;for(const box of directoryBoxes())if(!box.disabled)box.checked=true;onChange();};
 restore.onclick=()=>{if(!restore.disabled)onRestore(visible());};
 function reset(){search.value='';type.value='*';directory.value='';render();}
 clear.onclick=()=>{if(clear.disabled)return;reset();$('beginner-files').scrollTop=0;onChange();};
 render();return {visible,render,update,reset,setHidden(value){bar.hidden=value;}};
}
