import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,symlink,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const {inspectProject}=createRequire(import.meta.url)('../plugin/node/inspect-project.cjs');
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'workflow-inspect-'));t.after(()=>rm(root,{recursive:true,force:true}));const dir=join(root,'project'),home=join(root,'home');await mkdir(dir);await mkdir(home);return{root,dir,home};}
test('real empty directory returns no usable flows; missing skill is unverified rather than globally absent',async t=>{
 const f=await fixture(t);const r=await inspectProject(f.dir,f.home);assert.ok(Object.values(r.workflows).every(item=>!item.ok));assert.equal(r.workflows.pr.reason,'skill_unverified');
});
test('nonempty regular workflow files are detected read-only without executing contents',async t=>{
 const f=await fixture(t);await mkdir(join(f.dir,'_S'));const file=join(f.dir,'_S/feature.md');const text='echo never-execute > sentinel';await writeFile(file,text);
 const r=await inspectProject(f.dir,f.home);assert.equal(r.workflows.feature.ok,true);assert.equal(r.workflows.experiment.reason,'missing');assert.equal(await readFile(file,'utf8'),text);
});
test('empty files, directories and symlink traversal are rejected',async t=>{
 const f=await fixture(t);await mkdir(join(f.dir,'_S'));await writeFile(join(f.dir,'_S/feature.md'),'');await mkdir(join(f.dir,'_S/tooling.md'));const outside=join(f.root,'outside.md');await writeFile(outside,'content');await symlink(outside,join(f.dir,'_S/experiment.md'));
 const r=await inspectProject(f.dir,f.home);assert.equal(r.workflows.feature.reason,'empty');assert.equal(r.workflows.tooling.reason,'not_file');assert.equal(r.workflows.experiment.reason,'symlink');
});
test('project-local and known user skill paths are probed without scanning unrelated directories',async t=>{
 const f=await fixture(t);await mkdir(join(f.home,'.agents/skills/xd-pr-review'),{recursive:true});await writeFile(join(f.home,'.agents/skills/xd-pr-review/SKILL.md'),'skill');
 const r=await inspectProject(f.dir,f.home);assert.equal(r.workflows.pr.ok,true);assert.ok(r.workflows.pr.source.endsWith('xd-pr-review/SKILL.md'));
});
test('relative and nonexistent directories fail rather than producing missing-file results',async t=>{
 const f=await fixture(t);await assert.rejects(inspectProject('relative',f.home));await assert.rejects(inspectProject(join(f.dir,'absent'),f.home));
});
