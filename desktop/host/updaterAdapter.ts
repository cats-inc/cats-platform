import type {
  DesktopDistributionMode,
  DesktopUpdateChannel,
  DesktopUpdateProgress,
} from './contracts.js';
import { DesktopInstallHandoffTimeoutError } from './updateInstallHandoff.js';
import type { DesktopUpdaterAdapter, DesktopUpdaterCheckResult } from './updateManager.js';

/**
 * Translation layer between `electron-updater` and the host-owned update
 * manager.
 *
 * This module deliberately does not import `electron-updater` or `electron`.
 * The caller passes the updater in, which keeps the translation testable in a
 * plain node process and matches how the rest of desktop/host isolates
 * electron-only code.
 */

export interface ElectronUpdaterProgressInfo {
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}

export interface ElectronUpdaterInfo {
  version?: string;
  releaseName?: string | null;
  releaseNotes?: string | null;
}

export interface ElectronUpdaterFeedOptions {
  provider: 'github';
  owner: string;
  repo: string;
}

export interface ElectronAutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  autoRunAppAfterInstall: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  channel: string | null;
  setFeedURL(options: ElectronUpdaterFeedOptions): void;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
}

/**
 * Observable lifecycle slice used by the installer handoff.
 *
 * `electron-updater` exposes `quitAndInstall` as a void method. A successful
 * call is therefore not proof that the app is quitting; Linux package-manager
 * failures and macOS native-updater failures are reported later through the
 * updater's `error` event, while a stalled native handoff may report nothing.
 * The host supplies the definitive app-quit signal and watchdog scheduler so
 * the adapter stays deterministic in tests and does not import `electron` into
 * this otherwise plain-Node-safe module.
 */
export interface ElectronInstallHandoffObserver {
  onQuit(listener: () => void): () => void;
  onTimeout(listener: () => void): () => void;
}

/**
 * Compile-time proof that the real updater satisfies the narrow shape above.
 * The import is type-only, so nothing pulls `electron-updater` (and therefore
 * `electron`) into a plain node test process.
 */
type ElectronUpdaterShapeIsSatisfied =
  import('electron-updater').AppUpdater extends ElectronAutoUpdaterLike ? true : never;
const AUTO_UPDATER_SHAPE_CHECK: ElectronUpdaterShapeIsSatisfied = true;
void AUTO_UPDATER_SHAPE_CHECK;

/**
 * Pulls `autoUpdater` out of the imported `electron-updater` namespace.
 *
 * electron-updater is CommonJS and exposes `autoUpdater` through an
 * `Object.defineProperty` getter. Node's CJS named-export detection cannot see
 * getters, so `import { autoUpdater }` is undefined and the value is only
 * reachable through the default export. Both shapes are accepted because the
 * detection result is a Node implementation detail, not a stable contract.
 */
export function resolveAutoUpdaterExport(moduleNamespace: unknown): ElectronAutoUpdaterLike {
  const namespace = moduleNamespace as {
    autoUpdater?: unknown;
    default?: { autoUpdater?: unknown };
  } | null;

  const candidate = namespace?.autoUpdater ?? namespace?.default?.autoUpdater;

  if (candidate === null || typeof candidate !== 'object') {
    throw new Error(
      'electron-updater did not expose an autoUpdater instance through either '
        + 'the named or the default export.',
    );
  }

  return candidate as ElectronAutoUpdaterLike;
}

export function resolveGithubFeedOptions(repository: string): ElectronUpdaterFeedOptions {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(`Update repository is not in owner/name form: ${repository}`);
  }
  return { provider: 'github', owner, repo };
}

/**
 * electron-updater names the stable feed `latest`, which is also the name of
 * the metadata file it publishes beside the installers.
 */
export function resolveElectronUpdaterChannel(channel: DesktopUpdateChannel): string {
  return channel === 'stable' ? 'latest' : channel;
}

export function toDesktopUpdateProgress(raw: ElectronUpdaterProgressInfo): DesktopUpdateProgress {
  const total = numberOrZero(raw.total);
  const transferred = numberOrZero(raw.transferred);
  const percent = raw.percent === undefined
    ? (total > 0 ? (transferred / total) * 100 : 0)
    : numberOrZero(raw.percent);

  return {
    percent: clampPercent(percent),
    transferredBytes: Math.max(0, Math.trunc(transferred)),
    totalBytes: Math.max(0, Math.trunc(total)),
    bytesPerSecond: Math.max(0, Math.trunc(numberOrZero(raw.bytesPerSecond))),
  };
}

