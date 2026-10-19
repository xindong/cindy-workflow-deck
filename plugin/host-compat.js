const unsupported = new Set(['UNSUPPORTED_HOST', 'UNSUPPORTED_OPERATION', 'METHOD_NOT_FOUND']);
export const isUnsupported = code => unsupported.has(code);
export function requireHostMethod(owner, method) {
  if (typeof owner?.[method] !== 'function') throw Object.assign(new Error('Upgrade Cindy to use this feature'), { code: 'UNSUPPORTED_HOST' });
}
export async function inspectWithHost(node, dir, project) {
  requireHostMethod(node, 'request');
  const reply = await node.request({ method: 'project/inspect', params: { dir, ...(project ? { project } : {}) } });
  if (!reply?.ok) {
    const code = reply?.errorCode || reply?.code || 'PROJECT_CHECK_FAILED';
    throw Object.assign(new Error('Project inspection unavailable'), { code: isUnsupported(code) ? 'UNSUPPORTED_HOST' : code });
  }
  return reply.result;
}
