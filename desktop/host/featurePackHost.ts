// Desktop's wiring for feature packs: the Electron `net` transport (SPEC-145
// FR-B3), the lock and manager, the pack IPC bridge (FR-C4) and the preload
// argument that exposes it (FR-D1). The manager and contract in featurePacks/
// stay Electron-free so Bot can vendor them; Desktop composes them here.

import { join } from 'node:path';

import {
  DESKTOP_FEATURE_PACK_CANCEL_CHANNEL,
  DESKTOP_FEATURE_PACK_CHECK_CHANNEL,
  DESKTOP_FEATURE_PACK_DOWNLOAD_CHANNEL,
  DESKTOP_FEATURE_PACK_EVENT_CHANNEL,
  DESKTOP_FEATURE_PACK_GET_CHANNEL,
  DESKTOP_FEATURE_PACK_LIST_CHANNEL,
  DESKTOP_FEATURE_PACK_PAUSE_CHANNEL,
  DESKTOP_FEATURE_PACK_REMOVE_CHANNEL,
  DESKTOP_FEATURE_PACK_RESUME_CHANNEL,
  DESKTOP_FEATURE_PACKS_ARGUMENT,
} from './contracts.js';
import {
  featurePackContract,
  readFeaturePackLock,
  selectFeaturePackLockEntries,
  type FeaturePackLockEntry,
} from './featurePacks/featurePackContract.js';
import {
  FeaturePackManager,
  createFeaturePackSystemProbe,
  type FeaturePackChange,
  type FeaturePackLogRecord,
  type FeaturePackSystem,
  type FeaturePackTransport,
} from './featurePacks/featurePackManager.js';
import { isMainWindowMainFrameIpcSender, type DesktopIpcMainWindow } from './ipcSecurity.js';

export const LINUX_STT_PACK_ID = 'linux-stt';
export const DESKTOP_FEATURE_PACK_LOCK_FILE = 'desktop-feature-packs.lock.json';

/** The part of Electron's `net` the transport uses. */
export interface FeaturePackNet {
  request(options: { url: string; method: 'GET'; redirect: 'manual' }): FeaturePackNetRequest;
}

export interface FeaturePackNetRequest {
  setHeader(name: string, value: string): void;
  on(event: string, listener: (...args: never[]) => void): unknown;
  abort(): void;
  end(): void;
}

interface FeaturePackNetResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
}

function lowerCaseHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(headers)) {
    result[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return result;
}

async function* emptyBody(): AsyncIterable<Uint8Array> {
  // A redirect's body is never read.
}

/**
 * Electron `net` as the pack transport (FR-B3): the session's proxy settings
 * apply, and `redirect: 'manual'` hands every 3xx back to the manager, which
 * refuses non-HTTPS targets. The response is a Readable, read as an async
 * iterable so the manager's writes apply backpressure.
 */
export function createElectronFeaturePackTransport(net: FeaturePackNet): FeaturePackTransport {
  return {
    request({ url, headers, signal }) {
      return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const request = net.request({ url, method: 'GET', redirect: 'manual' });
        for (const [name, value] of Object.entries(headers)) {
          request.setHeader(name, value);
        }
        let settled = false;
        const settle = (action: () => void): void => {
          if (!settled) {
            settled = true;
            action();
          }
        };
        signal.addEventListener('abort', () => {
          request.abort();
          settle(() => reject(signal.reason));
        }, { once: true });
        request.on('redirect', (statusCode: number, _method: string, redirectUrl: string) => {
          settle(() => {
            request.abort();
            resolve({ status: statusCode, headers: { location: redirectUrl }, body: emptyBody() });
          });
        });
        request.on('response', (response: FeaturePackNetResponse) => {
          settle(() => {
            const body = response as unknown as Partial<AsyncIterable<Uint8Array>>;
            if (typeof body[Symbol.asyncIterator] !== 'function') {
              request.abort();
              reject(new Error('The network response is not a readable stream.'));
              return;
            }
            resolve({
              status: response.statusCode,
              headers: lowerCaseHeaders(response.headers),
              body: body as AsyncIterable<Uint8Array>,
            });
          });
        });
        request.on('error', (error: Error) => {
          settle(() => reject(error));
        });
        request.end();
      });
    },
  };
}

export type DesktopFeaturePackLog = (
  record: FeaturePackLogRecord | { operation: 'lock'; outcome: 'failed'; detail: string },
) => void;

export interface DesktopFeaturePacks {
  /** The lock entries for this machine. Empty means no pack and no bridge. */
  entries: readonly FeaturePackLockEntry[];
  manager: FeaturePackManager;
  /** Settles when startup cleanup has run (FR-B7); IPC waits for it. */
  ready: Promise<void>;
}

/**
 * Reads `config/desktop-feature-packs.lock.json` from the package root and
 * builds the manager over `<platformDir>/feature-packs` (FR-A1, FR-B1). A bad
 * lock yields no entries and is logged. Without entries nothing is created on
 * disk.
 */
