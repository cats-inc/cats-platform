import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { PlatformSurfaceId } from './platform-contract.js';

export interface PlatformPreferences {
  lastProductSurface: PlatformSurfaceId | null;
}

const DEFAULTS: PlatformPreferences = {
  lastProductSurface: null,
};

function resolvePreferencesPath(chatStatePath: string): string {
  return path.join(path.dirname(chatStatePath), 'platform-preferences.json');
}

export async function readPlatformPreferences(
  chatStatePath: string,
): Promise<PlatformPreferences> {
  try {
    const raw = await readFile(resolvePreferencesPath(chatStatePath), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULTS };
    }
    const record = parsed as Record<string, unknown>;
    const surface = record.lastProductSurface;
    return {
      lastProductSurface:
        surface === 'chat' || surface === 'work' || surface === 'code'
          ? surface
          : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writePlatformPreferences(
  chatStatePath: string,
  prefs: PlatformPreferences,
): Promise<void> {
  const filePath = resolvePreferencesPath(chatStatePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(prefs, null, 2) + '\n', 'utf-8');
}
