export function createFileSelection({list,canSelect,onChange,english=false}) {
  let anchor;
  const hint=document.createElement('p');hint.id='file-selection-help';hint.className='file-selection-help';
  hint.textContent=english?'Shift + click: select a range · Ctrl/⌘ + click: toggle a file · Ctrl/⌘ + A: select filtered files · Esc: clear selection · Ctrl/⌘ + Home or ⌘ + ↑: jump to top · Ctrl/⌘ + End or ⌘ + ↓: jump to bottom (focus the list first)':'Shift + 点击：连续选择 · Ctrl/⌘ + 点击：勾选或取消单个 · Ctrl/⌘ + A：全选筛选结果 · Esc：取消全选 · Ctrl/⌘ + Home 或 ⌘ + ↑：跳到顶部 · Ctrl/⌘ + End 或 ⌘ + ↓：跳到底部（先聚焦文件列表）';
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=english?'Selection shortcuts':'选择快捷键';details.append(summary,hint);details.style.flexBasis='100%';document.getElementById('beginner-selection').append(details);list.tabIndex=0;list.setAttribute('aria-describedby',hint.id);
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
    if(event.target.closest('textarea,select,[contenteditable=true],input:not([type=checkbox])'))return;
    if(event.key==='Escape'&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey) {
      if(!canSelect())return;
      event.preventDefault();event.stopPropagation();
      for(const box of boxes())box.checked=false;anchor=undefined;onChange();return;
    }
    if(event.altKey||!(event.ctrlKey||event.metaKey))return;
    if(!event.shiftKey&&(event.key==='Home'||(event.metaKey&&event.key==='ArrowUp'))) {
      event.preventDefault();list.scrollTop=0;return;
    }
    if(!event.shiftKey&&(event.key==='End'||(event.metaKey&&event.key==='ArrowDown'))) {
      event.preventDefault();list.scrollTop=list.scrollHeight;return;
    }
    if(!canSelect()||event.key.toLowerCase()!=='a')return;
    event.preventDefault();for(const box of boxes())box.checked=!event.shiftKey;onChange();
  });
  list.addEventListener('mousedown',event=>{if(event.shiftKey&&event.target.closest('.beginner-file')&&!event.target.closest('button'))event.preventDefault();});
  return {reset(){anchor=undefined;}};
}