export async function loadDesktopFeaturePacks(options: {
  packageRoot: string;
  platformDir: string;
  platform: string;
  arch: string;
  transport: FeaturePackTransport;
  system?: FeaturePackSystem;
  log: DesktopFeaturePackLog;
}): Promise<DesktopFeaturePacks> {
  const lockPath = join(options.packageRoot, 'config', DESKTOP_FEATURE_PACK_LOCK_FILE);
  const { lock, problem } = await readFeaturePackLock(lockPath);
  if (problem) {
    options.log({ operation: 'lock', outcome: 'failed', detail: problem });
  }
  const entries = selectFeaturePackLockEntries(lock, options.platform, options.arch);
  const manager = new FeaturePackManager({
    root: join(options.platformDir, 'feature-packs'),
    entries,
    contract: featurePackContract,
    transport: options.transport,
    system: options.system ?? createFeaturePackSystemProbe(),
    log: options.log,
  });
  const ready = entries.length > 0 ? manager.initialize() : Promise.resolve();
  ready.catch((error: unknown) => {
    options.log({
      operation: 'startup',
      id: '-',
      version: '-',
      outcome: 'failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  });
  return { entries, manager, ready };
}

/**
 * The preload argument naming this machine's pack ids, or none (FR-D1). The
 * window passes it through `webPreferences.additionalArguments`, so preload
 * reads no files.
 */
export function featurePackPreloadArguments(packs: Pick<DesktopFeaturePacks, 'entries'>): string[] {
  const ids = [...new Set(packs.entries.map((entry) => entry.id))];
  return ids.length > 0 ? [`${DESKTOP_FEATURE_PACKS_ARGUMENT}=${ids.join(',')}`] : [];
}

/** Whether Linux dictation can be offered at all: the lock has `linux-stt` here. */
export function hasLinuxVoicePack(
  packs: Pick<DesktopFeaturePacks, 'entries'>,
  platform: string,
): boolean {
  return platform === 'linux' && packs.entries.some((entry) => entry.id === LINUX_STT_PACK_ID);
}

export interface FeaturePackIpcMain {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

/**
 * The pack bridge's host side (FR-C4). Every channel accepts only the main
 * window's main frame and only a lock id. Download and Resume return once the
 * transfer starts; its outcome, failures included, goes out as change events.
 */
export function registerFeaturePackIpc(options: {
  ipcMain: FeaturePackIpcMain;
  packs: DesktopFeaturePacks;
  mainWindow: () => DesktopIpcMainWindow | null;
  sendEvent: (channel: string, change: FeaturePackChange) => void;
}): () => void {
  const { ipcMain, packs } = options;
  const guard = async (event: unknown): Promise<FeaturePackManager> => {
    if (!isMainWindowMainFrameIpcSender(event, options.mainWindow())) {
      throw new Error('Optional downloads are only available to the main Cats window.');
    }
    await packs.ready;
    return packs.manager;
  };
  const packId = (value: unknown): string => {
    if (typeof value === 'string' && packs.entries.some((entry) => entry.id === value)) {
      return value;
    }
    throw new Error('Unknown optional download.');
  };
  const startTransfer = (transfer: Promise<void>): void => {
    // Failures reach the renderer as change events with `failure` set.
    transfer.catch(() => undefined);
  };

  ipcMain.handle(DESKTOP_FEATURE_PACK_LIST_CHANNEL, async (event) => (await guard(event)).list());
  ipcMain.handle(DESKTOP_FEATURE_PACK_GET_CHANNEL, async (event, id) => {
    const pack = packId(id);
    return (await guard(event)).get(pack);
  });
  ipcMain.handle(DESKTOP_FEATURE_PACK_DOWNLOAD_CHANNEL, async (event, id) => {
    const pack = packId(id);
    startTransfer((await guard(event)).download(pack));
  });
  ipcMain.handle(DESKTOP_FEATURE_PACK_RESUME_CHANNEL, async (event, id) => {
    const pack = packId(id);
    startTransfer((await guard(event)).resume(pack));
  });
  ipcMain.handle(DESKTOP_FEATURE_PACK_PAUSE_CHANNEL, async (event, id) => {
    const pack = packId(id);
    await (await guard(event)).pause(pack);
  });
  ipcMain.handle(DESKTOP_FEATURE_PACK_CANCEL_CHANNEL, async (event, id) => {
    const pack = packId(id);
    await (await guard(event)).cancel(pack);
  });
  ipcMain.handle(DESKTOP_FEATURE_PACK_CHECK_CHANNEL, async (event, id) => {
    const pack = packId(id);
    return (await guard(event)).check(pack);
  });
  ipcMain.handle(DESKTOP_FEATURE_PACK_REMOVE_CHANNEL, async (event, id) => {
    const pack = packId(id);
    await (await guard(event)).remove(pack);
  });
  return packs.manager.onChange((change) => {
    options.sendEvent(DESKTOP_FEATURE_PACK_EVENT_CHANNEL, change);
  });
}
