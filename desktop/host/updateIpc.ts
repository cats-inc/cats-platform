import {
  DESKTOP_UPDATE_CHECK_CHANNEL,
  DESKTOP_UPDATE_DOWNLOAD_CHANNEL,
  DESKTOP_UPDATE_EVENT_CHANNEL,
  DESKTOP_UPDATE_INSTALL_CHANNEL,
  DESKTOP_UPDATE_SNAPSHOT_CHANNEL,
} from './contracts.js';
import type { DesktopUpdateSnapshot } from './contracts.js';
import type { DesktopUpdateManager } from './updateManager.js';

/**
 * Bounded IPC surface for the host-owned update manager.
 *
 * SPEC-111 section 3: every command takes no arguments, so a renderer cannot
 * supply a feed URL, filesystem destination, shell command, executable path, or
 * installer flag. Every handler also verifies the sender is the current Cats
 * main window before touching the manager.
 */

export const DESKTOP_UPDATE_IPC_CHANNELS = {
  snapshot: DESKTOP_UPDATE_SNAPSHOT_CHANNEL,
  check: DESKTOP_UPDATE_CHECK_CHANNEL,
  download: DESKTOP_UPDATE_DOWNLOAD_CHANNEL,
  install: DESKTOP_UPDATE_INSTALL_CHANNEL,
  event: DESKTOP_UPDATE_EVENT_CHANNEL,
} as const;

export interface DesktopUpdateIpcEvent {
  sender: unknown;
}

export interface DesktopUpdateWebContentsLike {
  isDestroyed?: () => boolean;
  send: (channel: string, payload: unknown) => void;
}

export function isDesktopUpdateIpcSenderTrusted(
  event: DesktopUpdateIpcEvent,
  mainWindowWebContents: unknown,
): boolean {
  if (mainWindowWebContents === null || mainWindowWebContents === undefined) {
    return false;
  }
  return event.sender === mainWindowWebContents;
}

export interface CreateDesktopUpdateIpcHandlersInput {
  manager: DesktopUpdateManager;
  resolveMainWindowWebContents: () => unknown;
  logger?: (message: string) => void;
}

export type DesktopUpdateIpcHandlers = Record<
  string,
  (event: DesktopUpdateIpcEvent) => Promise<DesktopUpdateSnapshot | void>
>;

export function createDesktopUpdateIpcHandlers(
  input: CreateDesktopUpdateIpcHandlersInput,
): DesktopUpdateIpcHandlers {
  const { manager, resolveMainWindowWebContents } = input;
  const logger = input.logger ?? (() => {});

  function assertTrusted(event: DesktopUpdateIpcEvent, channel: string): void {
    if (isDesktopUpdateIpcSenderTrusted(event, resolveMainWindowWebContents())) {
      return;
    }
    logger(`[desktop-update] rejected ${channel} from an untrusted sender.`);
    // Deliberately generic: the renderer learns the command was refused and
    // nothing about the host window topology.
    throw new Error('Update command rejected.');
  }

  return {
    [DESKTOP_UPDATE_IPC_CHANNELS.snapshot]: async (event) => {
      assertTrusted(event, DESKTOP_UPDATE_IPC_CHANNELS.snapshot);
      return manager.getSnapshot();
    },
    [DESKTOP_UPDATE_IPC_CHANNELS.check]: async (event) => {
      assertTrusted(event, DESKTOP_UPDATE_IPC_CHANNELS.check);
      return manager.checkForUpdates();
    },
    [DESKTOP_UPDATE_IPC_CHANNELS.download]: async (event) => {
      assertTrusted(event, DESKTOP_UPDATE_IPC_CHANNELS.download);
      return manager.downloadUpdate();
    },
    [DESKTOP_UPDATE_IPC_CHANNELS.install]: async (event) => {
      assertTrusted(event, DESKTOP_UPDATE_IPC_CHANNELS.install);
      await manager.restartAndInstall();
    },
  };
}

export interface CreateDesktopUpdateSnapshotBroadcastInput {
  manager: DesktopUpdateManager;
  resolveMainWindowWebContents: () => DesktopUpdateWebContentsLike | null;
}

/**
 * Streams manager snapshots to the main window. Returns the unsubscribe
 * function so the caller can detach deterministically during shutdown.
 */
export function createDesktopUpdateSnapshotBroadcast(
  input: CreateDesktopUpdateSnapshotBroadcastInput,
): () => void {
  const { manager, resolveMainWindowWebContents } = input;

  return manager.subscribe((snapshot) => {
    const webContents = resolveMainWindowWebContents();
    if (webContents === null || webContents === undefined) {
      return;
    }
    if (webContents.isDestroyed?.() === true) {
      return;
    }
    webContents.send(DESKTOP_UPDATE_IPC_CHANNELS.event, snapshot);
  });
}
