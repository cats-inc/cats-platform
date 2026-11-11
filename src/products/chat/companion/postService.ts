import { createHash, randomUUID } from 'node:crypto';
import type { CompanionDerivedRecord, CompanionPostAttachment, CompanionSnapshot } from './contracts.js';
import type { CompanionBoxStore } from '../state/companion-box/storeTypes.js';
import { ensureCompanionBox, upsertCompanionBoxDerived } from '../state/companion-box/operations.js';
import { COMPANION_PROFILE_METADATA_KEYS as keys } from './profileReadModel.js';

export class CompanionPostError extends Error {
  constructor(readonly code: string, readonly status: 400 | 404 | 409 = 400) { super(code); }
}

export interface CreateCompanionPost {
  requestKey: string;
  body?: string;
  title?: string | null;
  attachments?: CompanionPostAttachment[];
  sourceIds?: string[];
  tags?: string[];
}

export interface UpdateCompanionPost {
  requestKey: string;
  expectedRevision: number;
  body?: string;
  title?: string | null;
  attachments?: CompanionPostAttachment[];
}

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nonEmpty = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const idOf = (postId: string) => postId.startsWith('post:') ? postId.slice(5) : postId;
export const companionPostRevision = (record: CompanionDerivedRecord) =>
  Number.isSafeInteger(record.metadata.profilePostRevision) ? Number(record.metadata.profilePostRevision) : 1;

function findPost(snapshot: CompanionSnapshot, catId: string, postId: string): CompanionDerivedRecord {
  const record = snapshot.derived.find(row => row.id === idOf(postId) && row.catId === catId
    && row.metadata[keys.surface] === keys.postSurface);
  if (!record) throw new CompanionPostError('companion_post_not_found', 404);
  return record;
}

function normalizeAttachments(input: CompanionPostAttachment[]) {
  if (!Array.isArray(input) || input.length > 10) throw new CompanionPostError('invalid_post_attachments');
  return input.map(item => {
    if (!item || !nonEmpty(item.assetId, 250) || typeof item.alt !== 'string' || item.alt.length > 1000) {
      throw new CompanionPostError('invalid_post_attachments');
    }
    return { assetId: item.assetId, alt: item.alt.trim() };
  });
}

function attachments(snapshot: CompanionSnapshot, catId: string, input: CompanionPostAttachment[]) {
  const items = normalizeAttachments(input).map(attachment => {
    const asset = snapshot.mediaAssets.find(row => row.id === attachment.assetId && row.catId === catId);
    if (!asset) throw new CompanionPostError('companion_media_not_found', 404);
    return { attachment, asset };
  });
  if (new Set(items.map(item => item.asset.id)).size !== items.length
    || (items.some(item => item.asset.kind === 'video') && items.length !== 1)) {
    throw new CompanionPostError('invalid_post_attachments');
  }
  return items;
}

function content(body: unknown, title: unknown, count: number) {
  if (typeof body !== 'string' || body.length > 4000 || (!body.trim() && count === 0)
    || (title !== null && (typeof title !== 'string' || title.length > 160))) {
    throw new CompanionPostError('invalid_post_content');
  }
  return { body: body.trim(), title: typeof title === 'string' ? title.trim() || null : null };
}

function storedAttachments(record: CompanionDerivedRecord): CompanionPostAttachment[] {
  const value = record.metadata.profilePostAttachments;
  return Array.isArray(value) ? value.filter((item): item is CompanionPostAttachment =>
    !!item && typeof item === 'object' && typeof item.assetId === 'string' && typeof item.alt === 'string') : [];
}

/** All producers and moderation share this transaction boundary; no transcript parsing. */
export class CompanionPostService {
  constructor(private readonly store: CompanionBoxStore, private readonly now: () => Date = () => new Date()) {}

