export const IMAGE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 4096;
/** Providers Runtime may name; capabilities list only those with an enabled, configured profile. */
export const IMAGE_PROVIDERS = ['grok', 'muse', 'antigravity', 'codex'] as const;
export type RuntimeImageProvider = typeof IMAGE_PROVIDERS[number];
export type RuntimeImageAspectRatio = { mode: 'native'; options: [string] } | { mode: 'service' };
/** Runtime contract 2 (Runtime SPEC-038). Generation takes no sources or options yet. */
export interface RuntimeImageRequest {
  id: string; targetId: string; profileId: string; profileRevision: string; agentConfigId: string;
  operation: 'image.generate'; prompt: string; sourceIds: []; options: Record<string, never>;
}
export interface RuntimeImageMetadata {
  mimeType: 'image/jpeg' | 'image/png'; bytes: number; width: number; height: number; sha256: string;
  transparency: 'opaque' | 'has-transparency';
}
export type RuntimeImageStatus = 'running' | 'succeeded' | 'failed' | 'cancelling' | 'cancelled' | 'interrupted';
export interface RuntimeImageJob {
  schemaVersion: 2; id: string; targetId: string; provider: RuntimeImageProvider; instance: string;
  profileId: string; profileRevision: string; agentConfigId: string | null; agentModel: string; agentEffort: string | null;
  operation: 'image.generate'; prompt: string; status: RuntimeImageStatus; createdAt: string; updatedAt: string;
  error: string | null; warnings: string[]; executionOutcome: 'completed' | 'stopped_after_image' | null; output: RuntimeImageMetadata | null;
}
export interface RuntimeImageProfile {
  id: string; revision: number; operation: 'image.generate'; targetIds: string[];
  agentConfigs: Array<{ id: string; model: string; effort: string }>; inputs: { min: 0; max: 0 }; aspectRatio: RuntimeImageAspectRatio;
}
export interface RuntimeImageCapabilities {
  schemaVersion: 2; revision: string; maxPromptLength: number; maxImageBytes: number;
  targets: Array<{ id: string; provider: RuntimeImageProvider; instance: string }>;
  profiles: RuntimeImageProfile[];
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
const key = (value: unknown, max = 120) => {
  if (typeof value !== 'string' || !value || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new RuntimeImageError('image_service_unavailable');
  return value;
};
const provider = (value: unknown) => {
  if (!IMAGE_PROVIDERS.includes(value as RuntimeImageProvider)) throw new RuntimeImageError('image_service_unavailable');
  return value as RuntimeImageProvider;
};
function aspectRatio(value: unknown): RuntimeImageAspectRatio {
  const input = record(value);
  if (input.mode === 'service') return { mode: 'service' };
  if (input.mode === 'native' && Array.isArray(input.options) && input.options.length === 1 && /^\d{1,2}:\d{1,2}$/.test(String(input.options[0]))) {
    return { mode: 'native', options: [String(input.options[0])] };
  }
  throw new RuntimeImageError('image_service_unavailable');
}
export function projectImageCapabilities(value: unknown): RuntimeImageCapabilities {
  const input = record(value);
  if (input.schemaVersion !== 2 || !Array.isArray(input.targets) || input.targets.length > 100
    || !Array.isArray(input.profiles) || input.profiles.length > 100) throw new RuntimeImageError('image_service_unavailable');
  const targets = input.targets.map((entry) => {
    const target = record(entry);
    const id = key(target.id, 140); const name = provider(target.provider); const instance = key(target.instance, 100);
    if (id !== `${name}/${instance}`) throw new RuntimeImageError('image_service_unavailable');
    return { id, provider: name, instance };
  });
  const known = new Set(targets.map((target) => target.id));
  const profiles = input.profiles.map((entry): RuntimeImageProfile => {
    const profile = record(entry);
    const inputs = record(profile.inputs);
    if (profile.operation !== 'image.generate' || !Number.isSafeInteger(profile.revision) || Number(profile.revision) < 1
      || inputs.min !== 0 || inputs.max !== 0 || !Array.isArray(profile.targetIds) || !Array.isArray(profile.agentConfigs)
      || profile.agentConfigs.length !== 1 || profile.targetIds.some((id) => !known.has(String(id)))) throw new RuntimeImageError('image_service_unavailable');
    const config = record(profile.agentConfigs[0]);
    return { id: key(profile.id), revision: Number(profile.revision), operation: 'image.generate', targetIds: profile.targetIds.map(String),
      agentConfigs: [{ id: key(config.id), model: key(config.model, 100), effort: key(config.effort, 40) }],
      inputs: { min: 0, max: 0 }, aspectRatio: aspectRatio(profile.aspectRatio) };
  });
  return { schemaVersion: 2, revision: key(input.revision, 64), maxPromptLength: 2000, maxImageBytes: IMAGE_MAX_BYTES, targets, profiles };
}
export const IMAGE_ERRORS = new Set(['invalid_image_request', 'image_request_conflict', 'image_service_busy',
  'image_storage_limit', 'image_transport_unsupported', 'image_service_unavailable', 'image_not_found',
  'execution_interrupted', 'cancelled', 'auth_required', 'quota_exhausted', 'privacy_required',
  'generation_refused', 'generation_failed', 'generation_timeout', 'cli_unavailable', 'invalid_image',
  'invalid_image_source', 'image_source_unavailable', 'image_tool_limit', 'image_output_limit', 'storage_full',
  'runtime_capacity_full', 'image_profile_unavailable', 'image_profile_changed']);
export function projectImageOutput(value: unknown): RuntimeImageMetadata {
  const item = record(value);
  const dimension = (size: unknown) => Number.isSafeInteger(size) && Number(size) >= 1 && Number(size) <= MAX_EDGE;
  if (!['image/jpeg', 'image/png'].includes(String(item.mimeType)) || !Number.isSafeInteger(item.bytes) || Number(item.bytes) < 4
    || Number(item.bytes) > IMAGE_MAX_BYTES || !dimension(item.width) || !dimension(item.height)
    || !/^[a-f0-9]{64}$/.test(String(item.sha256)) || !['opaque', 'has-transparency'].includes(String(item.transparency))
    || (item.mimeType === 'image/jpeg' && item.transparency !== 'opaque')) throw new RuntimeImageError('invalid_image');
  return { mimeType: item.mimeType as RuntimeImageMetadata['mimeType'], bytes: Number(item.bytes), width: Number(item.width),
    height: Number(item.height), sha256: String(item.sha256), transparency: item.transparency as RuntimeImageMetadata['transparency'] };
}
export function projectImageJob(value: unknown): RuntimeImageJob {
  const input = record(value);
  if (input.schemaVersion !== 2 || input.operation !== 'image.generate' || !IMAGE_ID.test(String(input.id))
    || !['running', 'succeeded', 'failed', 'cancelling', 'cancelled', 'interrupted'].includes(String(input.status))
    || !Array.isArray(input.warnings) || input.warnings.length > 20
    || !(input.executionOutcome === null || ['completed', 'stopped_after_image'].includes(String(input.executionOutcome)))) throw new RuntimeImageError('image_service_unavailable');
  const name = provider(input.provider); const instance = key(input.instance, 100);
  if (input.targetId !== `${name}/${instance}`) throw new RuntimeImageError('image_service_unavailable');
  const output = input.output == null ? null : projectImageOutput(input.output);
  if (input.status === 'succeeded' && !output) throw new RuntimeImageError('invalid_image');
  return { schemaVersion: 2, id: String(input.id), targetId: `${name}/${instance}`, provider: name, instance,
    profileId: key(input.profileId), profileRevision: key(input.profileRevision, 40),
    agentConfigId: input.agentConfigId === null ? null : key(input.agentConfigId), agentModel: text(input.agentModel, 100),
    agentEffort: input.agentEffort === null ? null : key(input.agentEffort, 40), operation: 'image.generate',
    prompt: text(input.prompt, 4000), status: input.status as RuntimeImageStatus,
    createdAt: text(input.createdAt, 40), updatedAt: text(input.updatedAt, 40), output,
    warnings: input.warnings.map((warning) => key(warning, 60)),
    executionOutcome: input.executionOutcome as RuntimeImageJob['executionOutcome'],
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
