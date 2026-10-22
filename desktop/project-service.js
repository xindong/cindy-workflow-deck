import { readFile, writeFile, mkdir, rename, lstat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { configurationState, updateConfiguration } from '../plugin/core/project-config.mjs';
const { inspectProject } = createRequire(import.meta.url)('../plugin/node/inspect-project.cjs');
const execute = promisify(execFile);
const { gitRequest } = createRequire(import.meta.url)('../plugin/node/git-service.cjs');
const MAX_BYTES = 64 * 1024;
export function createProjectService({ file, pickDirectory, pickFile }) {
  let queue = Promise.resolve();
  const serial = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
  async function read() {
    try { const text = await readFile(file, 'utf8'); if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('配置文件过大'); return configurationState(JSON.parse(text)); }
    catch (error) { if (error.code === 'ENOENT') return configurationState({}); throw error; }
  }
  return async function request(method, params = {}) {
    switch (method) {
      case 'config-read': return read();
      case 'config-save': return serial(async () => {
        const old = await read();
        const record = updateConfiguration({ projectConfiguration: old }, params.expectedRevision, params.configuration);
        const data = JSON.stringify({ projectConfiguration: record }, null, 2) + '\n';
        if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('配置超过64KB上限');
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        const temporary = file + '.tmp';
        await writeFile(temporary, data, { mode: 0o600 }); await rename(temporary, file);
        return record;
      });
      case 'config-pick-directory': {
        const selected = await pickDirectory();
        if (!selected) throw Object.assign(new Error('已取消选择'), { code: 'CANCELLED' });
        return { path: selected };
      }
      case 'config-pick-file': {
        if (typeof params.directory !== 'string' || !path.isAbsolute(params.directory)) throw new Error('请选择项目目录');
        const selected = await pickFile(params.directory);
        if (!selected) throw Object.assign(new Error('已取消选择'), { code: 'CANCELLED' });
        const relative = path.relative(params.directory, selected);
        const external = relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
        return { path: external ? selected : relative.split(path.sep).join('/'), external };
      }
      case 'git-request': {
        const work=async () => {
          const current = await read();
          if(current.revision !== params.revision) throw Object.assign(new Error('项目配置已变化，请重新加载'),{code:'CONFIG_CONFLICT'});
          const project = current.configuration.projects.find(p => p.id === current.configuration.activeProjectId && p.id === params.projectId);
          if(!project) throw new Error('请先保存当前项目');
          return gitRequest(project.directory,params);
        };
        return params.action==='operation-progress' ? work() : serial(work);
      }
      case 'config-inspect': {
        const current = await read();
        const project = current.configuration.projects.find(p => p.id === params.projectId);
        if (!project) throw new Error('请先保存项目配置');
        return inspect(project);
      }
      default: throw Object.assign(new Error('此操作尚未实现'), { code: 'UNSUPPORTED_OPERATION' });
    }
  };
}
export async function inspect(project) {
  const result = await inspectProject(project.directory, undefined, project);
  const rules = [];
  for (const name of ['AGENTS.md', 'CONTRIBUTING.md']) {
    const target = path.join(project.directory, name);
    try { const stat = await lstat(target); if (stat.isFile() && !stat.isSymbolicLink()) rules.push({ path: target, status: 'discovered' }); }
    catch (error) { if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error; }
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  env.GIT_OPTIONAL_LOCKS = '0'; env.GIT_TERMINAL_PROMPT = '0';
  const git = async args => (await execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-C', project.directory, ...args], { env, timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true })).stdout;
  let status;
  try {
    const root = (await git(['rev-parse','--show-toplevel'])).trim();
    let branch = '';
    try { branch = (await git(['symbolic-ref','--short','-q','HEAD'])).trim(); } catch { /* detached HEAD */ }
    const entries = (await git(['status','--porcelain=v1','-z','--untracked-files=normal'])).split('\0').filter(Boolean);
    status = { available: true, root, branch, changes: entries };
  } catch (error) { status = { available: false, reason: error.code === 'ENOENT' ? 'GIT_NOT_INSTALLED' : error.killed ? 'GIT_TIMEOUT' : 'GIT_STATUS_UNAVAILABLE', changes: [] }; }
  return { ...result, directory: project.directory, rules, git: status };
}
