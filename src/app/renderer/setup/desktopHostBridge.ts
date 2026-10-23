import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';

interface DesktopHostPlatformShellUpdate {
  bootstrapAttemptId: string | null;
  setupCompleteAt: string | null;
  products: PlatformHostEnvelope['products'];
}

interface DesktopHostBridge {
  updatePlatformShell?: (payload: DesktopHostPlatformShellUpdate) => Promise<void>;
  resetWindowPlacement?: () => Promise<void>;
  completeDataReset?: () => Promise<void>;
  prepareDataReset?: () => Promise<void>;
}

export function canResetDesktopRuntimeData(): boolean {
  const host = resolveDesktopHostBridge();
  return typeof host?.prepareDataReset === 'function' && typeof host.completeDataReset === 'function';
}

export async function prepareDesktopDataReset(): Promise<void> {
  const host = resolveDesktopHostBridge();
  if (!host?.prepareDataReset) throw new Error('Runtime data reset requires Cats Desktop.');
  await host.prepareDataReset();
}

export async function completeDesktopDataReset(): Promise<void> {
  const host = resolveDesktopHostBridge();
  if (!host?.completeDataReset) throw new Error('Runtime data reset requires Cats Desktop.');
  await host.completeDataReset();
}

function resolveDesktopHostBridge(): DesktopHostBridge | null {
  const candidate = (
    window as Window & {
      catsDesktopHost?: DesktopHostBridge;
    }
  ).catsDesktopHost;
  return candidate ?? null;
}

export async function syncDesktopHostPlatformShellState(
  payload: DesktopHostPlatformShellUpdate,
): Promise<void> {
  const desktopHost = resolveDesktopHostBridge();
  if (!desktopHost?.updatePlatformShell) {
    return;
  }

  await desktopHost.updatePlatformShell(payload);
}

/**
 * Returns the Desktop window to its default size and position after Reset
 * Platform data. Best effort: the data is already erased, so a host that
 * cannot move its window must not turn the reset into a reported failure.
 */
export async function resetDesktopHostWindowPlacement(): Promise<void> {
  const desktopHost = resolveDesktopHostBridge();
  if (!desktopHost?.resetWindowPlacement) {
    return;
  }

  try {
    await desktopHost.resetWindowPlacement();
  } catch {
    // Keep the window where it is; the reset itself succeeded.
  }
}

export async function syncDesktopHostPlatformShell(
  envelope: PlatformHostEnvelope,
): Promise<void> {
  await syncDesktopHostPlatformShellState({
    bootstrapAttemptId: envelope.bootstrapAttemptId ?? null,
    setupCompleteAt: envelope.setupCompleteAt ?? null,
    products: envelope.products,
  });
}
