import { randomBytes } from 'node:crypto';
import {
  appendFile,
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { join } from 'node:path';

import type { DesktopHostConfig } from './config.js';

const AUTH_SESSION_SECRET_ENV_KEY = 'CATS_AUTH_SESSION_SECRET';
const AUTH_SESSION_SECRET_FILE_NAME = 'auth-session-secret.local';
const AUTH_SESSION_SECRET_BYTES = 32;
const MIN_PERSISTED_SECRET_LENGTH = 32;
const DESKTOP_HOST_LOG_FILE_NAME = 'desktop-host.log';
const STALE_TEMP_SECRET_MAX_AGE_MS = 60 * 60 * 1_000;
const INVALID_SECRET_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

export interface DesktopAuthSessionSecretResult {
  secret: string;
  source: 'environment' | 'persisted' | 'generated';
  secretPath: string | null;
}

interface DesktopAuthSessionSecretDependencies {
  generateSecret?: () => string;
  now?: () => Date;
  warn?: (message: string) => void | Promise<void>;
  /**
   * Test seam for the filesystems that cannot hard link. Production callers use
   * `node:fs/promises` `link`.
   */
  linkFile?: (existingPath: string, newPath: string) => Promise<void>;
}

type PersistedSecretReadResult =
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'valid'; secret: string };

interface SecretPublishResult {
  created: boolean;
  secret: string;
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
    await cleanupStaleSecretArtifacts(config, dependencies);
    if (!isValidPersistedSecret(configuredSecret)) {
      await reportWarning(
        config,
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
  await mkdir(config.paths.platformConfigDir, { recursive: true, mode: 0o700 });
  await cleanupStaleSecretArtifacts(config, dependencies);
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
    await reportWarning(
      config,
      dependencies,
      `Invalid Desktop auth session secret was moved to '${quarantinedPath}'; generating a replacement.`,
    );
  }

  const generatedSecret = dependencies.generateSecret?.()
    ?? randomBytes(AUTH_SESSION_SECRET_BYTES).toString('base64url');
  assertValidGeneratedSecret(generatedSecret, secretPath);
  const published = await writeSecretAtomically(
    config,
    dependencies,
    secretPath,
    generatedSecret,
  );
  await restrictSecretFilePermissions(secretPath);
  return {
    secret: published.secret,
    source: published.created ? 'generated' : 'persisted',
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

async function writeSecretAtomically(
  config: DesktopHostConfig,
  dependencies: DesktopAuthSessionSecretDependencies,
  secretPath: string,
  secret: string,
): Promise<SecretPublishResult> {
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

    try {
      // A same-directory hard link publishes the fully flushed file without
      // replacing a value another Desktop host may have won concurrently.
      await (dependencies.linkFile ?? link)(temporaryPath, secretPath);
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST')) {
        return await readConcurrentWinner(secretPath);
      }
      if (!isHardLinkUnsupported(error)) {
        throw error;
      }

      // Hard links can be unavailable on some removable/network filesystems.
      // Atomic replacement still publishes a fully flushed file there, but
      // rename always replaces, so this path cannot detect a concurrent winner.
      // Say so: a silently downgraded guarantee is the kind of thing nobody can
      // reconstruct from the symptoms later.
      await reportWarning(
        config,
        dependencies,
        `Hard links are unavailable for '${secretPath}' (${formatError(error)}); `
          + 'publishing by replacement instead, which cannot detect a concurrent Desktop host.',
      );
      await rename(temporaryPath, secretPath);
      temporaryCreated = false;
      // Re-read anyway so the caller adopts whatever actually landed on disk.
      const persisted = await requireValidPersistedSecret(secretPath);
      return {
        created: persisted === secret,
        secret: persisted,
      };
    }

    const persisted = await requireValidPersistedSecret(secretPath);
    return {
      created: persisted === secret,
      secret: persisted,
    };
  } finally {
    if (temporaryCreated) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

async function readConcurrentWinner(secretPath: string): Promise<SecretPublishResult> {
  return {
    created: false,
    secret: await requireValidPersistedSecret(secretPath),
  };
}

async function requireValidPersistedSecret(secretPath: string): Promise<string> {
  const persisted = await readPersistedSecret(secretPath);
  if (persisted.status !== 'valid') {
    throw new Error(`Desktop auth session secret was not readable at '${secretPath}'.`);
  }
  return persisted.secret;
}

async function cleanupStaleSecretArtifacts(
  config: DesktopHostConfig,
  dependencies: DesktopAuthSessionSecretDependencies,
): Promise<void> {
  const nowMs = (dependencies.now?.() ?? new Date()).getTime();
  let entries: string[];
  try {
    entries = await readdir(config.paths.platformConfigDir);
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) {
      await reportWarning(
        config,
        dependencies,
        `Could not scan stale Desktop auth secret artifacts: ${formatError(error)}`,
      );
    }
    return;
  }

  for (const entry of entries) {
    const maxAgeMs = resolveArtifactMaxAgeMs(entry);
    if (maxAgeMs === null) {
      continue;
    }
    const artifactPath = join(config.paths.platformConfigDir, entry);
    try {
      const artifact = await lstat(artifactPath);
      if (!artifact.isFile() || nowMs - artifact.mtimeMs < maxAgeMs) {
        continue;
      }
      await rm(artifactPath, { force: true });
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) {
        await reportWarning(
          config,
          dependencies,
          `Could not remove stale Desktop auth secret artifact '${artifactPath}': ${formatError(error)}`,
        );
      }
    }
  }
}

function resolveArtifactMaxAgeMs(fileName: string): number | null {
  if (fileName.startsWith(`${AUTH_SESSION_SECRET_FILE_NAME}.tmp-`)) {
    return STALE_TEMP_SECRET_MAX_AGE_MS;
  }
  if (fileName.startsWith(`${AUTH_SESSION_SECRET_FILE_NAME}.invalid-`)) {
    return INVALID_SECRET_MAX_AGE_MS;
  }
  return null;
}

async function reportWarning(
  config: DesktopHostConfig,
  dependencies: DesktopAuthSessionSecretDependencies,
  message: string,
): Promise<void> {
  if (dependencies.warn) {
    await dependencies.warn(message);
    return;
  }
  const line = `[desktop-auth] ${message}\n`;
  process.stderr.write(line);
  try {
    await mkdir(config.paths.hostLogsDir, { recursive: true });
    await appendFile(join(config.paths.hostLogsDir, DESKTOP_HOST_LOG_FILE_NAME), line, 'utf8');
  } catch (error) {
    process.stderr.write(
      `[desktop-auth] Could not persist warning to the Desktop host log: ${formatError(error)}\n`,
    );
  }
}

function isHardLinkUnsupported(error: unknown): boolean {
  return ['ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM'].some((code) => hasErrorCode(error, code));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
