export const IMAGE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export interface RuntimeImageRequest { id: string; instance: string; prompt: string; }
export interface RuntimeImageMetadata {
  mimeType: 'image/jpeg'; bytes: number; width: number; height: number; sha256: string;
}
export interface RuntimeImageJob extends RuntimeImageRequest {
  schemaVersion: 1; provider: 'grok'; agentModel: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelling' | 'cancelled' | 'interrupted';
  createdAt: string; updatedAt: string; error: string | null; output: RuntimeImageMetadata | null;
}
export interface RuntimeImageCapabilities {
  schemaVersion: 1; operation: 'image.generate'; aspectRatio: '1:1'; maxPromptLength: number;
  maxImageBytes: number; targets: Array<{ provider: 'grok'; instance: string; agentModel: string }>;
}
export class RuntimeImageError extends Error {
  constructor(readonly code: string) { super(code); }
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RuntimeImageError('image_service_unavailable');
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number) => {
  if (typeof value !== 'string' || value.length > max) throw new RuntimeImageError('image_service_unavailable');
  return value;
};
export function projectImageCapabilities(value: unknown): RuntimeImageCapabilities {
  const input = record(value);
  if (input.schemaVersion !== 1 || input.operation !== 'image.generate' || input.aspectRatio !== '1:1'
    || !Array.isArray(input.targets) || input.targets.length > 100) throw new RuntimeImageError('image_service_unavailable');
  return { schemaVersion: 1, operation: 'image.generate', aspectRatio: '1:1', maxPromptLength: 2000,
    maxImageBytes: IMAGE_MAX_BYTES, targets: input.targets.map((entry) => {
      const target = record(entry);
      if (target.provider !== 'grok') throw new RuntimeImageError('image_service_unavailable');
      return { provider: 'grok', instance: text(target.instance, 100), agentModel: text(target.agentModel, 100) };
    }) };
}
export const IMAGE_ERRORS = new Set(['invalid_image_request', 'image_request_conflict', 'image_service_busy',
  'image_storage_limit', 'image_transport_unsupported', 'image_service_unavailable', 'image_not_found',
  'execution_interrupted', 'cancelled', 'auth_required', 'quota_exhausted', 'privacy_required',
  'generation_refused', 'generation_failed', 'generation_timeout', 'cli_unavailable', 'invalid_image',
  'invalid_image_source', 'image_source_unavailable', 'image_tool_limit', 'image_output_limit', 'storage_full']);
export function projectImageJob(value: unknown): RuntimeImageJob {
  const input = record(value);
  if (input.schemaVersion !== 1 || input.provider !== 'grok' || !IMAGE_ID.test(String(input.id))
    || !['running', 'succeeded', 'failed', 'cancelling', 'cancelled', 'interrupted'].includes(String(input.status))) throw new RuntimeImageError('image_service_unavailable');
  let output: RuntimeImageMetadata | null = null;
  if (input.output != null) {
    const item = record(input.output);
    if (item.mimeType !== 'image/jpeg' || !Number.isSafeInteger(item.bytes) || Number(item.bytes) < 4 || Number(item.bytes) > IMAGE_MAX_BYTES
      || !Number.isSafeInteger(item.width) || Number(item.width) < 1 || Number(item.width) > 2000 || item.width !== item.height
      || !/^[a-f0-9]{64}$/.test(String(item.sha256))) throw new RuntimeImageError('invalid_image');
    output = { mimeType: 'image/jpeg', bytes: Number(item.bytes), width: Number(item.width), height: Number(item.height), sha256: String(item.sha256) };
  }
  if (input.status === 'succeeded' && !output) throw new RuntimeImageError('invalid_image');
  return { schemaVersion: 1, id: String(input.id), provider: 'grok', instance: text(input.instance, 100), prompt: text(input.prompt, 4000),
    agentModel: text(input.agentModel, 100), status: input.status as RuntimeImageJob['status'],
    createdAt: text(input.createdAt, 40), updatedAt: text(input.updatedAt, 40), output,
    error: input.error == null ? null : IMAGE_ERRORS.has(String(input.error)) ? String(input.error) : 'generation_failed' };
}

export async function readImageResponse(response: Response, binary = false): Promise<Uint8Array> {
  if (!response.body) throw new RuntimeImageError('image_service_unavailable');
  const limit = binary ? IMAGE_MAX_BYTES : 32 * 1024;
  const reader = response.body.getReader();
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > limit) throw new RuntimeImageError('image_output_limit');
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (!response.ok) {
    let code = 'image_service_unavailable';
    try { const body = JSON.parse(new TextDecoder().decode(bytes)); if (IMAGE_ERRORS.has(body.error)) code = body.error; } catch { /* sanitized below */ }
    throw new RuntimeImageError(code);
  }
  return bytes;
}
