import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';

/**
 * Desktop preference defaults shared by the `Settings > Desktop` sections.
 *
 * They live outside the components because both Mobile pairing and Startup
 * behavior read them, and a payload that arrives without a `desktop` block must
 * produce the same shape for either section.
 */

export const DEFAULT_MOBILE_PAIRING: AppShellPayload['desktop']['mobilePairing'] = {
  enabled: false,
  bindHost: '127.0.0.1',
  bindPort: 0,
  bindReachability: 'loopback',
  canReachFromLan: false,
  selectedLanIp: null,
  selectedLanUrl: null,
  diagnosticManifestUrl: null,
  noLanCandidateReason: 'feature_disabled',
  bindOverrideEnv: 'CATS_DESKTOP_APP_HOST=0.0.0.0',
  pairingUrlStatus: 'phase1_pending',
  pairingUrl: null,
};

export function resolveDefaultDesktopPreferences(): AppShellPayload['desktop'] {
  return {
    startAtLogin: true,
    openWindowOnStartup: false,
    systemTrayEnabled: true,
    mobilePairing: DEFAULT_MOBILE_PAIRING,
  };
}
