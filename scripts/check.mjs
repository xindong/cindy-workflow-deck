import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { WORKFLOWS, CHANNEL, buildPrompt } from '../plugin/workflows.js';
const root = resolve(import.meta.dirname, '..');
const policyCheck = spawnSync('python3', [resolve(root, 'scripts/check_repository.py')], { encoding: 'utf8' });
assert.equal(policyCheck.status, 0, policyCheck.stdout + policyCheck.stderr);
const identity = JSON.parse(await readFile(resolve(root, 'repository-policy.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'plugin/ghost.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 3);
assert.equal(manifest.id, identity.id);
assert.equal(manifest.command, manifest.id);
assert.equal(manifest.name, identity.name);
assert.equal(CHANNEL, manifest.id + ':v1');
for (const flow of WORKFLOWS) assert.ok(buildPrompt(flow.id).includes(manifest.id + ' 插件的 report_progress'));
assert.equal(manifest.agent.tasks, true); // Legacy record inspection only.
assert.deepEqual(manifest.card, {});
assert.equal(manifest.agent.background, true);
assert.equal(manifest.agent.errand, true);
assert.equal(manifest.panel.html, 'panel.html');
assert.equal(manifest.mainView, undefined);
assert.equal(manifest.panel.position, 'left');
assert.equal(manifest.panel.minWidth, 280);
assert.equal(manifest.panel.defaultFraction, 0.25);
assert.equal(manifest.sessionContext, true);
assert.equal(WORKFLOWS.length, 5);
assert.equal(manifest.version, JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version);
const usage = await readFile(resolve(root, 'plugin/USAGE.md'), 'utf8');
assert.ok(usage.includes('report_progress') && usage.includes('10秒') && usage.includes('English quick start'));
for (const field of ['entry', 'panel']) {
  const file = field === 'panel' ? manifest.panel.html : manifest[field];
  await readFile(resolve(root, 'plugin', file));
}
for (const file of Object.values(manifest.locales)) assert.equal(JSON.parse(await readFile(resolve(root, 'plugin', file), 'utf8')).name, manifest.name);
const html = await readFile(resolve(root, 'plugin/panel.html'), 'utf8');
assert.ok(!/<script(?![^>]*src=)[^>]*>/i.test(html), 'Inline scripts violate plugin CSP');
assert.ok(!/\son\w+\s*=/i.test(html), 'Inline event handlers violate plugin CSP');
for (const file of await readdir(resolve(root, 'plugin'))) {
  if (!file.endsWith('.js')) continue;
  const result = spawnSync(process.execPath, ['--check', resolve(root, 'plugin', file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
await readFile(resolve(root, 'plugin', manifest.node.entry));
const worker = spawnSync(process.execPath, ['--check', resolve(root, 'plugin', manifest.node.entry)], { encoding: 'utf8' });
assert.equal(worker.status, 0, worker.stderr);
console.log('Manifest references, locales, CSP and JavaScript syntax: passed.');

for (const file of ['settings.html']) {
  const html = await readFile(resolve(root, 'plugin', file), 'utf8');
  assert.ok(!/<script(?![^>]*src=)[^>]*>/i.test(html), 'Settings inline script violates CSP');
  assert.ok(!/\son\w+\s*=/i.test(html), 'Settings inline handler violates CSP');
}
assert.equal(manifest.settingsHtml, 'settings.html');
assert.equal(manifest.pick, true);
for (const file of ['plugin/core/project-config.mjs', 'plugin/node/git-service.cjs', 'plugin/node/beginner-git.cjs', 'plugin/node/github-issues.cjs', 'desktop/project-service.js', 'desktop/main.cjs', 'desktop/preload.cjs', 'scripts/package_desktop.mjs']) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
