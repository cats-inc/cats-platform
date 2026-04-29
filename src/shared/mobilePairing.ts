import type {
  PlatformMobilePairingBindReachability,
  PlatformMobilePairingNoLanCandidateReason,
  PlatformMobilePairingReadiness,
} from './platform-contract.js';
import {
  summarizePlatformIngress,
  type NetworkInterfacesLike,
} from './platformIngressSummary.js';

export const MOBILE_PAIRING_DIAGNOSTIC_MANIFEST_PATH = '/api/mobile/manifest';
export const MOBILE_PAIRING_BIND_OVERRIDE_ENV = 'CATS_DESKTOP_APP_HOST=0.0.0.0';

function firstUrlHost(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function appendAbsolutePath(baseUrl: string | null, path: string): string | null {
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(path, baseUrl).href;
  } catch {
    return null;
  }
}

function resolveBindReachability(input: {
  mode: 'loopback' | 'wildcard' | 'specific';
  canReachFromLan: boolean;
}): PlatformMobilePairingBindReachability {
  if (input.mode === 'loopback') {
    return 'loopback';
  }
  if (input.mode === 'wildcard') {
    return 'all_interfaces';
  }
  return input.canReachFromLan ? 'lan' : 'other_interface';
}

function resolveNoLanCandidateReason(input: {
  enabled: boolean;
  mode: 'loopback' | 'wildcard' | 'specific';
  selectedLanIp: string | null;
}): PlatformMobilePairingNoLanCandidateReason | null {
  if (!input.enabled) {
    return 'feature_disabled';
  }
  if (input.selectedLanIp) {
    return null;
  }
  if (input.mode === 'loopback') {
    return 'loopback_bound';
  }
  if (input.mode === 'specific') {
    return 'bind_host_not_lan_candidate';
  }
  return 'no_lan_candidate';
}

export function buildMobilePairingReadiness(input: {
  enabled: boolean;
  host: string;
  port: number;
  networkInterfaces?: NetworkInterfacesLike;
}): PlatformMobilePairingReadiness {
  const ingress = summarizePlatformIngress({
    host: input.host,
    port: input.port,
    networkInterfaces: input.networkInterfaces,
  });
  const selectedLanUrl = ingress.urls.lanUrls[0] ?? null;
  const selectedLanIp = firstUrlHost(selectedLanUrl);
  const noLanCandidateReason = resolveNoLanCandidateReason({
    enabled: input.enabled,
    mode: ingress.binding.mode,
    selectedLanIp,
  });

  return {
    enabled: input.enabled,
    bindHost: ingress.binding.host,
    bindPort: ingress.binding.port,
    bindReachability: resolveBindReachability(ingress.binding),
    canReachFromLan: ingress.binding.canReachFromLan,
    selectedLanIp,
    selectedLanUrl,
    diagnosticManifestUrl: input.enabled
      ? appendAbsolutePath(selectedLanUrl, MOBILE_PAIRING_DIAGNOSTIC_MANIFEST_PATH)
      : null,
    noLanCandidateReason,
    bindOverrideEnv: ingress.binding.mode === 'loopback'
      ? MOBILE_PAIRING_BIND_OVERRIDE_ENV
      : null,
    pairingUrlStatus: 'phase1_pending',
    pairingUrl: null,
  };
}
