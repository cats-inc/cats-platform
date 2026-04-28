import type { CompanionDerivedRecord } from './contracts.js';

/**
 * Companion profile read model — projections the companion main surface
 * tabs render. The model is intentionally agent-only: posts, photos, videos,
 * music, and files all come from `CompanionDerivedRecord` entries that the
 * Cat (or future agent producers) wrote with `metadata.profileSurface` set
 * to one of `post` / `photo` / `video` / `music` / `file`. Owner-supplied
 * `CompanionSourceRecord` data is NOT projected into these tabs — sources
 * are the ingredients the Cat reads from, never auto-published material on
 * the profile surface.
 */

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
  mediaRefs: CompanionProfilePostMediaRef[];
  sourceIds: string[];
  publishedAt: string;
  updatedAt: string;
}

export type CompanionProfileMediaSurface = 'photo' | 'video' | 'music';

export interface CompanionProfileMediaTile {
  id: string;
  surface: CompanionProfileMediaSurface;
  derivedId: string;
  title: string;
  mimeType: string | null;
  storedPath: string | null;
  publishedAt: string;
  updatedAt: string;
}

export interface CompanionProfileFileTile {
  id: string;
  derivedId: string;
  title: string;
  mimeType: string | null;
  storedPath: string | null;
  publishedAt: string;
  updatedAt: string;
}

export interface CompanionProfileReadModel {
  posts: CompanionProfilePost[];
  photos: CompanionProfileMediaTile[];
  videos: CompanionProfileMediaTile[];
  music: CompanionProfileMediaTile[];
  files: CompanionProfileFileTile[];
}

const PROFILE_SURFACE_KEY = 'profileSurface';
const PROFILE_POST_SURFACE = 'post';
const PROFILE_PHOTO_SURFACE = 'photo';
const PROFILE_VIDEO_SURFACE = 'video';
const PROFILE_MUSIC_SURFACE = 'music';
const PROFILE_FILE_SURFACE = 'file';

const PROFILE_POST_STATUS_KEY = 'profilePostStatus';
const PROFILE_PUBLISHED_AT_KEY = 'profilePublishedAt';
const PROFILE_MEDIA_REFS_KEY = 'profilePostMediaRefs';
const PROFILE_MEDIA_STORED_PATH_KEY = 'profileMediaStoredPath';
const PROFILE_MEDIA_MIME_TYPE_KEY = 'profileMediaMimeType';

export interface ProjectCompanionProfileInput {
  derived: readonly CompanionDerivedRecord[];
}

export function projectCompanionProfile(
  input: ProjectCompanionProfileInput,
): CompanionProfileReadModel {
  const posts: CompanionProfilePost[] = [];
  const photos: CompanionProfileMediaTile[] = [];
  const videos: CompanionProfileMediaTile[] = [];
  const music: CompanionProfileMediaTile[] = [];
  const files: CompanionProfileFileTile[] = [];

  for (const record of input.derived) {
    const surface = readSurface(record);
    if (surface === PROFILE_POST_SURFACE) {
      posts.push(buildPost(record));
      continue;
    }
    if (surface === PROFILE_PHOTO_SURFACE) {
      photos.push(buildMediaTile(record, 'photo'));
      continue;
    }
    if (surface === PROFILE_VIDEO_SURFACE) {
      videos.push(buildMediaTile(record, 'video'));
      continue;
    }
    if (surface === PROFILE_MUSIC_SURFACE) {
      music.push(buildMediaTile(record, 'music'));
      continue;
    }
    if (surface === PROFILE_FILE_SURFACE) {
      files.push(buildFileTile(record));
      continue;
    }
  }

  posts.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  photos.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  videos.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  music.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  files.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  return { posts, photos, videos, music, files };
}

function readSurface(record: CompanionDerivedRecord): string | null {
  const metadata = record.metadata ?? {};
  const value = metadata[PROFILE_SURFACE_KEY];
  return typeof value === 'string' ? value : null;
}

function readPublishedAt(record: CompanionDerivedRecord): string {
  const metadata = record.metadata ?? {};
  const value = metadata[PROFILE_PUBLISHED_AT_KEY];
  return typeof value === 'string' ? value : record.createdAt;
}

function buildPost(record: CompanionDerivedRecord): CompanionProfilePost {
  const metadata = record.metadata ?? {};
  const status = metadata[PROFILE_POST_STATUS_KEY] === 'removed' ? 'removed' : 'active';
  return {
    id: `post:${record.id}`,
    derivedId: record.id,
    catId: record.catId,
    title: record.title ?? '(Untitled post)',
    body: record.content,
    tags: [...record.tags],
    status,
    mediaRefs: readMediaRefs(metadata[PROFILE_MEDIA_REFS_KEY]),
    sourceIds: [...record.sourceIds],
    publishedAt: readPublishedAt(record),
    updatedAt: record.updatedAt,
  };
}

function buildMediaTile(
  record: CompanionDerivedRecord,
  surface: CompanionProfileMediaSurface,
): CompanionProfileMediaTile {
  const metadata = record.metadata ?? {};
  return {
    id: `${surface}:${record.id}`,
    surface,
    derivedId: record.id,
    title: record.title ?? '(Untitled)',
    mimeType: typeof metadata[PROFILE_MEDIA_MIME_TYPE_KEY] === 'string'
      ? (metadata[PROFILE_MEDIA_MIME_TYPE_KEY] as string)
      : null,
    storedPath: typeof metadata[PROFILE_MEDIA_STORED_PATH_KEY] === 'string'
      ? (metadata[PROFILE_MEDIA_STORED_PATH_KEY] as string)
      : null,
    publishedAt: readPublishedAt(record),
    updatedAt: record.updatedAt,
  };
}

function buildFileTile(record: CompanionDerivedRecord): CompanionProfileFileTile {
  const metadata = record.metadata ?? {};
  return {
    id: `file:${record.id}`,
    derivedId: record.id,
    title: record.title ?? '(Untitled file)',
    mimeType: typeof metadata[PROFILE_MEDIA_MIME_TYPE_KEY] === 'string'
      ? (metadata[PROFILE_MEDIA_MIME_TYPE_KEY] as string)
      : null,
    storedPath: typeof metadata[PROFILE_MEDIA_STORED_PATH_KEY] === 'string'
      ? (metadata[PROFILE_MEDIA_STORED_PATH_KEY] as string)
      : null,
    publishedAt: readPublishedAt(record),
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const COMPANION_PROFILE_METADATA_KEYS = {
  surface: PROFILE_SURFACE_KEY,
  postSurface: PROFILE_POST_SURFACE,
  photoSurface: PROFILE_PHOTO_SURFACE,
  videoSurface: PROFILE_VIDEO_SURFACE,
  musicSurface: PROFILE_MUSIC_SURFACE,
  fileSurface: PROFILE_FILE_SURFACE,
  postStatus: PROFILE_POST_STATUS_KEY,
  publishedAt: PROFILE_PUBLISHED_AT_KEY,
  mediaRefs: PROFILE_MEDIA_REFS_KEY,
  mediaStoredPath: PROFILE_MEDIA_STORED_PATH_KEY,
  mediaMimeType: PROFILE_MEDIA_MIME_TYPE_KEY,
} as const;
