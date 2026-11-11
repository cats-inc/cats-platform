import { IMAGE_ID, IMAGE_MAX_BYTES, RuntimeImageError, projectImageJob, projectImageOutput,
  projectImageCapabilities, type RuntimeImageJob, type RuntimeImageMetadata, type RuntimeImageCapabilities, type RuntimeImageProfile } from './images.js';

export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;
export type MediaOperation = 'image.generate' | 'image.edit' | 'video.generate';
export type RuntimeMediaMetadata = RuntimeImageMetadata | { mimeType: 'video/mp4'; bytes: number; width: number; height: number;
  sha256: string; transparency: 'opaque'; durationSeconds: number };
export interface RuntimeMediaRequest {
  contractVersion: 3; id: string; targetId: string; profileId: string; profileRevision: string; agentConfigId: string;
  operation: 'image.edit' | 'video.generate'; prompt: string; sourceIds: string[]; options: { durationSeconds?: 6 | 10 }; sourceSessionId?: string;
}
export type RuntimeMediaJob = Omit<RuntimeImageJob, 'schemaVersion' | 'operation' | 'output'> & {
  schemaVersion: 2 | 3; operation: MediaOperation; output: RuntimeMediaMetadata | null; sourceIds?: string[]; options?: { durationSeconds?: 6 | 10 };
};
export type RuntimeMediaProfile = Omit<RuntimeImageProfile, 'operation' | 'inputs'> & { operation: MediaOperation; inputs: { min: number; max: number } };
export type RuntimeMediaCapabilities = Omit<RuntimeImageCapabilities, 'profiles'> & { mediaContractVersion: 3; profiles: RuntimeMediaProfile[] };
export function projectMediaOutput(value: unknown): RuntimeMediaMetadata {
  const row = value as Record<string, unknown>;
  if (row?.mimeType !== 'video/mp4') return projectImageOutput(value);
  if (!Number.isSafeInteger(row.bytes) || Number(row.bytes) < 4 || Number(row.bytes) > MEDIA_MAX_BYTES
    || ![row.width, row.height].every(n => Number.isInteger(n) && Number(n) > 0 && Number(n) <= 1920)
    || typeof row.durationSeconds !== 'number' || !Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0 || row.durationSeconds > 30
    || !/^[a-f0-9]{64}$/.test(String(row.sha256))) throw new RuntimeImageError('invalid_image');
  return { mimeType: 'video/mp4', bytes: Number(row.bytes), width: Number(row.width), height: Number(row.height),
    durationSeconds: row.durationSeconds, sha256: String(row.sha256), transparency: 'opaque' };
}
export function projectMediaJob(value: unknown): RuntimeMediaJob {
  const row = value as Record<string, unknown>;
  if (row?.schemaVersion === 2) return projectImageJob(value);
  if (row?.schemaVersion !== 3 || !['image.edit', 'video.generate'].includes(String(row.operation))
    || !Array.isArray(row.sourceIds) || !row.sourceIds.length || row.sourceIds.length > 3 || row.sourceIds.some(id => !IMAGE_ID.test(String(id)))) {
    throw new RuntimeImageError('image_service_unavailable');
  }
  const output = row.output == null ? null : projectMediaOutput(row.output);
  if (row.status === 'succeeded' && (!output || (row.operation === 'video.generate') !== (output.mimeType === 'video/mp4'))) throw new RuntimeImageError('invalid_image');
  const base = projectImageJob({ ...row, schemaVersion: 2, operation: 'image.generate', status: row.status === 'succeeded' ? 'running' : row.status, output: null });
  return { ...base, schemaVersion: 3, operation: row.operation as MediaOperation, status: row.status as RuntimeMediaJob['status'], output,
    sourceIds: row.sourceIds as string[], options: (row.options ?? {}) as RuntimeMediaJob['options'] };
}
export function projectMediaCapabilities(value: unknown): RuntimeMediaCapabilities {
  const row = value as { mediaContractVersion?: unknown; profiles?: unknown[] };
  const base = projectImageCapabilities(value);
  if (row.mediaContractVersion !== 3) throw new RuntimeImageError('image_runtime_upgrade_required');
  const profiles: RuntimeMediaProfile[] = [...base.profiles];
  for (const entry of row.profiles ?? []) {
    const p = entry as RuntimeMediaProfile;
    if (!['image.edit', 'video.generate'].includes(p.operation) || p.inputs?.min !== 1 || p.inputs.max !== (p.operation === 'image.edit' ? 3 : 1)) continue;
    const projected = projectImageCapabilities({ ...value as object, profiles: [{ ...p, operation: 'image.generate', inputs: { min: 0, max: 0 } }] }).profiles[0];
    if (projected) profiles.push({ ...projected, operation: p.operation, inputs: p.inputs });
  }
  return { ...base, mediaContractVersion: 3, profiles };
}
export const mediaByteLimit = (output: RuntimeMediaMetadata | null) => output?.mimeType === 'video/mp4' ? MEDIA_MAX_BYTES : IMAGE_MAX_BYTES;
