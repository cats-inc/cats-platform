import type { DesktopUpdateChannel, DesktopUpdateState } from './contracts.js';
import { DESKTOP_HOST_VERSION } from './hostVersion.js';
import { parseDesktopBoolean } from './env.js';
import { parseDesktopAllowedHosts, validateDesktopUrl } from './security.js';

export interface DesktopUpdateConfig {
  channel: DesktopUpdateChannel;
  manifestUrl: string | null;
  allowedHosts: string[];
  checkOnStartup: boolean;
  autoDownload: boolean;
}

export interface DesktopUpdateManifest {
  channel?: string;
  version?: string;
  summary?: string;
  downloadUrl?: string;
  sha256?: string;
}

interface NormalizedDesktopUpdateManifest {
  channel: DesktopUpdateChannel | null;
  version: string;
  summary: string | null;
  downloadUrl: string | null;
  sha256: string | null;
}

interface CheckForDesktopUpdatesDependencies {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function normalizeChannel(value: string | undefined): DesktopUpdateChannel {
  if (value === 'alpha' || value === 'beta' || value === 'stable') {
    return value;
  }
  return 'stable';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readOptionalManifestString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`Update manifest field "${fieldName}" must be a string.`);
  }
  return value.trim() || null;
}

function readOptionalManifestSha256(value: unknown): string | null {
  const digest = readOptionalManifestString(value, 'sha256');
  if (digest === null) {
    return null;
  }
  if (!/^[a-f0-9]{64}$/iu.test(digest)) {
    throw new Error('Update manifest field "sha256" must be a 64 character hex digest.');
  }
  return digest.toLowerCase();
}

function parseVersion(value: string): number[] | null {
  const cleaned = value.trim().replace(/^v/u, '').split('-')[0];
  if (!cleaned) {
    return null;
  }
  const parts = cleaned.split('.');
  const numbers = parts.map((part) => Number.parseInt(part, 10));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0)) {
    return null;
  }
  return numbers;
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  if (!leftParts || !rightParts) {
    return left.localeCompare(right);
  }

  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue === rightValue) {
      continue;
    }
    return leftValue < rightValue ? -1 : 1;
  }
  return 0;
}

function normalizeDesktopUpdateManifest(
  payload: unknown,
  expectedChannel: DesktopUpdateChannel,
): NormalizedDesktopUpdateManifest {
  if (!isObjectRecord(payload)) {
    throw new Error('Update manifest must be a JSON object.');
  }

  const channel = readOptionalManifestString(payload.channel, 'channel');
  if (channel !== null && channel !== 'alpha' && channel !== 'beta' && channel !== 'stable') {
    throw new Error(`Update manifest channel is unsupported: ${channel}`);
  }
  if (channel !== null && channel !== expectedChannel) {
    throw new Error(
      `Update manifest channel "${channel}" does not match configured channel "${expectedChannel}".`,
    );
  }

  const version = readOptionalManifestString(payload.version, 'version');
  if (!version) {
    throw new Error('Update manifest is missing required field "version".');
  }
  if (!parseVersion(version)) {
    throw new Error(`Update manifest version is invalid: ${version}`);
  }

  return {
    channel,
    version,
    summary: readOptionalManifestString(payload.summary, 'summary'),
    downloadUrl: readOptionalManifestString(payload.downloadUrl, 'downloadUrl'),
    sha256: readOptionalManifestSha256(payload.sha256),
  };
}

export function createDefaultDesktopUpdateState(
  config: DesktopUpdateConfig,
): DesktopUpdateState {
  return {
    channel: config.channel,
    status: config.manifestUrl ? 'idle' : 'disabled',
    currentVersion: DESKTOP_HOST_VERSION,
    latestVersion: null,
    summary: config.manifestUrl
      ? 'Update checks are idle until the host performs a manifest probe.'
      : 'Update checks are disabled until a manifest URL is configured.',
    lastCheckedAt: null,
    manifestUrl: config.manifestUrl,
    downloadUrl: null,
    sha256: null,
    error: null,
  };
}

export function resolveDesktopUpdateConfig(
  env: NodeJS.ProcessEnv = process.env,
): DesktopUpdateConfig {
  const manifestUrl = env.CATS_DESKTOP_UPDATE_MANIFEST_URL?.trim() || null;
  return {
    channel: normalizeChannel(env.CATS_DESKTOP_UPDATE_CHANNEL),
    manifestUrl: manifestUrl ? validateDesktopUrl(manifestUrl, { httpsOnly: true }) : null,
    allowedHosts: parseDesktopAllowedHosts(env.CATS_DESKTOP_UPDATE_ALLOWED_HOSTS),
    checkOnStartup: parseDesktopBoolean(env.CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP, false),
    autoDownload: parseDesktopBoolean(env.CATS_DESKTOP_UPDATE_AUTO_DOWNLOAD, false),
  };
}

export async function checkForDesktopUpdates(
  config: DesktopUpdateConfig,
  dependencies: CheckForDesktopUpdatesDependencies = {},
): Promise<DesktopUpdateState> {
  const now = dependencies.now?.() ?? new Date();

  if (!config.manifestUrl) {
    return createDefaultDesktopUpdateState(config);
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  try {
    const validatedManifestUrl = validateDesktopUrl(config.manifestUrl, { httpsOnly: true });
    const manifestUrl = new URL(validatedManifestUrl);
    const response = await fetchImpl(validatedManifestUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const manifest = normalizeDesktopUpdateManifest(await response.json(), config.channel);
    const latestVersion = manifest.version;
    const hasUpdate = compareVersions(DESKTOP_HOST_VERSION, latestVersion) < 0;
    const status = hasUpdate ? 'update_available' : 'up_to_date';
    if (hasUpdate && !manifest.downloadUrl) {
      throw new Error('Update manifest is missing required field "downloadUrl" for a newer version.');
    }
    if (manifest.downloadUrl && !manifest.sha256) {
      throw new Error('Update manifest is missing required field "sha256" for a download artifact.');
    }

    const downloadUrl = manifest.downloadUrl
      ? validateDesktopUrl(manifest.downloadUrl, {
        httpsOnly: true,
        allowedHosts: [manifestUrl.hostname, ...config.allowedHosts],
      })
      : null;

    return {
      channel: config.channel,
      status,
      currentVersion: DESKTOP_HOST_VERSION,
      latestVersion,
      summary: manifest.summary?.trim()
        || (hasUpdate
          ? `Update ${latestVersion} is available on the ${config.channel} channel.`
          : `Cats desktop host is up to date on the ${config.channel} channel.`),
      lastCheckedAt: now.toISOString(),
      manifestUrl: validatedManifestUrl,
      downloadUrl,
      sha256: downloadUrl ? manifest.sha256 : null,
      error: null,
    };
  } catch (error) {
    return {
      channel: config.channel,
      status: 'failed',
      currentVersion: DESKTOP_HOST_VERSION,
      latestVersion: null,
      summary: 'The desktop host could not refresh its update manifest.',
      lastCheckedAt: now.toISOString(),
      manifestUrl: config.manifestUrl,
      downloadUrl: null,
      sha256: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
