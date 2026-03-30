import { readFile, stat } from 'node:fs/promises';

interface DesktopHostAttemptIdCacheEntry {
  signature: string;
  value: string | null;
}

const attemptIdCache = new Map<string, DesktopHostAttemptIdCacheEntry>();

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function buildFileSignature(stats: {
  mtimeMs: number;
  size: number;
}): string {
  return `${stats.mtimeMs}:${stats.size}`;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT'
  );
}

export async function readDesktopHostBootstrapAttemptId(
  hostStatePath: string | null | undefined,
): Promise<string | null> {
  if (!hostStatePath) {
    return null;
  }

  try {
    const cached = attemptIdCache.get(hostStatePath) ?? null;
    const fileStats = await stat(hostStatePath);
    const signature = buildFileSignature(fileStats);
    if (cached?.signature === signature) {
      return cached.value;
    }

    const raw = await readFile(hostStatePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed)) {
      attemptIdCache.set(hostStatePath, { signature, value: null });
      return null;
    }
    const diagnostics = parsed.diagnostics;
    if (!isObjectRecord(diagnostics)) {
      attemptIdCache.set(hostStatePath, { signature, value: null });
      return null;
    }
    const value = readString(diagnostics.activeAttemptId);
    attemptIdCache.set(hostStatePath, {
      signature,
      value,
    });
    return value;
  } catch (error) {
    if (isMissingFileError(error)) {
      attemptIdCache.delete(hostStatePath);
      return null;
    }
    return attemptIdCache.get(hostStatePath)?.value ?? null;
  }
}
