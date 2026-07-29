import type {
  DesktopUpdateCapability,
  DesktopUpdateError,
  DesktopUpdateErrorCode,
  DesktopUpdateNextAction,
  DesktopUpdateProgress,
  DesktopUpdateSnapshot,
  DesktopUpdateStatus,
} from './contracts.js';
import type {
  DesktopDistributionIdentity,
  DesktopReleasePlatform,
} from './releaseDescriptor.js';
import { resolveDesktopReleasePlatform } from './releaseDescriptor.js';

/**
 * Host-owned update state machine.
 *
 * The renderer and tray are presentation surfaces over this one manager. They
 * request bounded actions and observe snapshots; they never choose a feed, a
 * URL, a file, or installer arguments.
 *
 * The provider is reached through an injected adapter so tests exercise the
 * lifecycle without live GitHub requests.
 */

/**
 * Platforms whose signed old-version-to-new-version upgrade path has passed.
 *
 * PLAN-101 gate G3 admits one platform at a time, and SPEC-111 section 9 keeps
 * Windows and macOS self-update disabled until signing is validated. The list
 * is empty on purpose: no platform has passed yet, so no build advertises
 * self-update even when it carries a valid release descriptor.
 */
export const DESKTOP_RELEASE_READY_PLATFORMS: readonly DesktopReleasePlatform[] = [];

export interface DesktopUpdaterCheckResult {
  updateAvailable: boolean;
  version: string | null;
  releaseSummary: string | null;
}

export interface DesktopUpdaterAdapter {
  checkForUpdates(): Promise<DesktopUpdaterCheckResult>;
  downloadUpdate(
    onProgress: (progress: DesktopUpdateProgress) => void,
  ): Promise<void>;
  quitAndInstall(): Promise<void>;
}

export interface CreateDesktopUpdateCapabilityInput {
  identity: DesktopDistributionIdentity;
  nodePlatform: NodeJS.Platform | string;
  releaseReadyPlatforms?: readonly DesktopReleasePlatform[];
}

export function createDesktopUpdateCapability(
  input: CreateDesktopUpdateCapabilityInput,
): DesktopUpdateCapability {
  const { identity, nodePlatform } = input;
  const releaseReadyPlatforms = input.releaseReadyPlatforms ?? DESKTOP_RELEASE_READY_PLATFORMS;

  const base = {
    distribution: identity.distribution,
    channel: identity.channel,
    currentVersion: identity.currentVersion,
  };

  if (identity.distribution !== 'official_packaged' || identity.provider !== 'github_release') {
    return {
      ...base,
      provider: 'none',
      canCheck: false,
      canDownload: false,
      canInstall: false,
      unavailableReason: identity.unavailableReason,
    };
  }

  const platform = resolveDesktopReleasePlatform(nodePlatform);
  if (platform === null || !releaseReadyPlatforms.includes(platform)) {
    return {
      ...base,
      provider: 'github_release',
      canCheck: false,
      canDownload: false,
      canInstall: false,
      unavailableReason: 'platform_not_release_ready',
    };
  }

  return {
    ...base,
    provider: 'github_release',
    canCheck: true,
    canDownload: true,
    canInstall: true,
    unavailableReason: null,
  };
}

/**
 * The snapshot a build without update capability publishes.
 *
 * Used as the fallback wherever a snapshot is required before the manager
 * exists, so those code paths cannot accidentally imply an update is possible.
 */
export function createUnavailableDesktopUpdateSnapshot(
  currentVersion: string,
): DesktopUpdateSnapshot {
  return {
    capability: {
      distribution: 'unofficial_packaged',
      provider: 'none',
      channel: 'stable',
      currentVersion,
      canCheck: false,
      canDownload: false,
      canInstall: false,
      unavailableReason: 'descriptor_missing',
    },
    status: 'unavailable',
    currentVersion,
    availableVersion: null,
    releaseSummary: null,
    lastCheckedAt: null,
    progress: null,
    error: null,
    nextAction: 'none',
  };
}

export function resolveDesktopUpdateNextAction(
  status: DesktopUpdateStatus,
  capability: DesktopUpdateCapability,
): DesktopUpdateNextAction {
  if (!capability.canCheck) {
    return 'none';
  }

  switch (status) {
    case 'idle':
    case 'up_to_date':
    case 'failed':
      return 'check';
    case 'update_available':
      return capability.canDownload ? 'download' : 'none';
    case 'downloaded':
      return capability.canInstall ? 'restart_install' : 'none';
    default:
      return 'none';
  }
}