  async create(catId: string, input: CreateCompanionPost, context: { trigger?: 'owner' | 'heartbeat'; actionId?: string; heartbeatKind?: string;
    share?: boolean; notify?: Array<'dm' | 'telegram'>; assertAllowed?(snapshot: CompanionSnapshot): void } = {}): Promise<CompanionDerivedRecord> {
    if (!nonEmpty(input.requestKey, 250)) throw new CompanionPostError('invalid_post_request_key');
    return this.store.transaction(snapshot => {
      context.assertAllowed?.(snapshot);
      const requested = normalizeAttachments(input.attachments ?? []);
      const normalized = content(input.body ?? '', input.title ?? null, requested.length);
      const sourceIds = input.sourceIds ?? [];
      const tags = input.tags ?? [];
      if (!Array.isArray(sourceIds) || sourceIds.length > 100 || !Array.isArray(tags) || tags.length > 12
        || tags.some(tag => !nonEmpty(tag, 100)) || sourceIds.some(id => !nonEmpty(id, 250))) {
        throw new CompanionPostError('invalid_post_sources');
      }
      const requestHash = digest({ ...normalized, attachments: requested, sourceIds, tags });
      const previous = snapshot.publicationIntents.find(row => row.catId === catId && row.requestKey === input.requestKey);
      if (previous) {
        if (previous.requestHash !== requestHash) throw new CompanionPostError('post_request_conflict', 409);
        return findPost(snapshot, catId, previous.postId);
      }
      // A committed receipt remains retryable after the original source was removed.
      const selected = attachments(snapshot, catId, requested);
      if (sourceIds.some(id => !snapshot.sources.some(source => source.id === id && source.catId === catId))) {
        throw new CompanionPostError('invalid_post_sources');
      }
      const now = this.now().toISOString();
      if (context.trigger === 'heartbeat') {
        const settings = snapshot.mediaSettings.find(row => row.catId === catId);
        const priorPosts = snapshot.publicationIntents.filter(row => row.catId === catId && row.trigger === 'heartbeat');
        if (!settings?.autoPost) throw new CompanionPostError('automatic_posts_disabled', 409);
        if (priorPosts.filter(row => row.createdAt.slice(0, 10) === now.slice(0, 10)).length >= settings.dailyLimit
          || priorPosts.some(row => Date.parse(now) - Date.parse(row.createdAt) < settings.intervalMinutes * 60_000)) {
          throw new CompanionPostError('automatic_post_limit', 409);
        }
      }
      const { box } = ensureCompanionBox(snapshot, catId, now);
      const record: CompanionDerivedRecord = {
        id: `companion-derived-${randomUUID()}`, boxId: box.id, catId, kind: 'normalized_note',
        sourceIds: [...sourceIds], title: normalized.title, content: normalized.body, tags: [...tags],
        createdAt: now, updatedAt: now,
        metadata: {
          [keys.surface]: keys.postSurface, [keys.postStatus]: 'active', [keys.publishedAt]: now,
          [keys.mediaRefs]: selected.map(item => ({ kind: 'artifact', id: item.asset.id })),
          profilePostSchema: 2, profilePostRevision: 1,
          ...(context.trigger === 'heartbeat' ? { profileHeartbeatActionId: context.actionId, profileHeartbeatKind: context.heartbeatKind ?? 'regular' } : {}),
          profilePostAttachments: selected.map(item => item.attachment),
          profilePostAiGenerated: selected.some(item => item.asset.origin === 'generated'),
        },
      };
      upsertCompanionBoxDerived(snapshot, box, record, now);
      snapshot.publicationIntents.push({ id: randomUUID(), postId: `post:${record.id}`, catId,
        requestKey: input.requestKey, requestHash, state: 'published', title: record.title, body: record.content,
        attachments: selected.map(item => item.attachment), pendingJobIds: [], sourceIds: [...sourceIds], tags: [...tags],
        trigger: context.trigger ?? 'owner', share: context.share ?? false, notify: context.notify ?? [],
        followupState: context.share || context.notify?.length ? 'pending' : 'complete',
        error: null, createdAt: now, updatedAt: now });
      return record;
    });
  }

