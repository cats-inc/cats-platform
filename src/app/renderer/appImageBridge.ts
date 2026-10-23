const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
const CONTRACT_TWO_KEYS = ['requestId', 'targetId', 'profileId', 'profileRevision', 'agentConfigId', 'operation', 'prompt', 'sourceIds', 'options'];
const shortText = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max;
// The host route checks each App's own contract exactly; the bridge only bounds what it forwards.
function validSubmission(input: Record<string, unknown>) {
  if (typeof input.requestId !== 'string' || !ID.test(input.requestId) || typeof input.prompt !== 'string' || Array.from(input.prompt).length > 2000) return false;
  const keys = Object.keys(input);
  if (keys.every((key) => ['requestId', 'prompt', 'instance'].includes(key))) return shortText(input.instance, 100);
  return keys.length === CONTRACT_TWO_KEYS.length && CONTRACT_TWO_KEYS.every((key) => keys.includes(key))
    && shortText(input.targetId, 140) && shortText(input.profileId, 120) && shortText(input.profileRevision, 40)
    && shortText(input.agentConfigId, 120) && input.operation === 'image.generate'
    && Array.isArray(input.sourceIds) && input.sourceIds.length <= 100 && !!input.options && typeof input.options === 'object';
}
export class ImageBridgeError extends Error {
  constructor(message: string, readonly revoked = false) { super(message); }
}
export async function callAppImageBridge(method: string, params: unknown, context: {
  appId: string; version: string; signal: AbortSignal;
}): Promise<unknown> {
  const multimedia = method.startsWith('media.images.');
  if (multimedia) method = method.slice('media.'.length);
  let route: string; let body: unknown;
  const input = params && typeof params === 'object' && !Array.isArray(params) ? params as Record<string, unknown> : {};
  if (method === 'images.capabilities') route = 'capabilities';
  else if (method === 'images.list') route = 'jobs';
  else if (method === 'images.submit') {
    if (!validSubmission(input)) throw new ImageBridgeError('invalid_image_request');
    route = 'jobs'; body = input;
  } else if (['images.cancel', 'images.refresh', 'images.delete', 'images.read', 'images.export'].includes(method)) {
    if (typeof input.id !== 'string' || !ID.test(input.id) || Object.keys(input).some((key) => key !== 'id')) throw new ImageBridgeError('invalid_image_request');
    const operation = method === 'images.cancel' ? 'cancel' : method === 'images.refresh' ? 'refresh' : method === 'images.delete' ? 'delete' : 'image';
    route = `jobs/${input.id}/${operation}`;
    if (operation !== 'image') body = {};
  } else throw new ImageBridgeError('Unsupported app capability.');
  const response = await fetch(`/api/apps/${encodeURIComponent(context.appId)}/${multimedia ? 'media/images' : 'images'}/${route}?version=${encodeURIComponent(context.version)}`, {
    signal: context.signal, cache: 'no-store', ...(body !== undefined ? { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: { code?: unknown } };
    const code = typeof payload.error?.code === 'string' ? payload.error.code : 'image_service_unavailable';
    throw new ImageBridgeError(code, response.status === 401 || response.status === 403 || code === 'app_context_revoked');
  }
  if (method !== 'images.read' && method !== 'images.export') return response.json();
  const mimeType = response.headers.get('content-type') ?? '';
  if (!IMAGE_TYPES[mimeType] || Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new ImageBridgeError('invalid_image');
  const reader = response.body?.getReader();
  if (!reader) throw new ImageBridgeError('invalid_image');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length; if (size > MAX_IMAGE_BYTES) throw new ImageBridgeError('invalid_image');
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (context.signal.aborted) throw new ImageBridgeError('app_context_revoked', true);
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (method === 'images.read') return { bytes: bytes.buffer, mimeType };
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Studio-${input.id}.${IMAGE_TYPES[mimeType]}`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { downloaded: true };
}
