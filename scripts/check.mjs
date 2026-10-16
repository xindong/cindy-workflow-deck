import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { WORKFLOWS } from '../plugin/workflows.js';
const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(resolve(root, 'plugin/ghost.json'), 'utf8'));
assert.equal(manifest.schemaVersion, 3);
assert.equal(manifest.agent.tasks, true); // Legacy record inspection only.
assert.deepEqual(manifest.card, {});
assert.equal(manifest.agent.background, true);
assert.equal(manifest.agent.errand, undefined);
assert.equal(manifest.panel.html, 'panel.html');
assert.equal(manifest.mainView, undefined);
assert.equal(manifest.panel.position, 'left');
assert.equal(manifest.panel.minWidth, 280);
assert.equal(manifest.panel.defaultFraction, 0.25);
assert.equal(manifest.sessionContext, true);
assert.equal(WORKFLOWS.length, 5);
for (const field of ['entry', 'panel']) {
  const file = field === 'panel' ? manifest.panel.html : manifest[field];
  await readFile(resolve(root, 'plugin', file));
}
for (const file of Object.values(manifest.locales)) JSON.parse(await readFile(resolve(root, 'plugin', file), 'utf8'));
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
