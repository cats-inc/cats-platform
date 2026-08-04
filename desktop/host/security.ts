import {
  DESKTOP_BROWSER_HANDOFF_EXCHANGE_PATH,
  DESKTOP_HOST_ACTION_IDS,
  type DesktopHostActionId,
} from './contracts.js';

interface ValidateDesktopUrlOptions {
  httpsOnly?: boolean;
  allowedHosts?: Iterable<string> | null;
}

const DESKTOP_HOST_ACTION_ID_SET = new Set<string>(DESKTOP_HOST_ACTION_IDS);
const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/iu;
const BRACKETED_IPV6_PATTERN = /^\[[0-9a-f:.]+\]$/iu;

function isValidIpv4Host(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    if (!/^\d{1,3}$/u.test(part)) {
      return false;
    }
    const parsed = Number.parseInt(part, 10);
    return parsed >= 0 && parsed <= 255;
  });
}

function normalizeHostForComparison(value: string): string {
  return value.trim().replace(/^\[/u, '').replace(/\]$/u, '').toLowerCase();
}

function isValidHostName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/[/?#@\s\\]/u.test(trimmed)) {
    return false;
  }
  if (trimmed === 'localhost') {
    return true;
  }
  if (isValidIpv4Host(trimmed)) {
    return true;
  }
  if (BRACKETED_IPV6_PATTERN.test(trimmed)) {
    return true;
  }
  return HOSTNAME_PATTERN.test(trimmed.toLowerCase());
}

export function normalizeDesktopHost(
  rawValue: string | undefined,
  fallback: string,
): string {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (!isValidHostName(trimmed)) {
    throw new Error(`Invalid desktop host value: ${rawValue}`);
  }
  return trimmed.toLowerCase();
}

export function validateDesktopUrl(
  rawValue: string,
  options: ValidateDesktopUrlOptions = {},
): string {
  const url = new URL(rawValue);
  const allowedProtocols = options.httpsOnly === true
    ? new Set(['https:'])
    : new Set(['http:', 'https:']);
  if (!allowedProtocols.has(url.protocol)) {
    throw new Error(`Unsupported desktop URL protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('Desktop URLs must not include embedded credentials.');
  }
  if (options.allowedHosts) {
    const allowedHosts = new Set(
      Array.from(options.allowedHosts, (value) => normalizeHostForComparison(value)),
    );
    if (allowedHosts.size > 0 && !allowedHosts.has(normalizeHostForComparison(url.hostname))) {
      throw new Error(`Desktop URL host is not allow-listed: ${url.hostname}`);
    }
  }
  return url.toString();
}

export function parseDesktopAllowedHosts(rawValue: string | undefined): string[] {
  const entries = (rawValue ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  for (const entry of entries) {
    if (!isValidHostName(entry)) {
      throw new Error(`Invalid allow-listed desktop host value: ${entry}`);
    }
  }
  return entries.map((entry) => entry.toLowerCase());
}

export function resolveDesktopBrowserHandoffUrl(
  rawLaunchPath: string,
  options: {
    appBaseUrl: string;
    allowedHosts: Iterable<string>;
  },
): string {
  const launchPath = rawLaunchPath.trim();
  if (!launchPath.startsWith('/')) {
    throw new Error('Desktop browser handoff path must be root-relative.');
  }
  const appUrl = new URL(validateDesktopUrl(options.appBaseUrl, {
    allowedHosts: options.allowedHosts,
  }));
  const targetUrl = new URL(launchPath, appUrl);
  if (targetUrl.origin !== appUrl.origin) {
    throw new Error('Desktop browser handoff must use the Cats app origin.');
  }
  if (targetUrl.pathname !== DESKTOP_BROWSER_HANDOFF_EXCHANGE_PATH || targetUrl.hash) {
    throw new Error('Desktop browser handoff path is invalid.');
  }
  const tokenValues = targetUrl.searchParams.getAll('token');
  if (
    tokenValues.length !== 1
    || !/^[a-z0-9_-]{40,}$/iu.test(tokenValues[0] ?? '')
    || Array.from(targetUrl.searchParams.keys()).some((key) => key !== 'token')
  ) {
    throw new Error('Desktop browser handoff token is invalid.');
  }
  return validateDesktopUrl(targetUrl.toString(), {
    allowedHosts: options.allowedHosts,
  });
}

export function isDesktopHostActionId(value: unknown): value is DesktopHostActionId {
  return typeof value === 'string' && DESKTOP_HOST_ACTION_ID_SET.has(value);
}
