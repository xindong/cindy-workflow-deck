const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const execute = require('node:util').promisify(execFile);

// The plugin worker may omit SSH_AUTH_SOCK. Query only the current macOS login
// session, not another process, keychain, private key or plugin credential store.
async function resolveSshAuthSock(env, deps = {}) {
  if (env.SSH_AUTH_SOCK) return env.SSH_AUTH_SOCK;
  if ((deps.platform || process.platform) !== 'darwin') return undefined;
  try {
    const { stdout } = await (deps.execute || execute)('/bin/launchctl', ['getenv', 'SSH_AUTH_SOCK'], {
      env, timeout: 2000, maxBuffer: 4096, windowsHide: true,
    });
    const socket = stdout.trim();
    if (!path.posix.isAbsolute(socket) || /[\x00-\x1f\x7f]/.test(socket)) return undefined;
    const stat = await (deps.lstat || fs.lstat)(socket);
    const uid = deps.uid === undefined ? process.getuid() : deps.uid;
    if (!stat.isSocket() || stat.uid !== uid) return undefined;
    return socket;
  } catch { return undefined; }
}
async function inheritSshAgent() {
  const socket = await resolveSshAuthSock(process.env);
  if (socket && !process.env.SSH_AUTH_SOCK) process.env.SSH_AUTH_SOCK = socket;
}
module.exports = { resolveSshAuthSock, inheritSshAgent };
