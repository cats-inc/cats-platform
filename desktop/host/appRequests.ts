/** Only main-frame Desktop IPC can enter this fixed App-management transport. */
export function validateDesktopAppRequest(value: unknown): { path: string; method: string; body?: unknown } {
  if (!value || typeof value !== 'object') throw new Error('Invalid App request.');
  const input = value as Record<string, unknown>;
  if (typeof input.path !== 'string' || input.path.length > 2000
    || (!/^\/api\/apps(?:\/[a-zA-Z0-9_.-]+){0,2}(?:\?[^#]*)?$/.test(input.path) && input.path !== '/api/platform/ingress')
    || input.path.split('?')[0].split('/').some(part => part === '.' || part === '..')
    || !['GET', 'POST', 'DELETE'].includes(String(input.method))
    || JSON.stringify(input.body ?? null).length > 12 * 1024 * 1024) throw new Error('Invalid App request.');
  return { path: input.path, method: String(input.method), ...(input.body !== undefined ? { body: input.body } : {}) };
}
