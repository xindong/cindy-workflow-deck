import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { normalizeConfiguration } from '../plugin/core/project-config.mjs';
const { inspectProject } = createRequire(import.meta.url)('../plugin/node/inspect-project.cjs');
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(),'jixin-discovery-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const configuration = normalizeConfiguration({projects:[{id:'one',directory:root}],activeProjectId:'one'});
  const project=configuration.projects[0];
  const put=async (relative,content='instruction')=>{const file=path.join(root,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,content);return file;};
  return {root,project,put,inspect:()=>inspectProject(root,root,project)};
}
test('root alone derives project name and enables automatic discovery, not stale manual paths',async t=>{
  const f=await fixture(t);
  assert.equal(f.project.name,path.basename(f.root));assert.equal(f.project.discovery,'auto');assert.equal(f.project.workflows,undefined);
  const config=normalizeConfiguration({projects:[{...f.project,workflows:{feature:{path:'/outside',external:true}}}],activeProjectId:'one'});
  assert.equal(config.projects[0].workflows,undefined);
});
test('canonical project paths take precedence; project skill works without home lookup',async t=>{
  const f=await fixture(t);
  const canonical=await f.put('_S/feature.md');await f.put('docs/feature.md');
  const pr=await f.put('.agents/skills/xd-pr-review/SKILL.md');
  const result=await f.inspect();
  assert.equal(result.workflows.feature.source,canonical);assert.equal(result.workflows.pr.source,pr);
  assert.equal(result.workflows.tooling.reason,'missing');
});
test('unique relocated file is discovered; ambiguous and removed files disable only affected workflows',async t=>{
  const f=await fixture(t);const file=await f.put('instructions/feature.md');
  await f.put('instructions/tooling.md');
  assert.equal((await f.inspect()).workflows.feature.source,file);
  await f.put('other/feature.md');
  const result=await f.inspect();assert.equal(result.workflows.feature.reason,'ambiguous');assert.equal(result.workflows.feature.candidates.length,2);assert.equal(result.workflows.tooling.ok,true);
  await rm(file);assert.equal((await f.inspect()).workflows.feature.ok,true);
  await rm(path.join(f.root,'other/feature.md'));assert.equal((await f.inspect()).workflows.feature.reason,'missing');
});
test('dependencies and empty canonical instructions are not eligible fallback matches',async t=>{
  const f=await fixture(t);await f.put('node_modules/pkg/experiment.md');await f.put('_S/feature.md','');await f.put('docs/feature.md');
  const result=await f.inspect();assert.equal(result.workflows.experiment.reason,'missing');assert.equal(result.workflows.feature.reason,'empty');
});
test('multiple project PR skills are ambiguous and no global skill is used',async t=>{
  const f=await fixture(t);await f.put('.claude/skills/xd-pr-review/SKILL.md','different instructions');await f.put('.agents/skills/xd-pr-review/SKILL.md');
  assert.equal((await f.inspect()).workflows.pr.reason,'ambiguous');
});
test('identical project PR skills resolve deterministically and changed copies become ambiguous',async t=>{
  const f=await fixture(t);
  const first=await f.put('.agents/skills/xd-pr-review/SKILL.md');
  const second=await f.put('.claude/skills/xd-pr-review/SKILL.md');
  let result=await f.inspect();
  assert.equal(result.workflows.pr.ok,true);assert.equal(result.workflows.pr.source,first);
  assert.deepEqual(result.workflows.pr.identicalCopies,[first,second]);
  await f.put('.claude/skills/xd-pr-review/SKILL.md','changed');
  result=await f.inspect();assert.equal(result.workflows.pr.reason,'ambiguous');
});
test('merged.md is discovered before a bounded fallback search and both names conflict safely',async t=>{
  const f=await fixture(t);const file=await f.put('_E/merged.md');
  await f.put('a/b/c/d/e/f/feature.md');
  assert.equal((await f.inspect()).workflows.merge.source,file);
  assert.equal((await inspectProject(f.root,f.root)).workflows.merge.source,file);
  await f.put('_E/merge.md','other merge instructions');
  assert.equal((await f.inspect()).workflows.merge.reason,'ambiguous');
});
test('relocated merged.md is recognized by bounded search',async t=>{
  const f=await fixture(t);const file=await f.put('instructions/merged.md');
  assert.equal((await f.inspect()).workflows.merge.source,file);
});
test('oversized duplicated PR instructions are not read without limit or accepted as identical',async t=>{
  const f=await fixture(t);const large='x'.repeat(1024*1024+1);
  await f.put('.agents/skills/xd-pr-review/SKILL.md',large);await f.put('.claude/skills/xd-pr-review/SKILL.md',large);
  assert.equal((await f.inspect()).workflows.pr.reason,'comparison_limit');
});
test('incomplete bounded search does not claim uniqueness',async t=>{
  const f=await fixture(t);await f.put('docs/feature.md');await f.put('a/b/c/d/e/f/feature.md');
  assert.equal((await f.inspect()).workflows.feature.reason,'discovery_incomplete');
});
test('symbolic instruction paths cannot escape the project', {skip:process.platform==='win32'}, async t=>{
  const f=await fixture(t);await f.put('other/feature.md');await mkdir(path.join(f.root,'_S'));
  await symlink(path.join(f.root,'other/feature.md'),path.join(f.root,'_S/feature.md'));
  assert.equal((await f.inspect()).workflows.feature.reason,'symlink');
});
