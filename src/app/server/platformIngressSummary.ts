import os from 'node:os';

import { PLATFORM_RUNTIME_ROOT_PATH } from '../../shared/runtimeIngressPaths.js';

export interface PlatformIngressBindingSummary {
  host: string;
  port: number;
  mode: 'loopback' | 'wildcard' | 'specific';
  canReachFromLan: boolean;
}

export interface PlatformIngressUrlSummary {
  localUrls: string[];
  lanUrls: string[];
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

type NetworkInterfaceAddressLike = {
  address?: string | null;
  family?: string | number | null;
  internal?: boolean | null;
};

type NetworkInterfacesLike = Record<string, NetworkInterfaceAddressLike[] | undefined>;

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

function listExternalIpv4Addresses(
  networkInterfaces: NetworkInterfacesLike,
): string[] {
  const addresses = new Set<string>();

  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      const address = entry.address?.trim();
      if (!address || entry.internal || !isIpv4Family(entry.family)) {
        continue;
      }
      addresses.add(address);
    }
  }

  return Array.from(addresses).sort((left, right) => left.localeCompare(right));
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
      ? externalIpv4Addresses.map((address) => buildHttpUrl(address, port))
      : externalIpv4Addresses.includes(host)
        ? [buildHttpUrl(host, port)]
        : [];

  const notes: string[] = [];
  if (mode === 'loopback') {
    notes.push('Current bind host is loopback-only. Other devices on the LAN cannot reach this server.');
  } else if (mode === 'wildcard') {
    notes.push('Current bind host is wildcard. Use one of the LAN URLs below from a trusted local network.');
  } else if (lanUrls.length > 0) {
    notes.push('Current bind host is LAN-visible. Use the listed URL from a trusted local network.');
  } else {
    notes.push('Current bind host is not loopback, but no matching external IPv4 interface was detected.');
  }
  notes.push('Browser-facing runtime pages stay under the Cats origin at /runtime and /runtime/api.');

  return {
    trustedAccessOnly: true,
    binding: {
      host,
      port,
      mode,
      canReachFromLan: lanUrls.length > 0,
    },
    urls: {
      localUrls,
      lanUrls,
    },
    runtimeIngress: {
      rootPath: PLATFORM_RUNTIME_ROOT_PATH,
      apiBasePath: '/runtime/api',
    },
    notes,
  };
}
