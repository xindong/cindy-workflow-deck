// Read-only presence checks. Never execute project files or run a shell.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
async function probe(root, relative) {
  try {
    const parts = relative.split('/'); let cursor = root;
    for (const [index, part] of parts.entries()) {
      cursor = path.join(cursor, part);
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) return { ok: false, reason: 'symlink' };
      if (index < parts.length - 1 && !stat.isDirectory()) return { ok: false, reason: 'not_directory' };
      if (index === parts.length - 1 && (!stat.isFile() || stat.size === 0)) return { ok: false, reason: stat.isFile() ? 'empty' : 'not_file' };
    }
    await fs.access(cursor, require('node:fs').constants.R_OK);
    return { ok: true, source: cursor };
  } catch (error) {
    return { ok: false, reason: ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'missing' : error.code === 'EACCES' ? 'unreadable' : 'check_failed' };
  }
}
async function inspectProject(dir, home = os.homedir()) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('INVALID_DIRECTORY');
  const root = await fs.realpath(dir);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('NOT_DIRECTORY');
  const files = { experiment: '_S/experiment.md', feature: '_S/feature.md', tooling: '_S/tooling.md', merge: '_E/merge.md' };
  const workflows = {};
  for (const [id, file] of Object.entries(files)) workflows[id] = await probe(root, file);
  const candidates = [
    [root, '.agents/skills/xd-pr-review/SKILL.md'], [root, '.claude/skills/xd-pr-review/SKILL.md'],
    [root, '.cindy/skills/xd-pr-review/SKILL.md'], [home, '.agents/skills/xd-pr-review/SKILL.md'],
    [home, '.claude/skills/xd-pr-review/SKILL.md'], [home, '.codex/skills/xd-pr-review/SKILL.md'],
  ];
  workflows.pr = { ok: false, reason: 'skill_unverified' };
  for (const [base, relative] of candidates) {
    const checked = await probe(base, relative);
    if (checked.ok) { workflows.pr = checked; break; }
  }
  return { workflows, checkedAt: new Date().toISOString() };
}
function startStdio() {
  require('node:readline').createInterface({ input: process.stdin }).on('line', async line => {
    let request;
    try {
      request = JSON.parse(line);
      if (request.method !== 'project/inspect') return process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method' } }) + '\n');
      const result = await inspectProject(request.params?.dir);
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: 'PROJECT_CHECK_FAILED' } }) + '\n');
    }
  });
}
module.exports = { inspectProject, startStdio };
if (require.main === module) startStdio();