const ERROR_SUMMARIES: Record<DesktopUpdateErrorCode, string> = {
  offline: 'Cats could not reach the update service.',
  timeout: 'The update service did not respond in time.',
  provider_rejected: 'The update service rejected the request.',
  metadata_invalid: 'The update information could not be read.',
  checksum_mismatch: 'The downloaded update failed its integrity check.',
  signature_rejected: 'The downloaded update failed its signature check.',
  unsupported_package: 'This installation cannot update itself.',
  download_cancelled: 'The update download was cancelled.',
  install_handoff_failed: 'Cats could not hand off to the installer.',
  unknown: 'The update could not be completed.',
};

const ERROR_CODE_PATTERNS: ReadonlyArray<[DesktopUpdateErrorCode, RegExp]> = [
  ['offline', /enotfound|eai_again|econnrefused|econnreset|enetunreach|offline|dns/iu],
  ['timeout', /etimedout|timed? ?out|esockettimedout/iu],
  ['checksum_mismatch', /sha512|sha256|checksum|integrity/iu],
  ['signature_rejected', /signature|publishername|not signed|authenticode/iu],
  ['download_cancelled', /cancel/iu],
  ['unsupported_package', /unsupported|not supported|no published versions|dev-app-update/iu],
  ['metadata_invalid', /latest\.yml|latest-mac\.yml|metadata|unable to parse|invalid yml/iu],
  ['provider_rejected', /http (4|5)\d\d|status code (4|5)\d\d|forbidden|not found|rate limit/iu],
];

/**
 * Maps a provider error to a stable code plus copy that is safe to render.
 *
 * The returned summary is an English fallback only. Renderer surfaces localize
 * from the code through the shared i18n catalogs, so the raw provider message
 * never reaches the UI.
 */
