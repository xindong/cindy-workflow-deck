// Read-only presence checks. Never execute project files or run a shell.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const AUTO_FILES = { experiment: '_S/experiment.md', feature: '_S/feature.md', tooling: '_S/tooling.md', merge: '_E/merge.md' };
const SKILL_PATHS = ['.agents', '.claude', '.cindy', '.codex'].map(dir => dir + '/skills/xd-pr-review/SKILL.md');
const MERGE_PATHS = ['_E/merge.md','_E/merged.md'];
async function selectMatches(matches, compareCopies = false) {
  if (matches.length < 2) return matches[0] || {ok:false,reason:'missing'};
  const candidates = matches.map(item=>item.source);
  if (compareCopies) {
    let first;
    for (const source of candidates) {
      let handle;
      try {
        const constants = require('node:fs').constants;
        handle = await fs.open(source,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size === 0) return {ok:false,reason:'check_failed',candidates};
        const limit = 1024*1024;
        if (stat.size > limit) return {ok:false,reason:'comparison_limit',candidates};
        const buffer=Buffer.alloc(limit+1);let length=0;
        while (length<buffer.length) {
          const {bytesRead}=await handle.read(buffer,length,buffer.length-length,null);
          if (!bytesRead) break;length+=bytesRead;
        }
        if (length>limit) return {ok:false,reason:'comparison_limit',candidates};
        if (length!==stat.size) return {ok:false,reason:'check_failed',candidates};
        const bytes=buffer.subarray(0,length);
        if (first && !first.equals(bytes)) return {ok:false,reason:'ambiguous',candidates};
        first=bytes;
      } catch { return {ok:false,reason:'check_failed',candidates}; }
      finally { if(handle) await handle.close(); }
    }
    return {...matches[0],identicalCopies:candidates};
  }
  return {ok:false,reason:'ambiguous',candidates};
}
async function discover(root) {
  const workflows = {}, unresolved = new Set();
  for (const id of ['experiment','feature','tooling','pr','merge']) {
    const candidates = id === 'pr' ? SKILL_PATHS : id === 'merge' ? MERGE_PATHS : [AUTO_FILES[id]];
    const checked = await Promise.all(candidates.map(file => probe(root,file)));
    const matches = checked.filter(item => item.ok);
    const failure = checked.find(item => !item.ok && item.reason !== 'missing');
    workflows[id] = failure || await selectMatches(matches,id==='pr');
    if (!matches.length && !failure) unresolved.add(id);
  }
  if (!unresolved.size) return {workflows,checkedAt:new Date().toISOString()};
  const ignored = new Set(['.git','node_modules','vendor','dist','build','desktop-builds','artifacts','coverage','.venv','venv']);
  const matches = Object.fromEntries([...unresolved].map(id=>[id,[]]));
  let count = 0, incomplete = false;
  async function walk(dir,depth) {
    let entries;
    try { entries = await fs.readdir(dir,{withFileTypes:true}); } catch { incomplete=true;return; }
    for (const entry of entries) {
      if (++count > 3000) { incomplete=true;return; }
      if (entry.isSymbolicLink()) continue;
      const target = path.join(dir,entry.name);
      if (entry.isDirectory()) {
        if (ignored.has(entry.name)) continue;
        if (depth >= 5) { incomplete=true;continue; }
        await walk(target,depth+1);
      } else if (entry.isFile()) {
        for (const id of unresolved) {
          const expected = id === 'pr' ? ['pr.md','pr-review.md'] : id === 'merge' ? ['merge.md','merged.md'] : [id+'.md'];
          if (!expected.includes(entry.name)) continue;
          const relative = path.relative(root,target).split(path.sep).join('/');
          const item = await probe(root,relative);
          if (item.ok) matches[id].push(item.source);
        }
      }
    }
  }
  await walk(root,0);
  for (const id of unresolved) workflows[id] = incomplete ? {ok:false,reason:'discovery_incomplete'}
    : matches[id].length === 1 ? {ok:true,source:matches[id][0]}
    : {ok:false,reason:matches[id].length ? 'ambiguous' : 'missing',candidates:matches[id]};
  return {workflows,checkedAt:new Date().toISOString()};
}
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
async function inspectProject(dir, home = os.homedir(), project) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('INVALID_DIRECTORY');
  const root = await fs.realpath(dir);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('NOT_DIRECTORY');
  if (project) {
    const { normalizeConfiguration, directoryKey } = await import('../core/project-config.mjs');
    const normalized = normalizeConfiguration({ projects: [project], activeProjectId: project.id }).projects[0];
    if (directoryKey(normalized.directory) !== directoryKey(dir)) throw new Error('PROJECT_DIRECTORY_MISMATCH');
    if (normalized.discovery === 'auto') return discover(root);
    const workflows = {};
    for (const [id, item] of Object.entries(normalized.workflows)) {
      if (!item.path) { workflows[id] = { ok: false, reason: 'not_configured' }; continue; }
      if (process.platform !== 'win32' && /^[A-Za-z]:[\\/]/.test(item.path)) { workflows[id] = { ok: false, reason: 'platform_mismatch' }; continue; }
      const relative = item.path.split(String.fromCharCode(92)).join('/');
      const target = path.isAbsolute(relative) ? relative : path.resolve(root, relative);
      const base = path.parse(target).root;
      const checked = await probe(base, path.relative(base, target).split(path.sep).join('/'));
      workflows[id] = checked;
    }
    return { workflows, checkedAt: new Date().toISOString() };
  }
  const files = { experiment: '_S/experiment.md', feature: '_S/feature.md', tooling: '_S/tooling.md', merge: '_E/merge.md' };
  const workflows = {};
  for (const [id, file] of Object.entries(files)) workflows[id] = await probe(root, file);
  const mergeChecked = await Promise.all(MERGE_PATHS.map(file=>probe(root,file)));
  workflows.merge = mergeChecked.find(item=>!item.ok && item.reason!=='missing') || await selectMatches(mergeChecked.filter(item=>item.ok));
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
      if (request.method === 'project/git') {
        let result;
        try { result={kind:'jixin-git-result-v1',ok:true,value:await require('./git-service.cjs').gitRequest(request.params?.dir, request.params)}; }
        catch(error) { result={kind:'jixin-git-result-v1',ok:false,error:{code:error.code || 'GIT_OPERATION_FAILED',message:error.message || 'Git 操作未完成，请重新检查'}}; }
        process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result}) + '\n'); return;
      }
      if (request.method !== 'project/inspect') return process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method' } }) + '\n');
      const result = await inspectProject(request.params?.dir, undefined, request.params?.project);
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error.message || 'PROJECT_CHECK_FAILED', data: {code:error.code || 'PROJECT_CHECK_FAILED'} } }) + '\n');
    }
  });
}
module.exports = { inspectProject, startStdio };
if (require.main === module) startStdio();