  async queue(catId: string, input: CreateCompanionPost & { pendingJobIds: string[] }, context: {
    trigger: 'owner' | 'heartbeat'; actionId?: string; heartbeatKind?: string; share?: boolean; notify?: Array<'dm' | 'telegram'>; assertAllowed?(snapshot: CompanionSnapshot): void;
  }) {
    const requested = normalizeAttachments(input.attachments ?? []);
    const normalized = content(input.body ?? '', input.title ?? null, requested.length + input.pendingJobIds.length);
    if (!nonEmpty(input.requestKey, 250) || input.pendingJobIds.length !== 1 || !nonEmpty(input.pendingJobIds[0], 250)) throw new CompanionPostError('invalid_post_jobs');
    const sourceIds = input.sourceIds ?? []; const tags = input.tags ?? [];
    if (!Array.isArray(sourceIds) || sourceIds.length > 100 || sourceIds.some(id => !nonEmpty(id, 250))
      || !Array.isArray(tags) || tags.length > 12 || tags.some(tag => !nonEmpty(tag, 100))) throw new CompanionPostError('invalid_post_sources');
    const requestHash = digest({ ...normalized, attachments: requested, pendingJobIds: input.pendingJobIds, sourceIds, tags });
    return this.store.transaction(snapshot => {
      context.assertAllowed?.(snapshot);
      const prior = snapshot.publicationIntents.find(row => row.catId === catId && row.requestKey === input.requestKey);
      if (prior) { if (prior.requestHash !== requestHash) throw new CompanionPostError('post_request_conflict', 409); return prior; }
      attachments(snapshot, catId, requested);
      if (sourceIds.some(id => !snapshot.sources.some(source => source.id === id && source.catId === catId))) throw new CompanionPostError('invalid_post_sources');
      const now = this.now().toISOString();
      if (context.trigger === 'heartbeat') {
        const settings = snapshot.mediaSettings.find(row => row.catId === catId);
        const previous = snapshot.publicationIntents.filter(row => row.catId === catId && row.trigger === 'heartbeat');
        if (!settings?.autoPost || previous.filter(row => row.createdAt.slice(0, 10) === now.slice(0, 10)).length >= settings.dailyLimit
          || previous.some(row => Date.parse(now) - Date.parse(row.createdAt) < settings.intervalMinutes * 60_000)) throw new CompanionPostError('automatic_post_limit', 409);
      }
      const intent = { id: randomUUID(), postId: `post:companion-derived-${randomUUID()}`, catId,
        requestKey: input.requestKey, requestHash, state: 'waiting_for_media' as const, title: normalized.title, body: normalized.body,
        attachments: requested, pendingJobIds: [...input.pendingJobIds], sourceIds: [...sourceIds], tags: [...tags], trigger: context.trigger,
        actionId: context.actionId, heartbeatKind: context.heartbeatKind, share: context.share ?? false, notify: context.notify ?? [],
        followupState: 'pending' as const, error: null, createdAt: now, updatedAt: now };
      snapshot.publicationIntents.push(intent); snapshot.updatedAt = now; return intent;
    });
  }

  async completeMedia(intentId: string, assetIds: string[], assertAllowed: (snapshot: CompanionSnapshot) => void = () => {}) {
    return this.store.transaction(snapshot => {
      assertAllowed(snapshot);
      const intent = snapshot.publicationIntents.find(row => row.id === intentId);
      if (!intent || intent.state !== 'waiting_for_media') return null;
      if (intent.trigger === 'heartbeat') {
        const settings = snapshot.mediaSettings.find(row => row.catId === intent.catId);
        const life = snapshot.boxes.find(row => row.catId === intent.catId)?.life;
        if (!settings?.autoPost || !life || life.mode === 'assist') throw new CompanionPostError('automatic_posts_disabled', 409);
      }
      const selected = attachments(snapshot, intent.catId, [...intent.attachments, ...assetIds.map(assetId => ({ assetId, alt: intent.body.slice(0, 1000) }))]);
      const now = this.now().toISOString(); const { box } = ensureCompanionBox(snapshot, intent.catId, now);
      const record: CompanionDerivedRecord = { id: idOf(intent.postId), boxId: box.id, catId: intent.catId, kind: 'normalized_note',
        sourceIds: intent.sourceIds, title: intent.title, content: intent.body, tags: intent.tags, createdAt: now, updatedAt: now,
        metadata: { [keys.surface]: keys.postSurface, [keys.postStatus]: 'active', [keys.publishedAt]: now,
          [keys.mediaRefs]: selected.map(item => ({ kind: 'artifact', id: item.asset.id })), profilePostSchema: 2, profilePostRevision: 1,
          profilePostAttachments: selected.map(item => item.attachment), profilePostAiGenerated: true,
          ...(intent.trigger === 'heartbeat' ? { profileHeartbeatActionId: intent.actionId, profileHeartbeatKind: intent.heartbeatKind ?? 'regular' } : {}) } };
      upsertCompanionBoxDerived(snapshot, box, record, now);
      intent.state = 'published'; intent.attachments = selected.map(item => item.attachment); intent.updatedAt = now;
      return record;
    });
  }

  async get(catId: string, postId: string) {
    return findPost(await this.store.readSnapshot(), catId, postId);
  }

