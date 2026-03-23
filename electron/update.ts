import type { DesktopUpdateChannel, DesktopUpdateState } from './contracts.js';
import { DESKTOP_HOST_VERSION } from './contracts.js';

export interface DesktopUpdateConfig {
  channel: DesktopUpdateChannel;
  manifestUrl: string | null;
  checkOnStartup: boolean;
  autoDownload: boolean;
}

export interface DesktopUpdateManifest {
  channel?: string;
  version?: string;
  summary?: string;
  downloadUrl?: string;
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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes') {
    return true;
  }
  if (trimmed === '0' || trimmed === 'false' || trimmed === 'no') {
    return false;
  }
  return fallback;
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
    error: null,
  };
}

export function resolveDesktopUpdateConfig(
  env: NodeJS.ProcessEnv = process.env,
): DesktopUpdateConfig {
  return {
    channel: normalizeChannel(env.CATS_DESKTOP_UPDATE_CHANNEL),
    manifestUrl: env.CATS_DESKTOP_UPDATE_MANIFEST_URL?.trim() || null,
    checkOnStartup: parseBoolean(env.CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP, false),
    autoDownload: parseBoolean(env.CATS_DESKTOP_UPDATE_AUTO_DOWNLOAD, false),
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
    const response = await fetchImpl(config.manifestUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const manifest = await response.json() as DesktopUpdateManifest;
    const latestVersion = manifest.version?.trim() || null;
    const hasUpdate = latestVersion !== null
      && compareVersions(DESKTOP_HOST_VERSION, latestVersion) < 0;
    const status = hasUpdate ? 'update_available' : 'up_to_date';

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
      manifestUrl: config.manifestUrl,
      downloadUrl: manifest.downloadUrl?.trim() || null,
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
