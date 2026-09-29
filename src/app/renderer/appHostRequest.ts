import { resolveDesktopHostBridge } from '../../shared/desktopRecoveryBridge.js';

export async function appHostRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.requestApp) return fetch(path, init);
  const result = await bridge.requestApp({ path, method: init.method ?? 'GET',
    ...(typeof init.body === 'string' ? { body: JSON.parse(init.body) } : {}) });
  return new Response(JSON.stringify(result.body), { status: result.status,
    headers: { 'content-type': 'application/json' } });
}
