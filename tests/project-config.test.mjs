import { buildPrompt } from '../plugin/workflows.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, normalizeConfiguration, updateConfiguration, configurationState, projectForDirectory } from '../plugin/core/project-config.mjs';
const project = (directory = '/project') => ({ ...newProject('one'), directory });
const config = p => ({ projects: [p], activeProjectId: p.id });
test('configuration persists isolated project paths and a selected project', () => {
  const one = project(), two = { ...project('/other'), id: 'two' };
  two.workflows.feature.path = 'docs/start.md';
  const saved = updateConfiguration({}, 0, { projects: [one, two], activeProjectId: two.id });
  assert.equal(saved.revision, 1); assert.equal(configurationState({ projectConfiguration: saved }).configuration.activeProjectId, 'two');
  assert.equal(projectForDirectory(saved.configuration, '/other/').workflows.feature.path, 'docs/start.md');
  assert.equal(projectForDirectory(saved.configuration, '/unknown'), undefined);
  assert.equal(one.workflows.feature.path, '_S/feature.md');
});
test('concurrent saves reject stale revisions instead of overwriting another window', () => {
  const record = updateConfiguration({}, 0, config(project()));
  assert.throws(() => updateConfiguration({ projectConfiguration: record }, 0, config(project('/new'))), { code: 'CONFIG_CONFLICT' });
});
test('invalid roots, path traversal, unchecked external path and duplicate directories rejected', () => {
  for (const directory of ['relative', '', '//server/share', '/a\n/b']) assert.throws(() => normalizeConfiguration(config(project(directory))));
  for (const value of ['../escape.md','a/../../x','a\\..\\x','C:relative.md','/outside.md','~/file','\\\\server\\share']) {
    const p = project(); p.workflows.feature.path = value;
    assert.throws(() => normalizeConfiguration(config(p)), value);
  }
  assert.throws(() => normalizeConfiguration({ projects:[project(),{...project('/project/'),id:'two'}],activeProjectId:'one' }));
});
test('Windows roots normalize drive/slash case for per-project lookup', () => {
  const p = project('C:\\Work\\Game'); p.workflows.feature = { path:'C:\\Rules\\flow.md', external:true };
  const value = normalizeConfiguration(config(p));
  assert.equal(projectForDirectory(value,'c:/work/game/').id, p.id);
});
test('blank paths explicitly disable flows and normalization drops unknown secret fields', () => {
  const p = project(); p.workflows.pr.path = ''; p.apiKey = 'do-not-store';
  const result = normalizeConfiguration(config(p)); assert.equal(result.projects[0].apiKey, undefined);
  assert.equal(result.projects[0].workflows.pr.path, '');
});

test('workflow prompts preserve Windows source as a JSON-quoted path', () => {
  const source = ['C:', 'Work', 'Game', 'custom', 'flow.md'].join(String.fromCharCode(92));
  const prompt = buildPrompt('feature', '', source);
  assert.ok(prompt.includes(JSON.stringify(source)));
  assert.ok(!prompt.includes('_S/feature.md'));
});
