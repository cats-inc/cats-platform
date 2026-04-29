import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { DesktopHostConfig } from './config.js';

const MOBILE_PAIRING_ENV_VALUES = {
  CATS_DESKTOP_MOBILE_PAIRING_ENABLED: 'true',
  CATS_DESKTOP_APP_HOST: '0.0.0.0',
} as const;

export interface DesktopMobilePairingEnvUpdateResult {
  envPath: string;
  restartRequired: true;
  values: typeof MOBILE_PAIRING_ENV_VALUES;
}

function replaceDesktopEnvValues(
  raw: string,
  values: Record<string, string>,
): string {
  const lines = raw.length > 0
    ? raw.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').split('\n')
    : [];
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^\\s*${key}\\s*=`, 'u');
    let found = false;
    for (let index = 0; index < lines.length; index += 1) {
      if (!pattern.test(lines[index] ?? '')) {
        continue;
      }
      lines[index] = `${key}=${value}`;
      found = true;
    }
    if (!found) {
      lines.push(`${key}=${value}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function enableDesktopMobilePairingEnv(
  config: DesktopHostConfig,
): Promise<DesktopMobilePairingEnvUpdateResult> {
  const desktopDir = dirname(config.paths.hostStatePath);
  const envPath = join(desktopDir, '.env');
  await mkdir(desktopDir, { recursive: true });

  let raw = '';
  try {
    raw = await readFile(envPath, 'utf8');
  } catch {
    raw = '';
  }

  await writeFile(
    envPath,
    replaceDesktopEnvValues(raw, MOBILE_PAIRING_ENV_VALUES),
    'utf8',
  );

  return {
    envPath,
    restartRequired: true,
    values: MOBILE_PAIRING_ENV_VALUES,
  };
}