export function toDesktopUpdaterCheckResult(
  updateAvailable: boolean,
  info: ElectronUpdaterInfo | null,
): DesktopUpdaterCheckResult {
  if (!updateAvailable) {
    return { updateAvailable: false, version: null, releaseSummary: null };
  }

  const version = typeof info?.version === 'string' && info.version.trim() !== ''
    ? info.version.trim()
    : null;

  return {
    updateAvailable: true,
    version,
    releaseSummary: resolveReleaseSummary(info),
  };
}

/**
 * Release notes are external, untrusted text. Only a bounded plain-text
 * summary crosses the bridge; HTML notes are dropped rather than sanitized
 * here, because the renderer has no safe rendering path for them yet.
 */
export function resolveReleaseSummary(info: ElectronUpdaterInfo | null): string | null {
  const name = typeof info?.releaseName === 'string' ? info.releaseName.trim() : '';
  if (name !== '') {
    return boundSummary(name);
  }

  const notes = typeof info?.releaseNotes === 'string' ? info.releaseNotes.trim() : '';
  if (notes === '' || /<[a-z][\s\S]*>/iu.test(notes)) {
    return null;
  }
  return boundSummary(notes);
}

const RELEASE_SUMMARY_MAX_LENGTH = 500;

function boundSummary(value: string): string {
  return value.length <= RELEASE_SUMMARY_MAX_LENGTH
    ? value
    : `${value.slice(0, RELEASE_SUMMARY_MAX_LENGTH - 1)}…`;
}

function numberOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value > 100 ? 100 : Math.round(value * 100) / 100;
}

export interface ConfigureElectronUpdaterInput {
  repository: string;
  channel: DesktopUpdateChannel;
  distribution: DesktopDistributionMode;
}

export function configureElectronUpdater(
  autoUpdater: ElectronAutoUpdaterLike,
  input: ConfigureElectronUpdaterInput,
): void {
  // SPEC-111 section 6: nothing downloads or installs without an explicit
  // user action. autoInstallOnAppQuit defaults to true in electron-updater, so
  // it has to be turned off or a normal quit would install silently.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // Coming back up after an install is part of the contract, so it is pinned
  // here rather than inherited. quitAndInstall's isForceRunAfter argument
  // cannot express it: BaseUpdater reads that argument only in silent mode and
  // substitutes autoRunAppAfterInstall otherwise, and this host installs
  // non-silently so the user can see the platform installer. The upstream
  // default happens to be true today; relying on that would make the app
  // silently stop relaunching if it ever changed.
  autoUpdater.autoRunAppAfterInstall = true;

  // A preview ships as a GitHub prerelease that never becomes `latest`, and with
  // allowPrerelease off the provider resolves updates through /releases/latest,
  // which excludes prereleases -- so a preview could never find its successor.
  //
  // Leaving the channel unset matters just as much: with a channel set, the
  // provider only accepts a release whose tag carries that channel as a semver
  // prerelease component, and these tags are plain versions. Unset, it takes the
  // newest entry from the releases feed, which is the preview we just published.
  // The metadata file is unchanged either way -- electron-updater defaults to
  // `latest.yml`, which is what the workflow uploads.
  const preview = input.distribution === 'preview_packaged';
  autoUpdater.allowPrerelease = preview;
  autoUpdater.channel = preview ? null : resolveElectronUpdaterChannel(input.channel);
  autoUpdater.setFeedURL(resolveGithubFeedOptions(input.repository));
  // Order matters. electron-updater's channel setter assigns
  // allowDowngrade = true as a side effect and its own documentation says to
  // set the flag again afterwards. Downgrade is a SPEC-111 non-goal, so this
  // assignment has to come last.
  autoUpdater.allowDowngrade = false;
}

interface OneShotOutcome<T> {
  resolveWith: (value: T) => void;
  rejectWith: (error: unknown) => void;
}

