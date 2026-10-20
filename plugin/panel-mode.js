import './settings.js';
const $=id=>document.getElementById(id);
function mode(advanced) {
  $('basic-view').hidden=advanced; $('advanced-view').hidden=!advanced;
  $('basic-mode').setAttribute('aria-pressed',String(!advanced));
  $('advanced-mode').setAttribute('aria-pressed',String(advanced));
}
$('basic-mode').onclick=()=>mode(false);
$('advanced-mode').onclick=()=>mode(true);
mode(false);
