import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  resolvePlatformStorageLayout,
} from './platformPaths.js';

/**
 * SPEC-086 §scopeId — the platform-host product data scope id. One
 * UUIDv4 per durable Cats product data root, generated once and
 * persisted next to that root. The desktop main process (in
 * local-first installs) and the standalone server resolve the same
 * id via the same `chatStatePath`.
 *
 * `scopeId` is NOT an auth account id, browser storage value, or
 * workspace id. It exists so a `cats://companion/v1/<scopeId>/...`
 * reference resolves only when the consumer is reading the same
 * data root the writer was reading from.
 */

export const PLATFORM_SCOPE_FILE_NAME = 'platform-scope.json';

interface PersistedScopeFile {
  scopeId: string;
  createdAt: string;
}

export function resolvePlatformScopeIdPathFromChatState(
  chatStatePath: string,
): string {
  const layout = resolvePlatformStorageLayout(chatStatePath);
  return path.join(layout.stateDir, PLATFORM_SCOPE_FILE_NAME);
}

export async function readPlatformScopeId(filePath: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const value = parsed.scopeId;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function ensurePlatformScopeId(input: {
  filePath: string;
  now?: () => Date;
  generate?: () => string;
}): Promise<string> {
  const existing = await readPlatformScopeId(input.filePath);
  if (existing) return existing;

  const scopeId = (input.generate ?? randomUUID)();
  const now = (input.now ?? (() => new Date()))();
  const payload: PersistedScopeFile = {
    scopeId,
    createdAt: now.toISOString(),
  };
  const directory = path.dirname(input.filePath);
  await mkdir(directory, { recursive: true });
  const tempPath = `${input.filePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(tempPath, input.filePath);
  return scopeId;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  );
}