/**
 * electron-updater reports outcomes through events rather than the promise
 * returned by checkForUpdates/downloadUpdate, so each operation waits for the
 * first terminal event and always detaches its listeners afterwards.
 */
function waitForTerminalEvent<T>(
  autoUpdater: ElectronAutoUpdaterLike,
  handlers: Record<string, (outcome: OneShotOutcome<T>, payload: never) => void>,
  start: () => Promise<unknown>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const attached: Array<[string, (...args: never[]) => void]> = [];
    let settled = false;

    const detach = (): void => {
      for (const [event, listener] of attached) {
        autoUpdater.removeListener(event, listener);
      }
      attached.length = 0;
    };

    const outcome: OneShotOutcome<T> = {
      resolveWith(value) {
        if (settled) {
          return;
        }
        settled = true;
        detach();
        resolve(value);
      },
      rejectWith(error) {
        if (settled) {
          return;
        }
        settled = true;
        detach();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      const listener = (payload: never): void => {
        handler(outcome, payload);
      };
      autoUpdater.on(event, listener);
      attached.push([event, listener]);
    }

    start().catch((error: unknown) => {
      outcome.rejectWith(error);
    });
  });
}

export function createElectronUpdaterAdapter(
  autoUpdater: ElectronAutoUpdaterLike,
  installHandoffObserver: ElectronInstallHandoffObserver,
): DesktopUpdaterAdapter {
  return {
    async checkForUpdates() {
      return waitForTerminalEvent<DesktopUpdaterCheckResult>(
        autoUpdater,
        {
          'update-available': (outcome, info) => {
            outcome.resolveWith(toDesktopUpdaterCheckResult(true, info as ElectronUpdaterInfo));
          },
          'update-not-available': (outcome) => {
            outcome.resolveWith(toDesktopUpdaterCheckResult(false, null));
          },
          error: (outcome, error) => {
            outcome.rejectWith(error);
          },
        },
        () => autoUpdater.checkForUpdates(),
      );
    },

    async downloadUpdate(onProgress) {
      return waitForTerminalEvent<void>(
        autoUpdater,
        {
          'download-progress': (_outcome, raw) => {
            onProgress(toDesktopUpdateProgress(raw as ElectronUpdaterProgressInfo));
          },
          'update-downloaded': (outcome) => {
            outcome.resolveWith(undefined);
          },
          error: (outcome, error) => {
            outcome.rejectWith(error);
          },
        },
        () => autoUpdater.downloadUpdate(),
      );
    },

    async quitAndInstall() {
      // Non-silent: the Windows package is an assisted NSIS installer, so the
      // user sees the wizard. The relaunch afterwards comes from
      // autoRunAppAfterInstall, which configureElectronUpdater pins — in
      // non-silent mode electron-updater ignores the isForceRunAfter argument
      // passed here and reads that field instead. The argument is still passed
      // so the call stays correct if the mode ever changes.
      // Do not resolve merely because this void API returned. On Linux a
      // cancelled elevation prompt or failed dpkg run emits `error` and never
      // calls app.quit(); on macOS the native updater can also fail or stall
      // after this method returns. `quit` is the first non-cancellable app
      // signal; before-quit and will-quit can both be vetoed. The host-owned
      // watchdog bounds paths where neither quit nor an updater error arrives.
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let detachQuit = (): void => {};
        let detachTimeout = (): void => {};

        const detach = (): void => {
          autoUpdater.removeListener('error', onError);
          detachQuit();
          detachTimeout();
        };
        const resolveOnQuit = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          detach();
          resolve();
        };
        const rejectOnError = (error: unknown): void => {
          if (settled) {
            return;
          }
          settled = true;
          detach();
          reject(error instanceof Error ? error : new Error(String(error)));
        };
        const onError = (error: never): void => {
          rejectOnError(error);
        };
        const rejectOnTimeout = (): void => {
          rejectOnError(new DesktopInstallHandoffTimeoutError());
        };

        autoUpdater.on('error', onError);
        try {
          detachQuit = installHandoffObserver.onQuit(resolveOnQuit);
          detachTimeout = installHandoffObserver.onTimeout(rejectOnTimeout);
          autoUpdater.quitAndInstall(false, true);
        } catch (error) {
          rejectOnError(error);
        }
      });
    },
  };
}
