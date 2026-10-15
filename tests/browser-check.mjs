// Optional browser acceptance: install Playwright outside plugin/ before running.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE_PATH || 'playwright';
const { chromium } = await import(modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath);
const server = spawn('python3', [resolve(import.meta.dirname, 'serve-preview.py')], { stdio: ['ignore', 'pipe', 'inherit'] });
const base = await new Promise((resolveBase, reject) => {
  server.stdout.once('data', chunk => resolveBase(chunk.toString().trim()));
  server.once('error', reject); server.once('exit', code => reject(new Error(`Preview server exited: ${code}`)));
});
const browser = await chromium.launch({ headless: true });
const errors = [];
const artifacts = resolve(import.meta.dirname, '../artifacts');
await mkdir(artifacts, { recursive: true });
const page = await browser.newPage({ viewport: { width: 380, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${base}/panel.html`);
  await page.locator('#feedback').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('button.workflow').count(), 5);
  await page.screenshot({ path: resolve(artifacts, 'workflow-deck-light.png'), fullPage: true });
  await page.getByText('补充工作目标（可选）', { exact: true }).click();
  await page.locator('#context').fill('测试目标：背包筛选 <script>不可执行</script>');
  for (const id of ['experiment', 'feature', 'tooling', 'pr', 'merge']) {
    await page.locator(`[data-workflow="${id}"]`).click();
    await page.locator('button.workflow:not(:disabled)').first().waitFor();
  }
  const calls = await page.evaluate(() => mockHost.calls);
  assert.equal(calls.creates.length, 5); assert.equal(calls.sends.length, 5);
  assert.equal(new Set(calls.sends.map(call => call.taskId)).size, 5);
  assert.ok(calls.sends.every(call => call.text.includes('测试目标：背包筛选')));
  assert.equal(await page.locator('#launches li').count(), 5);
  await page.locator('#refresh').click();
  await page.locator('#refresh:not(:disabled)').waitFor();
  assert.equal(await page.locator('#launches li').filter({ hasText: '运行中' }).count(), 5);
  await page.screenshot({ path: resolve(artifacts, 'workflow-deck-launched.png'), fullPage: true });
  await page.reload();
  await page.locator('#launches li:nth-child(5)').waitFor();
  assert.equal(await page.evaluate(() => mockHost.calls.creates.length), 0, 'Reload must not launch tasks');
  await page.goto(`${base}/panel.html?theme=dark`);
  await page.locator('#launches li:nth-child(5)').waitFor();
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(31, 31, 30)');
  await page.screenshot({ path: resolve(artifacts, 'workflow-deck-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 280, height: 760 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Narrow panel must not overflow horizontally');
  await page.screenshot({ path: resolve(artifacts, 'workflow-deck-narrow-dark.png'), fullPage: true });
  await page.goto(`${base}/panel.html?deny=1`);
  await page.locator('#feedback').waitFor({ state: 'hidden' });
  await page.locator('[data-workflow="merge"]').click();
  await page.locator('button.workflow:not(:disabled)').first().waitFor();
  assert.equal(await page.evaluate(() => mockHost.calls.sends.length), 0);
  assert.ok((await page.locator('#feedback').textContent()).includes('未受理'));
  await page.goto(`${base}/panel.html?lose-send=1`);
  await page.locator('#feedback').waitFor({ state: 'hidden' });
  await page.locator('[data-workflow="pr"]').click();
  await page.locator('.recover').waitFor();
  await page.locator('.recover').click();
  await page.locator('.recover').waitFor({ state: 'hidden' });
  const recovered = await page.evaluate(() => mockHost.calls);
  assert.equal(recovered.creates.length, 1); assert.equal(recovered.sends.length, 2);
  assert.equal(recovered.sends[0].requestKey, recovered.sends[1].requestKey);
  await page.route('**/app-context', route => route.fulfill({ json: { ok: true, context: { locale: 'ja', region: 'cn' } } }));
  await page.goto(`${base}/panel.html`);
  await page.getByRole('heading', { name: 'Start a piece of work' }).waitFor();
  assert.equal(await page.locator('button.workflow').count(), 5);
  await page.screenshot({ path: resolve(artifacts, 'workflow-deck-english.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['five_buttons', 'independent_tasks', 'context', 'status_refresh', 'journal_reload', 'light', 'dark', '280px_layout', 'permission_denial', 'same_key_recovery', 'locale_fallback', 'no_page_errors'], screenshots: artifacts }, null, 2));
} finally {
  await browser.close(); server.kill(); await once(server, 'exit');
}
