import './panel-compact.js';
import './settings.js';
const $=id=>document.getElementById(id);
const expert=$('git-expert');expert.classList.add('configuration');$('advanced-view').prepend(expert);
// Reuse the established workflow dock instead of adding new rows of controls.
// Moving the original elements preserves their handlers, focus and disabled state.
const dock=document.querySelector('.dock'),actions=document.querySelector('.beginner-actions');
const workflows=$('toolbar'),workflowControls=dock.querySelector('.controls');
const footer=document.createElement('footer');footer.id='compact-footer';
const basicControls=document.createElement('div');basicControls.className='controls';
const common=document.createElement('div');common.className='controls common-controls';
const modes=document.querySelector('.view-tabs');
basicControls.append($('git-refresh').parentElement);
common.append($('config-tab').parentElement,modes);
dock.prepend(actions,basicControls);dock.append(common);footer.append(dock);document.body.append(footer);
$('config-view').prepend($('git-tab').parentElement);
const empty=document.createElement('div');empty.className='basic-empty';
const title=document.createElement('strong'),hint=document.createElement('span');empty.append(title,hint);
$('beginner-message').before(empty);
function localize(){const english=document.documentElement.lang.startsWith('en');title.textContent=english?'Daily work':'日常工作';hint.textContent=english?'Choose an action from the toolbar below.':'从底部图标选择操作';}
new MutationObserver(localize).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});localize();
function mode(advanced) {
  $('basic-view').hidden=advanced; $('advanced-view').hidden=!advanced;
  actions.hidden=advanced;basicControls.hidden=advanced;workflows.hidden=!advanced;workflowControls.hidden=!advanced;
  $('basic-mode').parentElement.hidden=!advanced;$('advanced-mode').parentElement.hidden=advanced;
  $('basic-mode').setAttribute('aria-pressed',String(!advanced));
  $('advanced-mode').setAttribute('aria-pressed',String(advanced));
}
$('basic-mode').onclick=()=>mode(false);
$('advanced-mode').onclick=()=>mode(true);
$('config-tab').addEventListener('click',event=>{
  const close=!$('basic-view').hidden&&!$('config-view').hidden;
  mode(false);
  if(close){event.stopImmediatePropagation();$('git-tab').click();}
},true);
for(const id of ['beginner-update','beginner-view','beginner-submit'])$(id).addEventListener('click',()=>{$('git-tab').click();},true);
mode(false);

// Follow the visible page on close, project reset and mode changes.
// Refresh and mode-switch buttons remain actions, not selected pages.
function syncSelection() {
  const basic=!$('basic-view').hidden, git=basic&&!$('git-view').hidden;
  const sheet=$('beginner-sheet');
  for(const action of ['update','view','submit'])
    $('beginner-'+action).setAttribute('aria-pressed',String(git&&!sheet.hidden&&sheet.dataset.action===action));
  $('config-tab').setAttribute('aria-pressed',String(basic&&!$('config-view').hidden));
}
for(const id of ['basic-view','git-view','config-view','beginner-sheet'])
  new MutationObserver(syncSelection).observe($(id),{attributes:true,attributeFilter:['hidden','data-action']});
syncSelection();
