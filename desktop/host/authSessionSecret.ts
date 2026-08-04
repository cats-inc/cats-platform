import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
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
  warn?: (message: string) => void;
}

type PersistedSecretReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; secret: string };

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
    if (!isValidPersistedSecret(configuredSecret)) {
      reportWarning(
        dependencies,
        'CATS_AUTH_SESSION_SECRET is shorter than 32 characters or contains whitespace; '
          + 'use a 256-bit random value for production auth sessions.',
      );
    }
    return {
      secret: configuredSecret,
      source: 'environment',
      secretPath: null,
    };
  }

  const secretPath = resolveDesktopAuthSessionSecretPath(config);
  const persistedSecret = await readPersistedSecret(secretPath);
  if (persistedSecret.status === 'valid') {
    await restrictSecretFilePermissions(secretPath);
    return {
      secret: persistedSecret.secret,
      source: 'persisted',
      secretPath,
    };
  }
  if (persistedSecret.status === 'invalid') {
    const quarantinedPath = await quarantineInvalidSecret(secretPath);
    reportWarning(
      dependencies,
      `Invalid Desktop auth session secret was moved to '${quarantinedPath}'; generating a replacement.`,
    );
  }

  const generatedSecret = dependencies.generateSecret?.()
    ?? randomBytes(AUTH_SESSION_SECRET_BYTES).toString('base64url');
  assertValidGeneratedSecret(generatedSecret, secretPath);
  await mkdir(config.paths.platformConfigDir, { recursive: true, mode: 0o700 });
  await writeSecretAtomically(secretPath, generatedSecret);
  await restrictSecretFilePermissions(secretPath);
  return {
    secret: generatedSecret,
    source: 'generated',
    secretPath,
  };
}

async function readPersistedSecret(secretPath: string): Promise<PersistedSecretReadResult> {
  let raw: string;
  try {
    raw = await readFile(secretPath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return { status: 'missing' };
    }
    throw error;
  }

  const secret = raw.trim();
  return isValidPersistedSecret(secret)
    ? { status: 'valid', secret }
    : { status: 'invalid' };
}

function assertValidGeneratedSecret(secret: string, secretPath: string): void {
  if (!isValidPersistedSecret(secret)) {
    throw new Error(`Desktop auth session secret is invalid at '${secretPath}'.`);
  }
}

function isValidPersistedSecret(secret: string): boolean {
  return secret.length >= MIN_PERSISTED_SECRET_LENGTH && !/\s/u.test(secret);
}

async function quarantineInvalidSecret(secretPath: string): Promise<string> {
  const quarantinedPath = `${secretPath}.invalid-${randomBytes(6).toString('hex')}`;
  await rename(secretPath, quarantinedPath);
  await restrictSecretFilePermissions(quarantinedPath);
  return quarantinedPath;
}

async function writeSecretAtomically(secretPath: string, secret: string): Promise<void> {
  const temporaryPath = `${secretPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  let temporaryCreated = false;
  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    temporaryCreated = true;
    try {
      await handle.writeFile(`${secret}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, secretPath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

function reportWarning(
  dependencies: DesktopAuthSessionSecretDependencies,
  message: string,
): void {
  if (dependencies.warn) {
    dependencies.warn(message);
    return;
  }
  process.stderr.write(`[desktop-auth] ${message}\n`);
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
