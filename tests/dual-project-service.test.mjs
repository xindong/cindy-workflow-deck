import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createProjectService } from '../desktop/project-service.js';
import { createConfigurationController } from '../plugin/configuration-controller.js';
import { newProject } from '../plugin/core/project-config.mjs';
import { buildPrompt } from '../plugin/workflows.js';
const { inspectProject } = createRequire(import.meta.url)('../plugin/node/inspect-project.cjs');
async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(),'jixin-dual-'));
  t.after(() => rm(temporary,{recursive:true,force:true}));
  const root = await realpath(temporary), dir = path.join(root,'project'); await mkdir(dir);
  await mkdir(path.join(dir,'custom')); await writeFile(path.join(dir,'custom/flow.md'),'read-only instruction');
  const project = { ...newProject('project-one'), directory: dir };
  for (const item of Object.values(project.workflows)) item.path = '';
  project.workflows.feature.path = 'custom/flow.md';
  return { root, dir, project, configuration: { projects:[project],activeProjectId:project.id } };
}
test('configured inspector honors new paths and explicit blanks without executing the file', async t => {
  const f = await fixture(t), before = await readFile(path.join(f.dir,'custom/flow.md'));
  const result = await inspectProject(f.dir, f.root, f.project);
  assert.equal(result.workflows.feature.ok,true); assert.equal(result.workflows.experiment.reason,'not_configured');
  assert.deepEqual(await readFile(path.join(f.dir,'custom/flow.md')),before);
  const prompt = buildPrompt('feature','test',result.workflows.feature.source);
  assert.ok(prompt.includes(JSON.stringify(result.workflows.feature.source))); assert.ok(!prompt.includes('_S/feature.md'));
});
test('external files need consent and symlink paths stay rejected', async t => {
  const f=await fixture(t), outside=path.join(f.root,'external.md');await writeFile(outside,'instruction');
  f.project.workflows.feature={path:outside,external:false};await assert.rejects(inspectProject(f.dir,f.root,f.project));
  f.project.workflows.feature.external=true;assert.equal((await inspectProject(f.dir,f.root,f.project)).workflows.feature.ok,true);
  if(process.platform !== 'win32') { await symlink(outside,path.join(f.dir,'link.md'));f.project.workflows.feature={path:'link.md',external:false};assert.equal((await inspectProject(f.dir,f.root,f.project)).workflows.feature.reason,'symlink'); }
});
test('standalone config is atomic, survives recreation, rejects stale saves and inspects real Git read-only', async t => {
  const f=await fixture(t), file=path.join(f.root,'app-data/projects.json');
  execFileSync('git',['init','-q',f.dir]); await writeFile(path.join(f.dir,'AGENTS.md'),'Project-specific rules');
  const service=createProjectService({file,pickDirectory:async()=>f.dir,pickFile:async()=>path.join(f.dir,'custom/flow.md')});
  assert.equal((await service('config-read')).revision,0);
  const saved=await service('config-save',{expectedRevision:0,configuration:f.configuration});assert.equal(saved.revision,1);
  const results=await Promise.allSettled([service('config-save',{expectedRevision:1,configuration:f.configuration}),service('config-save',{expectedRevision:1,configuration:f.configuration})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'CONFIG_CONFLICT');
  const reopened=createProjectService({file});assert.equal((await reopened('config-read')).revision,2);
  const before=execFileSync('git',['-C',f.dir,'status','--porcelain']);
  const result=await service('config-inspect',{projectId:f.project.id});assert.equal(result.git.available,true);assert.equal(result.rules[0].path,path.join(f.dir,'AGENTS.md'));
  assert.deepEqual(execFileSync('git',['-C',f.dir,'status','--porcelain']),before);
  assert.deepEqual(await service('config-pick-file',{directory:f.dir}),{path:'custom/flow.md',external:false});
});
test('Cindy controller merges via central storage, rejects conflict, cancellation and unsaved project inspection', async t => {
  const f=await fixture(t);let data={sidebarReceipts:{existing:{state:'uncertain'}}};
  const store={read:async()=>data,update:async patch=>{data={...data,...patch(data)};}};
  let inspected=0;
  const controller=createConfigurationController({store,pick:async()=>({ok:false,errorCode:'CANCELLED'}),inspect:async(dir,p)=>{inspected++;return inspectProject(dir,f.root,p);}});
  await controller('config-save',{expectedRevision:0,configuration:f.configuration});
  assert.equal(data.sidebarReceipts.existing.state,'uncertain');
  await assert.rejects(controller('config-save',{expectedRevision:0,configuration:f.configuration}),{code:'CONFIG_CONFLICT'});
  await assert.rejects(controller('config-pick-directory'),{code:'CANCELLED'});
  await assert.rejects(controller('config-inspect',{projectId:'not-saved'}));assert.equal(inspected,0);
  assert.equal((await controller('config-inspect',{projectId:f.project.id})).workflows.feature.ok,true);
});
