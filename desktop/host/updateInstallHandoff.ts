import type { DesktopUpdaterAdapter } from './updateManager.js';

/**
 * A timeout cannot prove whether the platform installer started. Callers must
 * therefore distinguish it from a definite updater error and avoid restarting
 * managed services into a possibly active installer.
 */
export class DesktopInstallHandoffTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for the desktop update handoff to quit Cats.');
    this.name = 'DesktopInstallHandoffTimeoutError';
  }
}

/**
 * Managed-service drain around the installer handoff.
 *
 * `quitAndInstall` ends the process, so without this the Cats runtime and
 * platform sidecars are killed mid-flight rather than drained. On Windows that
 * is not merely untidy: the upgrade runs the previous uninstaller before
 * installing, and a sidecar still holding files in the install directory can
 * make that uninstall or the install that follows fail, which is how an update
 * leaves a broken installation behind.
 *
 * This is a decorator rather than a manager feature so the update state machine
 * stays a state machine, and so the ordering is testable without Electron.
 */

export interface DesktopInstallHandoffHooks {
  /**
   * Brings managed services down. Resolves once they are stopped, including the
   * forced path when a graceful stop times out.
   */
  drainManagedServices: () => Promise<void>;
  /**
   * Brings managed services back after a handoff that failed while the process
   * was still alive. Without it the app would still be running but with dead
   * sidecars, which is a worse state than the one the user started in.
   */
  restartManagedServices: () => Promise<void>;
  /**
   * Ends the old host after a bounded handoff produced no terminal signal.
   * At that point the platform installer may or may not have started, so
   * restarting sidecars could race an installer or launch mismatched files.
   */
  exitAfterUncertainHandoff: () => Promise<void>;
  logger?: (message: string) => void;
}

export function withDesktopInstallHandoff(
  adapter: DesktopUpdaterAdapter,
  hooks: DesktopInstallHandoffHooks,
): DesktopUpdaterAdapter {
  const log = hooks.logger ?? (() => {});

  async function restoreAfterFailedHandoff(stage: string): Promise<void> {
    try {
      await hooks.restartManagedServices();
    } catch (restartError) {
      // Nothing further can be done from here. The manager still reports a
      // recoverable state, and the log says why the app may be degraded.
      log(
        `[desktop-update] managed services did not restart after a failed ${stage}: `
          + `${restartError instanceof Error ? restartError.message : String(restartError)}`,
      );
    }
  }

  return {
    checkForUpdates: adapter.checkForUpdates.bind(adapter),
    downloadUpdate: adapter.downloadUpdate.bind(adapter),

    async quitAndInstall() {
      try {
        await hooks.drainManagedServices();
      } catch (drainError) {
        // Handing off now would point the installer at files a surviving
        // sidecar may still hold, so the install is abandoned instead.
        log(
          '[desktop-update] managed services failed to drain; abandoning the installer handoff: '
            + `${drainError instanceof Error ? drainError.message : String(drainError)}`,
        );
        await restoreAfterFailedHandoff('drain');
        throw drainError;
      }

      try {
        await adapter.quitAndInstall();
      } catch (handoffError) {
        if (handoffError instanceof DesktopInstallHandoffTimeoutError) {
          log(
            '[desktop-update] installer handoff timed out in an uncertain state; '
              + 'exiting without restarting managed services.',
          );
          try {
            await hooks.exitAfterUncertainHandoff();
          } catch (exitError) {
            log(
              '[desktop-update] desktop host did not exit after an uncertain installer handoff: '
                + `${exitError instanceof Error ? exitError.message : String(exitError)}`,
            );
          }
          throw handoffError;
        }
        await restoreAfterFailedHandoff('handoff');
        throw handoffError;
      }
    },
  };
}
