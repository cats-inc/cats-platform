import type {
  CompanionSourceKind,
  CompanionSourceRecord,
} from './contracts.js';

/**
 * SPEC-085 §source classifier — surface a `CompanionSourceRecord` lands on
 * in the companion profile IA.
 *
 * `source_only` records remain visible in `Sources` but do not project into
 * Posts / Photos / Videos / Music / Files. They are still promotable via
 * the explicit owner `Promote to post` action (Phase 2 follow-up slice).
 */
export type CompanionSourceSurface =
  | 'photo'
  | 'video'
  | 'music'
  | 'file'
  | 'source_only';

/**
 * The minimum shape the classifier needs. The full
 * `CompanionSourceRecord` shape from `contracts.ts` is the canonical input,
 * but accepting a structural subset lets the same helper run over derived
 * records and artifact projections that carry the same MIME / extension
 * signals without requiring a full record.
 */
export interface CompanionSourceClassifierInput {
  kind: CompanionSourceKind | string;
  mimeType?: string | null;
  originalFileName?: string | null;
  linkedPath?: string | null;
  sourceUrl?: string | null;
  storedPath?: string | null;
}

const PHOTO_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp',
  '.tif', '.tiff',
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi',
]);

const MUSIC_EXTENSIONS = new Set([
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus',
]);

const FILE_EXTENSIONS = new Set([
  '.pdf', '.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.jsonl',
  '.xml', '.yaml', '.yml', '.zip', '.tar', '.gz', '.doc', '.docx',
  '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
]);

const FILE_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'application/x-ndjson',
  'application/xml',
  'text/xml',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

const SVG_EXTENSION = '.svg';
const SVG_MIME = 'image/svg+xml';
const OCTET_STREAM_MIME = 'application/octet-stream';

const SOURCE_ONLY_KINDS = new Set<string>(['note', 'article', 'conversation_log']);

function normalizeMimeType(mime: string | null | undefined): string {
  return typeof mime === 'string' ? mime.trim().toLowerCase() : '';
}

function extractExtension(name: string | null | undefined): string {
  if (typeof name !== 'string') {
    return '';
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const baseName = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const dotIndex = baseName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return '';
  }
  return baseName.slice(dotIndex).toLowerCase();
}

function pickFirstExtension(input: CompanionSourceClassifierInput): string {
  return (
    extractExtension(input.originalFileName)
    || extractExtension(input.linkedPath)
    || extractExtension(input.sourceUrl)
  );
}

function classifyByExtension(extension: string): CompanionSourceSurface | null {
  if (extension === SVG_EXTENSION) return 'file';
  if (PHOTO_EXTENSIONS.has(extension)) return 'photo';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (MUSIC_EXTENSIONS.has(extension)) return 'music';
  if (FILE_EXTENSIONS.has(extension)) return 'file';
  return null;
}

function classifyByMimeOrExtension(
  mime: string,
  extension: string,
  kindHint: string,
): CompanionSourceSurface | null {
  // SVG-as-file is checked first so an `image/svg+xml` MIME doesn't fall
  // through into the generic image/* branch and get classified as `photo`.
  if (mime === SVG_MIME) return 'file';
  if (extension === SVG_EXTENSION) return 'file';

  if (
    kindHint === 'image'
    || mime.startsWith('image/')
    || PHOTO_EXTENSIONS.has(extension)
  ) {
    return 'photo';
  }
  if (
    kindHint === 'video'
    || mime.startsWith('video/')
    || VIDEO_EXTENSIONS.has(extension)
  ) {
    return 'video';
  }
  if (
    kindHint === 'audio'
    || mime.startsWith('audio/')
    || MUSIC_EXTENSIONS.has(extension)
  ) {
    return 'music';
  }
  if (FILE_MIME_TYPES.has(mime) || FILE_EXTENSIONS.has(extension)) {
    return 'file';
  }
  return null;
}

export function classifyCompanionSource(
  input: CompanionSourceClassifierInput,
): CompanionSourceSurface {
  const mime = normalizeMimeType(input.mimeType);
  const extension = pickFirstExtension(input);
  const kindHint = typeof input.kind === 'string' ? input.kind : '';

  const direct = classifyByMimeOrExtension(mime, extension, kindHint);
  if (direct) {
    return direct;
  }

  if (mime === OCTET_STREAM_MIME) {
    if (extension && classifyByExtension(extension)) {
      return classifyByExtension(extension)!;
    }
    return 'file';
  }

  if (kindHint === 'path_ref') {
    if (extension && classifyByExtension(extension)) {
      return classifyByExtension(extension)!;
    }
    return 'file';
  }

  if (
    SOURCE_ONLY_KINDS.has(kindHint)
    && extension === ''
    && mime === ''
  ) {
    return 'source_only';
  }

  // Fallback: anything else with no signal lands in Sources only.
  return 'source_only';
}

/**
 * Convenience wrapper for callers holding a `CompanionSourceRecord` —
 * threads the right fields through the structural classifier without
 * each call site spelling them out.
 */
export function classifyCompanionSourceRecord(
  record: CompanionSourceRecord,
): CompanionSourceSurface {
  return classifyCompanionSource({
    kind: record.kind,
    mimeType: record.mimeType,
    originalFileName: record.originalFileName,
    linkedPath: record.linkedPath,
    sourceUrl: record.sourceUrl,
    storedPath: record.storedPath,
  });
}
