import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  chmod,
  copyFile,
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

import {
  resolveDefaultPlatformDir,
  resolvePlatformConfigDir,
} from '../../shared/platformPaths.js';

const AUTH_SESSION_SECRET_ENV_KEY = 'CATS_AUTH_SESSION_SECRET';
const AUTH_SESSION_SECRET_FILE_NAME = 'auth-session-secret.local';
const AUTH_SESSION_SECRET_BYTES = 32;
const MIN_PERSISTED_SECRET_LENGTH = 32;
const STALE_TEMP_SECRET_MAX_AGE_MS = 60 * 60 * 1_000;
const INVALID_SECRET_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const FALLBACK_PUBLISH_RETRY_MS = 25;
const FALLBACK_PUBLISH_TIMEOUT_MS = 10_000;

export interface PlatformAuthSessionSecretProvisioningConfig {
  platformConfigDir: string;
}

export interface PlatformAuthSessionSecretResult {
  secret: string;
  source: 'environment' | 'persisted' | 'generated';
  secretPath: string | null;
}

export interface PlatformAuthSessionSecretDependencies {
  generateSecret?: () => string;
  now?: () => Date;
  info?: (message: string) => void | Promise<void>;
  warn?: (message: string) => void | Promise<void>;
  /**
   * Test seam for filesystems that cannot hard link. Production callers use
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

export function resolvePlatformAuthSessionSecretConfigDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const homeDir = env.HOME?.trim() || env.USERPROFILE?.trim() || undefined;
  const platformDir = env.CATS_PLATFORM_DIR?.trim()
    || resolveDefaultPlatformDir(homeDir);
  return resolvePlatformConfigDir(platformDir);
}

export function resolvePlatformAuthSessionSecretPath(
  config: PlatformAuthSessionSecretProvisioningConfig,
): string {
  return join(config.platformConfigDir, AUTH_SESSION_SECRET_FILE_NAME);
}

export async function ensurePlatformAuthSessionSecret(
  config: PlatformAuthSessionSecretProvisioningConfig,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: PlatformAuthSessionSecretDependencies = {},
): Promise<PlatformAuthSessionSecretResult> {
  const configuredSecret = env[AUTH_SESSION_SECRET_ENV_KEY]?.trim();
  if (configuredSecret) {
    await cleanupStaleSecretArtifacts(config, dependencies);
    if (!isValidPersistedSecret(configuredSecret)) {
      await reportWarning(
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

  const secretPath = resolvePlatformAuthSessionSecretPath(config);
  await mkdir(config.platformConfigDir, { recursive: true, mode: 0o700 });
  await cleanupStaleSecretArtifacts(config, dependencies);
  let persistedSecret = await readPersistedSecret(secretPath);
  if (
    persistedSecret.status === 'invalid'
    && await hasTemporarySecretArtifact(config.platformConfigDir)
  ) {
    // The exclusive-copy fallback exposes its destination while a tiny copy is
    // in progress. A later process must adopt it instead of quarantining it.
    const concurrentWinner = await waitForConcurrentWinner(secretPath);
    persistedSecret = {
      status: 'valid',
      secret: concurrentWinner.secret,
    };
  }
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
      dependencies,
      `Invalid platform auth session secret was moved to '${quarantinedPath}'; `
        + 'generating a replacement.',
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
  if (published.created) {
    await reportInfo(
      dependencies,
      `Generated a local auth session secret at '${secretPath}'. `
        + 'Set CATS_AUTH_SESSION_SECRET explicitly for clustered or ephemeral deployments.',
    );
  }
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
    throw new Error(`Platform auth session secret is invalid at '${secretPath}'.`);
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
  config: PlatformAuthSessionSecretProvisioningConfig,
  dependencies: PlatformAuthSessionSecretDependencies,
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
      // replacing a value another process may have won concurrently.
      await (dependencies.linkFile ?? link)(temporaryPath, secretPath);
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST')) {
        return await readConcurrentWinner(secretPath);
      }
      if (!isHardLinkUnsupported(error)) {
        throw error;
      }

      await reportWarning(
        dependencies,
        `Hard links are unavailable for '${secretPath}' (${formatError(error)}); `
          + 'publishing with an exclusive-copy fallback.',
      );
      return await publishSecretWithExclusiveCopyFallback(
        secretPath,
        temporaryPath,
        secret,
      );
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

async function publishSecretWithExclusiveCopyFallback(
  secretPath: string,
  temporaryPath: string,
  secret: string,
): Promise<SecretPublishResult> {
  try {
    await copyFile(temporaryPath, secretPath, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    if (hasErrorCode(error, 'EEXIST')) {
      return await waitForConcurrentWinner(secretPath);
    }
    throw error;
  }
  const canonicalHandle = await open(secretPath, 'r+');
  try {
    await canonicalHandle.sync();
  } finally {
    await canonicalHandle.close();
  }
  const persisted = await requireValidPersistedSecret(secretPath);
  return {
    created: persisted === secret,
    secret: persisted,
  };
}

async function waitForConcurrentWinner(secretPath: string): Promise<SecretPublishResult> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < FALLBACK_PUBLISH_TIMEOUT_MS) {
    const persisted = await readPersistedSecret(secretPath);
    if (persisted.status === 'valid') {
      return {
        created: false,
        secret: persisted.secret,
      };
    }
    await waitFor(FALLBACK_PUBLISH_RETRY_MS);
  }
  throw new Error(`Timed out waiting for platform auth session secret at '${secretPath}'.`);
}

async function waitFor(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
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
    throw new Error(`Platform auth session secret was not readable at '${secretPath}'.`);
  }
  return persisted.secret;
}

async function cleanupStaleSecretArtifacts(
  config: PlatformAuthSessionSecretProvisioningConfig,
  dependencies: PlatformAuthSessionSecretDependencies,
): Promise<void> {
  const nowMs = (dependencies.now?.() ?? new Date()).getTime();
  let entries: string[];
  try {
    entries = await readdir(config.platformConfigDir);
  } catch (error) {
    if (!hasErrorCode(error, 'ENOENT')) {
      await reportWarning(
        dependencies,
        `Could not scan stale platform auth secret artifacts: ${formatError(error)}`,
      );
    }
    return;
  }

  for (const entry of entries) {
    const maxAgeMs = resolveArtifactMaxAgeMs(entry);
    if (maxAgeMs === null) {
      continue;
    }
    const artifactPath = join(config.platformConfigDir, entry);
    try {
      const artifact = await lstat(artifactPath);
      if (!artifact.isFile() || nowMs - artifact.mtimeMs < maxAgeMs) {
        continue;
      }
      await rm(artifactPath, { force: true });
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) {
        await reportWarning(
          dependencies,
          `Could not remove stale platform auth secret artifact '${artifactPath}': `
            + formatError(error),
        );
      }
    }
  }
}

async function hasTemporarySecretArtifact(platformConfigDir: string): Promise<boolean> {
  try {
    const entries = await readdir(platformConfigDir);
    return entries.some((entry) => (
      entry.startsWith(`${AUTH_SESSION_SECRET_FILE_NAME}.tmp-`)
    ));
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return false;
    }
    throw error;
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

async function reportInfo(
  dependencies: PlatformAuthSessionSecretDependencies,
  message: string,
): Promise<void> {
  if (dependencies.info) {
    await dependencies.info(message);
    return;
  }
  process.stderr.write(`[cats-platform-auth] ${message}\n`);
}

async function reportWarning(
  dependencies: PlatformAuthSessionSecretDependencies,
  message: string,
): Promise<void> {
  if (dependencies.warn) {
    await dependencies.warn(message);
    return;
  }
  process.stderr.write(`[cats-platform-auth] ${message}\n`);
}

function isHardLinkUnsupported(error: unknown): boolean {
  return ['ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].some((code) => hasErrorCode(error, code));
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
