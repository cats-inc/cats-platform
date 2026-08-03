import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DesktopHostConfig } from './config.js';

const AUTH_SESSION_SECRET_ENV_KEY = 'CATS_AUTH_SESSION_SECRET';
const AUTH_SESSION_SECRET_FILE_NAME = 'auth-session-secret.local';
const AUTH_SESSION_SECRET_BYTES = 32;
const MIN_PERSISTED_SECRET_LENGTH = 32;

export interface DesktopAuthSessionSecretResult {
  secret: string;
  source: 'environment' | 'persisted' | 'generated';
  secretPath: string | null;
}

interface DesktopAuthSessionSecretDependencies {
  generateSecret?: () => string;
}

export function resolveDesktopAuthSessionSecretPath(config: DesktopHostConfig): string {
  return join(config.paths.platformConfigDir, AUTH_SESSION_SECRET_FILE_NAME);
}

export async function ensureDesktopAuthSessionSecret(
  config: DesktopHostConfig,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: DesktopAuthSessionSecretDependencies = {},
): Promise<DesktopAuthSessionSecretResult> {
  const configuredSecret = env[AUTH_SESSION_SECRET_ENV_KEY]?.trim();
  if (configuredSecret) {
    return {
      secret: configuredSecret,
      source: 'environment',
      secretPath: null,
    };
  }

  const secretPath = resolveDesktopAuthSessionSecretPath(config);
  const persistedSecret = await readPersistedSecretIfPresent(secretPath);
  if (persistedSecret) {
    await restrictSecretFilePermissions(secretPath);
    return {
      secret: persistedSecret,
      source: 'persisted',
      secretPath,
    };
  }

  const generatedSecret = dependencies.generateSecret?.()
    ?? randomBytes(AUTH_SESSION_SECRET_BYTES).toString('base64url');
  validatePersistedSecret(generatedSecret, secretPath);
  await mkdir(config.paths.platformConfigDir, { recursive: true, mode: 0o700 });

  try {
    await writeFile(secretPath, `${generatedSecret}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await restrictSecretFilePermissions(secretPath);
    return {
      secret: generatedSecret,
      source: 'generated',
      secretPath,
    };
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) {
      throw error;
    }
  }

  const racedSecret = await readPersistedSecretIfPresent(secretPath);
  if (!racedSecret) {
    throw new Error(`Desktop auth session secret was not readable at '${secretPath}'.`);
  }
  await restrictSecretFilePermissions(secretPath);
  return {
    secret: racedSecret,
    source: 'persisted',
    secretPath,
  };
}

async function readPersistedSecretIfPresent(secretPath: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(secretPath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }

  const secret = raw.trim();
  validatePersistedSecret(secret, secretPath);
  return secret;
}

function validatePersistedSecret(secret: string, secretPath: string): void {
  if (secret.length < MIN_PERSISTED_SECRET_LENGTH || /\s/u.test(secret)) {
    throw new Error(`Desktop auth session secret is invalid at '${secretPath}'.`);
  }
}

async function restrictSecretFilePermissions(secretPath: string): Promise<void> {
  try {
    await chmod(secretPath, 0o600);
  } catch {
    // Windows and some filesystems do not support POSIX mode updates.
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === code,
  );
}
