import type {
  CompanionDerivedRecord,
  CompanionSourceRecord,
} from './contracts.js';
import {
  classifyCompanionSourceRecord,
  type CompanionSourceSurface,
} from './sourceClassifier.js';

/**
 * SPEC-085 §profile read model — projections the companion main surface
 * tabs render. Each tile shape is intentionally flat: it carries the
 * source/derived id, the surface label, and only the fields the renderer
 * needs. Render-side widgets resolve thumbnails/links from the underlying
 * source on demand.
 */

export type CompanionProfileFileTileOrigin = 'source' | 'artifact';

export interface CompanionProfileFileTile {
  id: string;
  origin: CompanionProfileFileTileOrigin;
  sourceId: string;
  title: string;
  mimeType: string | null;
  storedPath: string | null;
  linkedPath: string | null;
  sourceUrl: string | null;
  updatedAt: string;
}

export type CompanionProfileMediaSurface = Extract<
  CompanionSourceSurface,
  'photo' | 'video' | 'music'
>;

export interface CompanionProfileMediaTile {
  id: string;
  surface: CompanionProfileMediaSurface;
  sourceId: string;
  title: string;
  storedPath: string | null;
  linkedPath: string | null;
  sourceUrl: string | null;
  mimeType: string | null;
  updatedAt: string;
}

export type CompanionProfilePostStatus = 'active' | 'removed';

export type CompanionProfilePostMediaKind = 'source' | 'derived' | 'artifact';

export interface CompanionProfilePostMediaRef {
  kind: CompanionProfilePostMediaKind;
  id: string;
}

export interface CompanionProfilePost {
  id: string;
  derivedId: string;
  catId: string;
  title: string;
  body: string;
  tags: string[];
  status: CompanionProfilePostStatus;
  originType: string | null;
  originId: string | null;
  mediaRefs: CompanionProfilePostMediaRef[];
  sourceIds: string[];
  promotedAt: string;
  updatedAt: string;
}

export interface CompanionProfileReadModel {
  posts: CompanionProfilePost[];
  photos: CompanionProfileMediaTile[];
  videos: CompanionProfileMediaTile[];
  music: CompanionProfileMediaTile[];
  files: CompanionProfileFileTile[];
}

const PROFILE_POST_PRODUCER = 'owner_promotion_v1';
const PROFILE_POST_SURFACE = 'post';

export interface ProjectCompanionProfileInput {
  sources: readonly CompanionSourceRecord[];
  derived: readonly CompanionDerivedRecord[];
}

export function projectCompanionProfile(
  input: ProjectCompanionProfileInput,
): CompanionProfileReadModel {
  const sourcesById = new Map<string, CompanionSourceRecord>();
  for (const source of input.sources) {
    sourcesById.set(source.id, source);
  }

  const photos: CompanionProfileMediaTile[] = [];
  const videos: CompanionProfileMediaTile[] = [];
  const music: CompanionProfileMediaTile[] = [];
  const files: CompanionProfileFileTile[] = [];

  for (const source of input.sources) {
    const surface = classifyCompanionSourceRecord(source);
    if (surface === 'photo') {
      photos.push(buildMediaTile(source, 'photo'));
      continue;
    }
    if (surface === 'video') {
      videos.push(buildMediaTile(source, 'video'));
      continue;
    }
    if (surface === 'music') {
      music.push(buildMediaTile(source, 'music'));
      continue;
    }
    if (surface === 'file') {
      files.push(buildFileTile(source));
      // SPEC-085 rule 32: an owner-uploaded PDF projects into BOTH
      // Sources (provenance) and Files (browsing). The Sources tab
      // continues to read from the raw source list directly, so this
      // append is the only thing needed to satisfy the dual-projection
      // contract.
      continue;
    }
    // 'source_only' stays in Sources (raw source list) and does not
    // project into the media or files tabs.
  }

  const posts = projectCompanionPosts(input.derived, sourcesById);

  return { posts, photos, videos, music, files };
}

