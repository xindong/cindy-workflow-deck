import './settings.js';
const $=id=>document.getElementById(id);
const expert=$('git-expert');expert.classList.add('configuration');$('advanced-view').prepend(expert);
function mode(advanced) {
  $('basic-view').hidden=advanced; $('advanced-view').hidden=!advanced;
  $('basic-mode').setAttribute('aria-pressed',String(!advanced));
  $('advanced-mode').setAttribute('aria-pressed',String(advanced));
}
$('basic-mode').onclick=()=>mode(false);
$('advanced-mode').onclick=()=>mode(true);
mode(false);
