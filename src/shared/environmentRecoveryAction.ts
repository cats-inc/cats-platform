/**
 * Environment recovery action.
 *
 * Encapsulates the routing logic for the account-menu "Environment" entry.
 * Checks the desktop host bridge first for packaged setup relevance,
 * then falls back to Cats Runtime URLs based on current runtime status.
 */

import {
  getDesktopSetupRecommendation,
  triggerDesktopPackagedSetup,
} from './desktopRecoveryBridge.js';
import {
  resolveRuntimeRecoveryTarget,
  resolveRuntimeRecoveryUrl,
  type RuntimePresentationStatus,
} from './runtimeStatusPresentation.js';

export async function executeEnvironmentRecovery(input: {
  runtimeStatus: RuntimePresentationStatus;
  runtimeBaseUrl: string;
}): Promise<void> {
  const desktopRecommendation = await getDesktopSetupRecommendation();

  const target = resolveRuntimeRecoveryTarget(input.runtimeStatus, {
    desktopSetupRelevant: desktopRecommendation.available,
  });

  if (target === 'desktop-setup') {
    const triggered = await triggerDesktopPackagedSetup();
    if (triggered) {
      return;
    }
    // Desktop setup trigger failed — fall through to runtime URL.
  }

  const url = resolveRuntimeRecoveryUrl(input.runtimeBaseUrl, target);
  const context = globalThis as typeof globalThis & {
    window?: { open?: (url: string, target: string, features: string) => unknown };
  };
  context.window?.open?.(url, '_blank', 'noopener,noreferrer');
}