export function projectCompanionPosts(
  derived: readonly CompanionDerivedRecord[],
  _sourcesById?: ReadonlyMap<string, CompanionSourceRecord>,
): CompanionProfilePost[] {
  const posts: CompanionProfilePost[] = [];
  for (const record of derived) {
    if (!isProfilePostRecord(record)) {
      continue;
    }
    posts.push(buildProfilePost(record));
  }
  posts.sort((left, right) => right.promotedAt.localeCompare(left.promotedAt));
  return posts;
}

function isProfilePostRecord(record: CompanionDerivedRecord): boolean {
  const metadata = record.metadata ?? {};
  return (
    typeof metadata.profileSurface === 'string'
    && metadata.profileSurface === PROFILE_POST_SURFACE
  );
}

function buildProfilePost(record: CompanionDerivedRecord): CompanionProfilePost {
  const metadata = record.metadata ?? {};
  const status = metadata.profilePostStatus === 'removed' ? 'removed' : 'active';
  const mediaRefs = readMediaRefs(metadata.profilePostMediaRefs);
  const promotedAt =
    typeof metadata.profilePostPromotedAt === 'string'
      ? metadata.profilePostPromotedAt
      : record.createdAt;
  return {
    id: `post:${record.id}`,
    derivedId: record.id,
    catId: record.catId,
    title: record.title ?? '(Untitled post)',
    body: record.content,
    tags: [...record.tags],
    status,
    originType:
      typeof metadata.profilePostOriginType === 'string'
        ? metadata.profilePostOriginType
        : null,
    originId:
      typeof metadata.profilePostOriginId === 'string'
        ? metadata.profilePostOriginId
        : null,
    mediaRefs,
    sourceIds: [...record.sourceIds],
    promotedAt,
    updatedAt: record.updatedAt,
  };
}

function readMediaRefs(value: unknown): CompanionProfilePostMediaRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const refs: CompanionProfilePostMediaRef[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const kindRaw = entry.kind;
    const idRaw = entry.id;
    const kind: CompanionProfilePostMediaKind | null =
      kindRaw === 'source' || kindRaw === 'derived' || kindRaw === 'artifact'
        ? kindRaw
        : null;
    if (!kind) continue;
    if (typeof idRaw !== 'string' || idRaw.trim().length === 0) continue;
    refs.push({ kind, id: idRaw });
  }
  return refs;
}

function buildMediaTile(
  source: CompanionSourceRecord,
  surface: CompanionProfileMediaSurface,
): CompanionProfileMediaTile {
  return {
    id: `${surface}:${source.id}`,
    surface,
    sourceId: source.id,
    title: source.title ?? source.originalFileName ?? '(Untitled)',
    storedPath: source.storedPath,
    linkedPath: source.linkedPath,
    sourceUrl: source.sourceUrl,
    mimeType: source.mimeType,
    updatedAt: source.updatedAt,
  };
}

function buildFileTile(source: CompanionSourceRecord): CompanionProfileFileTile {
  return {
    id: `file:${source.id}`,
    origin: 'source',
    sourceId: source.id,
    title: source.title ?? source.originalFileName ?? '(Untitled file)',
    mimeType: source.mimeType,
    storedPath: source.storedPath,
    linkedPath: source.linkedPath,
    sourceUrl: source.sourceUrl,
    updatedAt: source.updatedAt,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  );
}

export const COMPANION_PROFILE_POST_METADATA_KEYS = {
  surface: 'profileSurface',
  surfaceValue: PROFILE_POST_SURFACE,
  status: 'profilePostStatus',
  producer: 'profilePostProducer',
  producerValue: PROFILE_POST_PRODUCER,
  originType: 'profilePostOriginType',
  originId: 'profilePostOriginId',
  mediaRefs: 'profilePostMediaRefs',
  promotedAt: 'profilePostPromotedAt',
} as const;
