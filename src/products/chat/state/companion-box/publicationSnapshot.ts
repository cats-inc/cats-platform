import type { CompanionPublicationState } from '../../companion/contracts.js';

export function emptyPublicationState(): CompanionPublicationState {
  return { mediaAssets: [], publicationIntents: [], shareGrants: [], notificationIntents: [], mediaSettings: [] };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const key = (value: unknown) => text(value) && value.length > 0 && value.length <= 250 && !/[\u0000-\u001f]/u.test(value);
const nullableText = (value: unknown) => value === null || text(value);
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value));
const strings = (value: unknown) => Array.isArray(value) && value.every(text);
const integer = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const destinations = (value: unknown) => Array.isArray(value)
  && value.every(item => item === 'dm' || item === 'telegram') && new Set(value).size === value.length;
const oneOf = (value: unknown, options: string[]) => text(value) && options.includes(value);
const hash = (value: unknown) => text(value) && /^[a-f0-9]{64}$/u.test(value);

/** Reject invalid/partial state instead of silently dropping grants, assets, or pending work. */
export function normalizePublicationState(value: Record<string, unknown>): CompanionPublicationState {
  const validators: Record<keyof CompanionPublicationState, (row: Record<string, unknown>) => boolean> = {
    mediaAssets: row => key(row.id) && key(row.catId) && oneOf(row.kind, ['image', 'video'])
      && text(row.fileName) && /^[a-f0-9-]+\.(jpg|png|webp|mp4|webm)$/u.test(row.fileName)
      && oneOf(row.mimeType, row.kind === 'image'
        ? ['image/jpeg', 'image/png', 'image/webp'] : ['video/mp4', 'video/webm'])
      && integer(row.bytes) && hash(row.sha256) && integer(row.width) && integer(row.height)
      && (row.durationSeconds === null || (typeof row.durationSeconds === 'number'
        && Number.isFinite(row.durationSeconds) && row.durationSeconds > 0))
      && oneOf(row.origin, ['source', 'avatar', 'cover', 'generated'])
      && strings(row.sourceIds) && nullableText(row.jobId) && date(row.createdAt),
    publicationIntents: row => key(row.id) && key(row.catId) && key(row.postId) && key(row.requestKey)
      && hash(row.requestHash) && oneOf(row.state, ['waiting_for_media', 'ready', 'published', 'failed', 'cancelled'])
      && nullableText(row.title) && text(row.body) && strings(row.pendingJobIds) && strings(row.sourceIds)
      && strings(row.tags) && oneOf(row.trigger, ['owner', 'heartbeat']) && typeof row.share === 'boolean'
      && destinations(row.notify) && nullableText(row.error) && date(row.createdAt) && date(row.updatedAt)
      && Array.isArray(row.attachments) && row.attachments.every(item => record(item) && key(item.assetId) && text(item.alt)),
    shareGrants: row => key(row.id) && key(row.catId) && key(row.postId) && text(row.token)
      && /^[A-Za-z0-9_-]{32,}$/u.test(row.token) && hash(row.tokenHash) && date(row.createdAt)
      && (row.revokedAt === null || date(row.revokedAt)),
    notificationIntents: row => key(row.id) && key(row.catId) && key(row.postId) && integer(row.revision)
      && oneOf(row.destination, ['dm', 'telegram'])
      && oneOf(row.state, ['pending', 'sending', 'sent', 'failed', 'uncertain', 'suppressed'])
      && nullableText(row.transportMessageId) && nullableText(row.error) && date(row.createdAt) && date(row.updatedAt),
    mediaSettings: row => key(row.catId) && nullableText(row.coverAssetId)
      && typeof row.useProfileImages === 'boolean' && typeof row.autoPost === 'boolean'
      && typeof row.autoShare === 'boolean' && destinations(row.notify)
      && integer(row.dailyLimit) && integer(row.intervalMinutes) && date(row.updatedAt),
  };
  const result = emptyPublicationState();
  for (const name of Object.keys(validators) as Array<keyof CompanionPublicationState>) {
    const rows = value[name];
    if (!Array.isArray(rows) || rows.some(row => !record(row) || !validators[name](row))
      || new Set(rows.map(row => name === 'mediaSettings' ? row.catId : row.id)).size !== rows.length) {
      throw new Error(`Invalid companion publication collection: ${name}`);
    }
    // The validators above check the persisted shape; keep unknown additive fields intact.
    Object.assign(result, { [name]: structuredClone(rows) });
  }
  return result;
}
