import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';

interface DesktopHostPlatformShellUpdate {
  bootstrapAttemptId: string | null;
  setupCompleteAt: string | null;
  products: PlatformHostEnvelope['products'];
}

interface DesktopHostBridge {
  updatePlatformShell?: (payload: DesktopHostPlatformShellUpdate) => Promise<void>;
}

function resolveDesktopHostBridge(): DesktopHostBridge | null {
  const candidate = (
    window as Window & {
      catsDesktopHost?: DesktopHostBridge;
    }
  ).catsDesktopHost;
  return candidate ?? null;
}

export async function syncDesktopHostPlatformShell(
  envelope: PlatformHostEnvelope,
): Promise<void> {
  const desktopHost = resolveDesktopHostBridge();
  if (!desktopHost?.updatePlatformShell) {
    return;
  }

  await desktopHost.updatePlatformShell({
    bootstrapAttemptId: envelope.bootstrapAttemptId ?? null,
    setupCompleteAt: envelope.setupCompleteAt ?? null,
    products: envelope.products,
  });
}
