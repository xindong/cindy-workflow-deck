export function createFileSelection({list,canSelect,onChange,english=false}) {
  let anchor;
  const hint=document.createElement('p');hint.id='file-selection-help';hint.className='file-selection-help';
  hint.textContent=english?'Shift + click: select a range · Ctrl/⌘ + click: toggle a file · Ctrl/⌘ + A: select filtered files (focus the list first)':'Shift + 点击：连续选择 · Ctrl/⌘ + 点击：勾选或取消单个 · Ctrl/⌘ + A：全选筛选结果（先聚焦文件列表）';
  document.getElementById('beginner-selection').append(hint);list.tabIndex=0;list.setAttribute('aria-describedby',hint.id);
  const boxes=()=>[...list.querySelectorAll('.beginner-file:not([hidden]) input[type=checkbox]')].filter(box=>!box.disabled);
  list.addEventListener('click',event=>{
    if(!canSelect())return;
    const row=event.target.closest('.beginner-file');if(!row||row.hidden)return;
    if(event.target.closest('button,a,select,textarea'))return;
    const box=row.querySelector('input[type=checkbox]');if(!box||box.disabled)return;
    const native=event.target===box;
    // Keep ordinary filename clicks available for the existing double-click comparison.
    if(!native&&event.target.closest('[role=button]')&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey)return;
    const visible=boxes(),start=visible.indexOf(anchor),end=visible.indexOf(box);
    const checked=native?box.checked:!box.checked;
    if(event.shiftKey&&start>=0) {
      for(const item of visible.slice(Math.min(start,end),Math.max(start,end)+1))item.checked=checked;
    } else {box.checked=checked;anchor=box;}
    onChange();
  });
  list.addEventListener('keydown',event=>{
    if(!canSelect()||event.altKey||!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=='a')return;
    if(event.target.closest('textarea,select,[contenteditable=true],input:not([type=checkbox])'))return;
    event.preventDefault();for(const box of boxes())box.checked=!event.shiftKey;onChange();
  });
  list.addEventListener('mousedown',event=>{if(event.shiftKey&&event.target.closest('.beginner-file')&&!event.target.closest('button'))event.preventDefault();});
  return {reset(){anchor=undefined;}};
}
