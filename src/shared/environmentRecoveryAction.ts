/**
 * Environment recovery action.
 *
 * Encapsulates the routing logic for the account-menu "Environment" entry.
 * Checks the desktop host bridge first for packaged setup relevance,
 * then falls back to Cats Runtime URLs based on current runtime/setup state.
 */

import { openBrowserUrl } from './catsRuntimeLink.js';
import {
  getDesktopSetupRecommendation,
  triggerDesktopPackagedSetup,
} from './desktopRecoveryBridge.js';
import type { RuntimeSetupStatus } from './runtimeSetup.js';
import {
  resolveRuntimeRecoveryTarget,
  resolveRuntimeRecoveryUrl,
  type RuntimePresentationStatus,
} from './runtimeStatusPresentation.js';

export interface EnvironmentRecoveryActionDependencies {
  getDesktopSetupRecommendation?: typeof getDesktopSetupRecommendation;
  triggerDesktopPackagedSetup?: typeof triggerDesktopPackagedSetup;
  openBrowserUrl?: (url: string) => void;
}

export async function executeEnvironmentRecovery(input: {
  runtimeStatus: RuntimePresentationStatus;
  runtimeBaseUrl: string;
  runtimeSetupStatus?: RuntimeSetupStatus | null;
}, dependencies: EnvironmentRecoveryActionDependencies = {}): Promise<void> {
  const readDesktopSetupRecommendation = dependencies.getDesktopSetupRecommendation
    ?? getDesktopSetupRecommendation;
  const runDesktopPackagedSetup = dependencies.triggerDesktopPackagedSetup
    ?? triggerDesktopPackagedSetup;
  const openRecoveryUrl = dependencies.openBrowserUrl
    ?? openBrowserUrl;

  const desktopRecommendation = await readDesktopSetupRecommendation();
  const desktopSetupRelevant = desktopRecommendation.available
    && desktopRecommendation.reason !== 'verification_recommended';
  const runtimeFallbackTarget = resolveRuntimeRecoveryTarget(input.runtimeStatus, {
    runtimeSetupStatus: input.runtimeSetupStatus,
  });

  let target = resolveRuntimeRecoveryTarget(input.runtimeStatus, {
    desktopSetupRelevant,
    runtimeSetupStatus: input.runtimeSetupStatus,
  });

  if (target === 'desktop-setup') {
    const triggered = await runDesktopPackagedSetup();
    if (triggered) {
      return;
    }
    target = runtimeFallbackTarget;
  }

  openRecoveryUrl(resolveRuntimeRecoveryUrl(input.runtimeBaseUrl, target));
}
