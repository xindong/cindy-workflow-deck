// Project tests run in the existing Agent task, under its actual permissions.
// These are Agent reports, not a Host attestation of command execution.
export function conflictTestInstructions(recordId) {
  return [
    '冲突修复必须包含自动项目测试：读取适用 AGENTS、CONTRIBUTING、README、测试脚本和 CI，确定本次合并要求的测试入口；在当前项目任务中实际执行项目规定的测试/检查，不让用户手输命令，不猜测所有项目都有 npm test，不安装依赖或绕过项目规则来强行通过。',
    '只对最终合并并恢复完毕的实际项目运行测试；若只是移走文件等待插件更新或合并候选尚未恢复，报告 pending，明确交接，不报告完成。更新后在本任务恢复最终内容，再自动测试；测试后若继续改动文件，必须重跑受影响测试。',
    '使用 jixin-make-a-wish 插件的 report_conflict_tests 工具回报，recordId='+JSON.stringify(recordId)+'。开始执行报告 running；全部规定检查实际通过才报告 passed，提供每条实际命令、真实退出码和简短结果。不能以没有冲突标记、git diff --check、编译成功或一轮回复结束代替项目要求的测试。',
    '测试失败报告 failed，简短说明失败项和下一步；仅在已确认修复范围内修正并重跑，不擅自扩大修改。找不到测试入口、依赖缺失、无执行权限或只能人工验证时报告 unavailable 并说明原因；超时、中断或没有退出码不得报告 passed。不跳过失败项、不编造运行结果。',
    '最终只在全部文件合并恢复且项目要求的测试通过后提示“冲突已解决，测试通过”，附测试摘要；否则显示“合并已处理，测试未通过/待验证”。回报工具不可用或保存失败也不能声称插件已记录完成，保留实际命令和结果供核对。'
  ].join('\n');
}

export function testReport(input) {
  const fail=()=>{throw Object.assign(new Error('测试回报不完整：请提供实际命令、结果和退出码；未执行或未通过不能标记完成。'),{code:'INVALID_TEST_REPORT'});};
  if(!['pending','running','passed','failed','unavailable'].includes(input.status)||typeof input.summary!=='string'||!input.summary.trim()||input.summary.length>1200||!Array.isArray(input.checks)||input.checks.length>30)fail();
  const checks=input.checks.map(item=>{
    if(!item||typeof item.command!=='string'||!item.command.trim()||item.command.length>500||typeof item.result!=='string'||!item.result.trim()||item.result.length>500||!(item.exitCode===null||Number.isInteger(item.exitCode)&&Math.abs(item.exitCode)<=2147483647))fail();
    return {command:item.command,exitCode:item.exitCode,result:item.result};
  });
  if(input.status==='passed'&&(!checks.length||checks.some(item=>item.exitCode!==0)))fail();
  if(input.status==='failed'&&!checks.some(item=>item.exitCode!==null&&item.exitCode!==0))fail();
  return {status:input.status,summary:input.summary,checks,source:'agent-report',reportedAt:new Date().toISOString()};
}
