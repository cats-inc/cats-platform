import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EMPTY_PLATFORM_FEATURE_FLAGS,
  type PlatformFeatureFlags,
} from './platform-contract.js';

/**
 * PLAN-077 host-owned feature flag persistence.
 *
 * The persisted file is a flat JSON object whose keys are flag names and
 * values are booleans. Anything that is not a `boolean` is silently
 * dropped on read so a hand-edited file with stray strings or `null`s
 * cannot corrupt the in-memory map. Unknown flag names are preserved
 * (the registry can grow without rejecting older persisted entries).
 *
 * Read failures (file missing, parse failure, non-object root) fall back
 * to an empty map. Writers always replace the file atomically by
 * staging the JSON to a `.tmp` neighbour and renaming.
 */

export async function readPersistedPlatformFeatureFlags(
  filePath: string,
): Promise<PlatformFeatureFlags> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return EMPTY_PLATFORM_FEATURE_FLAGS;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PLATFORM_FEATURE_FLAGS;
  }
  if (!isPlainObject(parsed)) {
    return EMPTY_PLATFORM_FEATURE_FLAGS;
  }
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return Object.freeze(out);
}

export async function writePersistedPlatformFeatureFlags(
  filePath: string,
  flags: PlatformFeatureFlags,
): Promise<void> {
  const sanitized: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  const serialized = `${JSON.stringify(sanitized, null, 2)}\n`;
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, serialized, 'utf8');
  // Use writeFile-rename to keep readers from observing a half-written file.
  // Node's fs.rename is atomic on the same filesystem on every platform we
  // care about (Win32 falls back to MoveFileExW with REPLACE_EXISTING).
  const { rename } = await import('node:fs/promises');
  await rename(tempPath, filePath);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  );
}