  async list(catId: string, cursor?: string) {
    const snapshot = await this.store.readSnapshot();
    const ordered = snapshot.derived.filter(row => row.catId === catId
      && row.metadata[keys.surface] === keys.postSurface && row.metadata[keys.postStatus] !== 'removed')
      .sort((a, b) => String(b.metadata[keys.publishedAt] ?? b.createdAt).localeCompare(String(a.metadata[keys.publishedAt] ?? a.createdAt))
        || b.id.localeCompare(a.id));
    let boundary: [string, string] | null = null;
    if (cursor) {
      try {
        const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (!Array.isArray(parsed) || parsed.length !== 2 || !parsed.every(item => typeof item === 'string')) throw new Error();
        boundary = parsed as [string, string];
      } catch { throw new CompanionPostError('invalid_post_cursor'); }
    }
    const page = ordered.filter(row => !boundary || String(row.metadata[keys.publishedAt] ?? row.createdAt) < boundary[0]
      || (String(row.metadata[keys.publishedAt] ?? row.createdAt) === boundary[0] && row.id.localeCompare(boundary[1]) < 0));
    const items = page.slice(0, 20);
    const last = items.at(-1);
    return { items, nextCursor: page.length > 20 && last
      ? Buffer.from(JSON.stringify([String(last.metadata[keys.publishedAt] ?? last.createdAt), last.id])).toString('base64url') : null };
  }

  async update(catId: string, postId: string, input: UpdateCompanionPost, assertAllowed: (snapshot: CompanionSnapshot) => void = () => {}) {
    if (!nonEmpty(input.requestKey, 250) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new CompanionPostError('invalid_post_revision');
    }
    return this.store.transaction(snapshot => {
      assertAllowed(snapshot);
      const record = findPost(snapshot, catId, postId);
      if (record.metadata[keys.postStatus] === 'removed') throw new CompanionPostError('companion_post_removed', 409);
      const requestHash = digest({ body: input.body, title: input.title, attachments: input.attachments, expectedRevision: input.expectedRevision });
      const receipts = (Array.isArray(record.metadata.profilePostMutations) ? record.metadata.profilePostMutations : [])
        .filter((row): row is { key: string; hash: string } => !!row && typeof row === 'object'
          && typeof row.key === 'string' && typeof row.hash === 'string');
      const previous = receipts.find(row => row.key === input.requestKey);
      if (previous) {
        if (previous.hash !== requestHash) throw new CompanionPostError('post_request_conflict', 409);
        return record;
      }
      if (companionPostRevision(record) !== input.expectedRevision) throw new CompanionPostError('post_revision_conflict', 409);
      const selected = attachments(snapshot, catId, input.attachments ?? storedAttachments(record));
      const keepLegacyMedia = input.attachments === undefined && !Array.isArray(record.metadata.profilePostAttachments);
      const legacyRefs = record.metadata[keys.mediaRefs];
      const legacyCount = Array.isArray(legacyRefs) ? legacyRefs.length : 0;
      const normalized = content(input.body ?? record.content, input.title === undefined ? record.title : input.title,
        keepLegacyMedia ? legacyCount : selected.length);
      record.content = normalized.body; record.title = normalized.title;
      record.updatedAt = this.now().toISOString(); snapshot.updatedAt = record.updatedAt;
      record.metadata = { ...record.metadata, profilePostRevision: input.expectedRevision + 1,
        ...(keepLegacyMedia ? {} : {
          profilePostAttachments: selected.map(item => item.attachment),
          [keys.mediaRefs]: selected.map(item => ({ kind: 'artifact', id: item.asset.id })),
          profilePostAiGenerated: selected.some(item => item.asset.origin === 'generated'),
        }),
        profilePostMutations: [...receipts, { key: input.requestKey, hash: requestHash }] };
      return record;
    });
  }

  async remove(catId: string, postId: string, assertAllowed: (snapshot: CompanionSnapshot) => void = () => {}) {
    return this.store.transaction(snapshot => {
      assertAllowed(snapshot);
      const record = findPost(snapshot, catId, postId);
      const canonicalId = `post:${record.id}`;
      const now = this.now().toISOString();
      const changed = record.metadata[keys.postStatus] !== 'removed';
      if (changed) {
        record.metadata = { ...record.metadata, [keys.postStatus]: 'removed', profilePostRevision: companionPostRevision(record) + 1 };
        record.updatedAt = now; snapshot.updatedAt = now;
      }
      for (const intent of snapshot.publicationIntents.filter(row => row.catId === catId && row.postId === canonicalId)) {
        intent.state = 'cancelled'; intent.updatedAt = now;
      }
      for (const grant of snapshot.shareGrants.filter(row => row.catId === catId && row.postId === canonicalId)) grant.revokedAt ??= now;
      for (const intent of snapshot.notificationIntents.filter(row => row.catId === catId && row.postId === canonicalId)) {
        if (['pending', 'failed'].includes(intent.state)) { intent.state = 'suppressed'; intent.updatedAt = now; }
      }
      return { postId: canonicalId, changed, status: 'removed' as const };
    });
  }
}
