const STORAGE_ROOT_KEY = 'companion-boxes';

function sanitizePathSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';

  if (normalized === '.' || normalized === '..') {
    return 'unknown';
  }

  return normalized;
}

export function buildCompanionBoxDirectoryKey(catId: string): string {
  return `${STORAGE_ROOT_KEY}/${sanitizePathSegment(catId)}`;
}

export function buildCompanionSourcesDirectoryKey(catId: string): string {
  return `${buildCompanionBoxDirectoryKey(catId)}/sources`;
}

export function buildCompanionSnapshotKey(snapshotFileName: string): string {
  return `config/${sanitizePathSegment(snapshotFileName)}`;
}

export function buildCompanionSourceStorageKey(
  catId: string,
  sourceId: string,
  extension: string,
): string {
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  return `${buildCompanionSourcesDirectoryKey(catId)}/${sanitizePathSegment(sourceId)}${normalizedExtension}`;
}
