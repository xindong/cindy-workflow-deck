// Compact controls are presentation only: existing handlers and native disabled
// states stay on the original buttons. Hover and focus never start operations.
const paths = {
  "beginner-diagnose": ["M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6M7 10h6M10 7v6"],
  "basic-mode": ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"],
  "advanced-mode": ["M9 3h6M10 3v6L4 19v2h16v-2L14 9V3M8 15h8"],
  "git-tab": ["M3 7h7l2 2h9v11H3zM3 7V4h7l2 3"],
  "config-tab": ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8", "M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"],
  "beginner-update": ["M12 3v12M7 10l5 5 5-5M4 16v5h16v-5"],
  "beginner-view": ["M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"],
  "beginner-submit": ["M12 16V3M7 8l5-5 5 5M4 16v5h16v-5"],
  "git-refresh": ["M20 11a8 8 0 1 0-2 7M20 4v7h-7"]
};
const descriptions = {
  "beginner-diagnose": ["描述问题或带入最近错误，预览后交给 AI 分析；不会执行修复。", "Describe an issue or include the recent error; review before AI analysis. No repairs are executed."],
  "basic-mode": ["日常 Git 操作：更新项目、查看改动、提交修改。", "Daily Git: update, view changes and submit work."],
  "advanced-mode": ["切换到工作流、UE 引擎更新及执行记录。", "Open workflows, UE engine update and execution log."],
  "git-tab": ["返回日常操作图标栏。", "Return to daily actions."],
  "config-tab": ["选择或切换已有项目，只需设置项目根目录。", "Choose or switch an existing project root."],
  "beginner-update": ["获取团队最新内容；有未提交修改时会暂停，点击后还需确认。", "Get team updates. Stops for unsubmitted work; confirmation required."],
  "beginner-view": ["展开这次改动的文件列表，不修改文件。", "Show changed files without modifying them."],
  "beginner-submit": ["展开文件选择和事项关联；按项目规则新建分支并上传送审，不直接提交主分支。", "Choose files and an issue. Follow project rules on a work branch and send for review."],
  "git-refresh": ["重新读取项目状态和规则，不执行提交或上传。", "Read project status and rules again; no commit or upload."]
};
const tip = document.createElement("aside");
tip.id = "compact-tooltip"; tip.className = "tooltip"; tip.role = "tooltip"; tip.hidden = true;
const title = document.createElement("strong"), detail = document.createElement("p"), reason = document.createElement("p");
tip.append(title, detail, reason); document.body.append(tip);
let active;
function hide() { tip.hidden = true; active?.removeAttribute("aria-describedby"); active = null; }
function show(button, anchor) {
  hide(); active = anchor; anchor.setAttribute("aria-describedby", tip.id);
  const english = document.documentElement.lang.startsWith("en");
  title.textContent = (button.querySelector("strong") || button.querySelector(".compact-label")).textContent.trim();
  detail.textContent = descriptions[button.id][english ? 1 : 0];
  reason.textContent = button.disabled ? (english ? "Unavailable: save the project and wait for the current check or operation to finish." : "暂不可用：请先保存项目，并等待当前检查或操作完成。") : "";
  tip.hidden = false; tip.style.left = "6px"; tip.style.top = "6px";
  const r = anchor.getBoundingClientRect(), box = tip.getBoundingClientRect();
  tip.style.left = Math.max(6, Math.min(r.left, innerWidth - box.width - 6)) + "px";
  tip.style.top = Math.max(6, Math.min(r.top >= box.height + 14 ? r.top - box.height - 8 : r.bottom + 8, innerHeight - box.height - 6)) + "px";
}
for (const [id, lines] of Object.entries(paths)) {
  const button = document.getElementById(id);
  const label = document.createElement("span"); label.className = "compact-label";
  label.append(...button.childNodes); button.append(label);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", "stroke-width":"1.6", "stroke-linecap":"round", "stroke-linejoin":"round", "aria-hidden":"true"})) svg.setAttribute(key,value);
  for (const d of lines) { const path = document.createElementNS(svg.namespaceURI,"path"); path.setAttribute("d",d); svg.append(path); }
  button.prepend(svg); button.classList.add("compact-icon");
  const anchor = document.createElement("span"); anchor.className = "compact-anchor";
  button.before(anchor); anchor.append(button);
  function sync() {
    const name = (label.querySelector("strong") || label).textContent.trim();
    button.setAttribute("aria-label", name);
    anchor.tabIndex = button.disabled ? 0 : -1;
    if(button.disabled) anchor.setAttribute("aria-label",name); else anchor.removeAttribute("aria-label");
  }
  new MutationObserver(sync).observe(button,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["disabled"]}); sync();
  anchor.addEventListener("mouseenter",()=>show(button,anchor));
  anchor.addEventListener("mouseleave",hide);
  anchor.addEventListener("focusin",()=>show(button,anchor));
  anchor.addEventListener("focusout",hide);
  anchor.addEventListener("click",hide);
}
document.addEventListener("keydown",event=>{if(event.key === "Escape") hide();});
addEventListener("resize",hide); document.addEventListener("scroll",hide,true);