export function mapDesktopUpdateError(error: unknown): DesktopUpdateError {
  const haystack = [
    typeof error === 'string' ? error : '',
    error instanceof Error ? error.message : '',
    isRecord(error) && typeof error.code === 'string' ? error.code : '',
  ].join(' ');

  for (const [code, pattern] of ERROR_CODE_PATTERNS) {
    if (pattern.test(haystack)) {
      return { code, summary: ERROR_SUMMARIES[code] };
    }
  }

  return { code: 'unknown', summary: ERROR_SUMMARIES.unknown };
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /gh[pousr]_[A-Za-z0-9_]{16,}/gu,
  /github_pat_[A-Za-z0-9_]{20,}/gu,
  /(authorization|token|password|secret)"?\s*[:=]\s*"?[^\s",}]+/giu,
];

export function redactDesktopUpdateDiagnostic(message: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, '[redacted]'),
    message,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface CreateDesktopUpdateManagerInput {
  capability: DesktopUpdateCapability;
  adapter: DesktopUpdaterAdapter | null;
  now?: () => Date;
  logger?: (message: string) => void;
  /**
   * Restored from the host state file. It is the only update fact worth
   * carrying across a restart: a provider-dependent status such as
   * update_available cannot be acted on in a new process without checking
   * again, so restoring it would offer a download the manager cannot perform.
   */
  initialLastCheckedAt?: string | null;
}

export interface DesktopUpdateManager {
  getSnapshot(): DesktopUpdateSnapshot;
  subscribe(listener: (snapshot: DesktopUpdateSnapshot) => void): () => void;
  checkForUpdates(): Promise<DesktopUpdateSnapshot>;
  downloadUpdate(): Promise<DesktopUpdateSnapshot>;
  restartAndInstall(): Promise<DesktopUpdateSnapshot>;
}

export function createDesktopUpdateManager(
  input: CreateDesktopUpdateManagerInput,
): DesktopUpdateManager {
  const { capability, adapter } = input;
  const now = input.now ?? (() => new Date());
  const logger = input.logger ?? (() => {});

  const usable = capability.canCheck && adapter !== null;

  let status: DesktopUpdateStatus = usable ? 'idle' : 'unavailable';
  let availableVersion: string | null = null;
  let releaseSummary: string | null = null;
  let lastCheckedAt: string | null = input.initialLastCheckedAt ?? null;
  let progress: DesktopUpdateProgress | null = null;
  let error: DesktopUpdateError | null = null;

  // SPEC-111 section 2 allows one check or download at a time. Repeated
  // requests join the in-flight operation instead of starting a second
  // provider request.
  let pendingCheck: Promise<DesktopUpdateSnapshot> | null = null;
  let pendingDownload: Promise<DesktopUpdateSnapshot> | null = null;

  const listeners = new Set<(snapshot: DesktopUpdateSnapshot) => void>();

  function snapshot(): DesktopUpdateSnapshot {
    return {
      capability,
      status,
      currentVersion: capability.currentVersion,
      availableVersion,
      releaseSummary,
      lastCheckedAt,
      progress,
      error,
      nextAction: resolveDesktopUpdateNextAction(status, capability),
    };
  }

  function publish(): DesktopUpdateSnapshot {
    const current = snapshot();
    for (const listener of listeners) {
      listener(current);
    }
    return current;
  }

  function log(message: string): void {
    logger(redactDesktopUpdateDiagnostic(message));
  }

  function fail(cause: unknown, stage: string): DesktopUpdateSnapshot {
    error = mapDesktopUpdateError(cause);
    status = 'failed';
    progress = null;
    log(
      `[desktop-update] ${stage} failed (${error.code}): `
        + `${cause instanceof Error ? cause.message : String(cause)}`,
    );
    return publish();
  }

  async function runCheck(activeAdapter: DesktopUpdaterAdapter): Promise<DesktopUpdateSnapshot> {
    status = 'checking';
    error = null;
    publish();

    try {
      const result = await activeAdapter.checkForUpdates();
      lastCheckedAt = now().toISOString();

      if (!result.updateAvailable) {
        status = 'up_to_date';
        availableVersion = null;
        releaseSummary = null;
        return publish();
      }

      if (result.version === null || result.version.trim() === '') {
        throw new Error('Provider reported an available update without a version.');
      }

      status = 'update_available';
      availableVersion = result.version;
      releaseSummary = result.releaseSummary;
      return publish();
    } catch (cause) {
      lastCheckedAt = now().toISOString();
      return fail(cause, 'check');
    }
  }

  async function runDownload(activeAdapter: DesktopUpdaterAdapter): Promise<DesktopUpdateSnapshot> {
    status = 'downloading';
    error = null;
    progress = { percent: 0, transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0 };
    publish();

    try {
      await activeAdapter.downloadUpdate((next) => {
        // A late progress event after a failure must not resurrect the
        // downloading state.
        if (status !== 'downloading') {
          return;
        }
        progress = next;
        publish();
      });
      status = 'downloaded';
      progress = null;
      return publish();
    } catch (cause) {
      return fail(cause, 'download');
    }
  }

  return {
    getSnapshot: snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async checkForUpdates() {
      if (!usable || adapter === null) {
        return snapshot();
      }
      if (pendingDownload !== null) {
        return pendingDownload;
      }
      if (pendingCheck !== null) {
        return pendingCheck;
      }

      pendingCheck = runCheck(adapter).finally(() => {
        pendingCheck = null;
      });
      return pendingCheck;
    },

    async downloadUpdate() {
      if (!usable || adapter === null || !capability.canDownload) {
        return snapshot();
      }
      if (pendingDownload !== null) {
        return pendingDownload;
      }
      if (pendingCheck !== null) {
        return pendingCheck;
      }
      // Automatic download stays disabled: only an explicit request from a
      // surface reaches here, and only from update_available.
      if (status !== 'update_available') {
        return snapshot();
      }

      pendingDownload = runDownload(adapter).finally(() => {
        pendingDownload = null;
      });
      return pendingDownload;
    },

    async restartAndInstall() {
      if (!usable || adapter === null || !capability.canInstall) {
        return snapshot();
      }
      if (status !== 'downloaded') {
        return snapshot();
      }

      status = 'installing';
      error = null;
      publish();

      try {
        await adapter.quitAndInstall();
        return snapshot();
      } catch (cause) {
        log(
          '[desktop-update] install handoff failed: '
            + `${cause instanceof Error ? cause.message : String(cause)}`,
        );
        // The handoff failed before the process exited, so the downloaded
        // update is still installable and the user can retry it.
        status = 'downloaded';
        progress = null;
        error = {
          code: 'install_handoff_failed',
          summary: ERROR_SUMMARIES.install_handoff_failed,
        };
        return publish();
      }
    },
  };
}
