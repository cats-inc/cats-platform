import os from 'node:os';

import { PLATFORM_RUNTIME_ROOT_PATH } from './runtimeIngressPaths.js';

export interface PlatformIngressBindingSummary {
  host: string;
  port: number;
  mode: 'loopback' | 'wildcard' | 'specific';
  canReachFromLan: boolean;
}

export interface PlatformIngressUrlSummary {
  localUrls: string[];
  lanUrls: string[];
  overlayUrls: string[];
}

export interface PlatformIngressSummary {
  trustedAccessOnly: true;
  binding: PlatformIngressBindingSummary;
  urls: PlatformIngressUrlSummary;
  runtimeIngress: {
    rootPath: string;
    apiBasePath: '/runtime/api';
  };
  notes: string[];
}

export type NetworkInterfaceAddressLike = {
  address?: string | null;
  family?: string | number | null;
  internal?: boolean | null;
};

export type NetworkInterfacesLike = Record<string, NetworkInterfaceAddressLike[] | undefined>;

type InterfaceReachability = 'lan' | 'overlay' | 'virtual';

function isIpv4Family(family: string | number | null | undefined): boolean {
  return family === 'IPv4' || family === 4;
}

function isWildcardHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '0.0.0.0' || normalized === '::';
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '127.0.0.1'
    || normalized === 'localhost'
    || normalized === '::1';
}

function classifyInterfaceReachability(interfaceName: string): InterfaceReachability {
  const normalized = interfaceName.trim().toLowerCase();
  // Intentionally avoid matching macOS `utun*`: that namespace is shared by
  // NetworkExtension-based VPNs, iCloud Private Relay, and unrelated kernel
  // tunnels. Labeling those as trusted overlay URLs would mislead operators
  // about which interfaces are safe to use for browser ingress.
  if (
    /tailscale|headscale|nebula|zerotier|wireguard/u.test(normalized)
    || /^wg\d/u.test(normalized)
    || /^zt[a-z0-9]/u.test(normalized)
  ) {
    return 'overlay';
  }
  if (
    /wsl|docker|vethernet|hyper-v|virtualbox|vmware|podman|vboxnet/u.test(normalized)
    || /^br-/u.test(normalized)
  ) {
    return 'virtual';
  }
  return 'lan';
}

function listExternalIpv4Addresses(
  networkInterfaces: NetworkInterfacesLike,
): Record<InterfaceReachability, string[]> {
  const addresses = {
    lan: new Set<string>(),
    overlay: new Set<string>(),
    virtual: new Set<string>(),
  } satisfies Record<InterfaceReachability, Set<string>>;

  for (const [interfaceName, entries] of Object.entries(networkInterfaces)) {
    const reachability = classifyInterfaceReachability(interfaceName);
    for (const entry of entries ?? []) {
      const address = entry.address?.trim();
      if (!address || entry.internal || !isIpv4Family(entry.family)) {
        continue;
      }
      addresses[reachability].add(address);
    }
  }

  return {
    lan: Array.from(addresses.lan).sort((left, right) => left.localeCompare(right)),
    overlay: Array.from(addresses.overlay).sort((left, right) => left.localeCompare(right)),
    virtual: Array.from(addresses.virtual).sort((left, right) => left.localeCompare(right)),
  };
}

function buildHttpUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

export function summarizePlatformIngress(input: {
  host: string;
  port: number;
  networkInterfaces?: NetworkInterfacesLike;
}): PlatformIngressSummary {
  const host = input.host.trim() || '127.0.0.1';
  const port = input.port;
  const interfaces = input.networkInterfaces ?? os.networkInterfaces();
  const externalIpv4Addresses = listExternalIpv4Addresses(interfaces);
  const wildcardHost = isWildcardHost(host);
  const loopbackHost = isLoopbackHost(host);
  const mode: PlatformIngressBindingSummary['mode'] = loopbackHost
    ? 'loopback'
    : wildcardHost
      ? 'wildcard'
      : 'specific';

  const localUrls = loopbackHost || wildcardHost
    ? [buildHttpUrl('127.0.0.1', port)]
    : [buildHttpUrl(host, port)];

  const lanUrls = loopbackHost
    ? []
    : wildcardHost
      ? externalIpv4Addresses.lan.map((address) => buildHttpUrl(address, port))
      : externalIpv4Addresses.lan.includes(host)
        ? [buildHttpUrl(host, port)]
        : [];
  const overlayUrls = loopbackHost
    ? []
    : wildcardHost
      ? externalIpv4Addresses.overlay.map((address) => buildHttpUrl(address, port))
      : externalIpv4Addresses.overlay.includes(host)
        ? [buildHttpUrl(host, port)]
        : [];
  const hasLanUrls = lanUrls.length > 0;
  const hasOverlayUrls = overlayUrls.length > 0;
  const hasVirtualIpv4Addresses = externalIpv4Addresses.virtual.length > 0;

  const notes: string[] = [];
  if (mode === 'loopback') {
    notes.push('Current bind host is loopback-only. Other devices on the LAN cannot reach this server.');
  } else if (mode === 'wildcard' && hasLanUrls) {
    notes.push('Current bind host is wildcard. Use one of the LAN URLs below from a trusted local network.');
  } else if (mode === 'wildcard' && hasOverlayUrls) {
    notes.push('Current bind host is wildcard. No LAN IPv4 interfaces were detected, but trusted overlay URLs are available below.');
  } else if (mode === 'wildcard') {
    notes.push('Current bind host is wildcard, but no external IPv4 interfaces were detected.');
  } else if (hasLanUrls) {
    notes.push('Current bind host is LAN-visible. Use the listed URL from a trusted local network.');
  } else if (hasOverlayUrls) {
    notes.push('Current bind host matches a trusted overlay interface. Use the listed overlay URL from that trusted network.');
  } else {
    notes.push('Current bind host is not loopback, but no matching external IPv4 interface was detected.');
  }
  if (hasOverlayUrls) {
    notes.push('Overlay URLs were detected on trusted overlay interfaces such as Tailscale.');
  }
  if (hasVirtualIpv4Addresses) {
    notes.push('Common virtual adapter IPv4 addresses such as WSL or Docker are intentionally excluded from browser entry suggestions.');
  }
  notes.push('Browser-facing runtime pages stay under the Cats origin at /runtime and /runtime/api.');

  return {
    trustedAccessOnly: true,
    binding: {
      host,
      port,
      mode,
      canReachFromLan: hasLanUrls,
    },
    urls: {
      localUrls,
      lanUrls,
      overlayUrls,
    },
    runtimeIngress: {
      rootPath: PLATFORM_RUNTIME_ROOT_PATH,
      apiBasePath: '/runtime/api',
    },
    notes,
  };
}
