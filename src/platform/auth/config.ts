import {
  resolvePlatformAuthRecoveryTokenPathFromChatState,
  resolvePlatformAuthStatePathFromChatState,
} from '../../shared/platformPaths.js';

export type PlatformAuthMode = 'default' | 'enabled' | 'unsafe_disabled';

export interface PlatformGoogleAuthConfig {
  clientId: string | null;
  hostedDomains: string[];
  mobileAudiences: string[];
}

export interface PlatformAuthConfig {
  mode: PlatformAuthMode;
  enabled: boolean;
  sessionSecret: string | null;
  sessionTtlMs: number;
  mobileSessionTtlMs: number;
  loginFailureLimit: number;
  loginLockoutMs: number;
  accountDailyFailureCap: number;
  accountCooldownMs: number;
  subnetDailyFailureCap: number;
  allowedBrowserOrigins: string[];
  authStatePath: string;
  recoveryTokenPath: string;
  google: PlatformGoogleAuthConfig;
}

export const DEFAULT_AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_AUTH_MOBILE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_AUTH_LOGIN_FAILURE_LIMIT = 5;
export const DEFAULT_AUTH_LOGIN_LOCKOUT_MS = 30_000;
export const DEFAULT_AUTH_ACCOUNT_DAILY_FAILURE_CAP = 100;
export const DEFAULT_AUTH_ACCOUNT_COOLDOWN_MS = 15 * 60 * 1000;
export const DEFAULT_AUTH_SUBNET_DAILY_FAILURE_CAP = 500;

export interface LoadPlatformAuthConfigInput {
  env: NodeJS.ProcessEnv;
  host: string;
  port: number;
  chatStatePath: string;
}

export function loadPlatformAuthConfig(input: LoadPlatformAuthConfigInput): PlatformAuthConfig {
  const mode = parseAuthMode(input.env.CATS_AUTH_ENABLED);
  const allowedBrowserOrigins = parseOriginList(
    input.env.CATS_AUTH_ALLOWED_BROWSER_ORIGINS,
  ) ?? defaultAllowedBrowserOrigins(input.host, input.port);
  return {
    mode,
    enabled: mode !== 'unsafe_disabled',
    sessionSecret: input.env.CATS_AUTH_SESSION_SECRET?.trim() || null,
    sessionTtlMs: parsePositiveInt(
      input.env.CATS_AUTH_SESSION_TTL_MS,
      DEFAULT_AUTH_SESSION_TTL_MS,
      'CATS_AUTH_SESSION_TTL_MS',
    ),
    mobileSessionTtlMs: parsePositiveInt(
      input.env.CATS_AUTH_MOBILE_SESSION_TTL_MS,
      DEFAULT_AUTH_MOBILE_SESSION_TTL_MS,
      'CATS_AUTH_MOBILE_SESSION_TTL_MS',
    ),
    loginFailureLimit: parsePositiveInt(
      input.env.CATS_AUTH_LOGIN_FAILURE_LIMIT,
      DEFAULT_AUTH_LOGIN_FAILURE_LIMIT,
      'CATS_AUTH_LOGIN_FAILURE_LIMIT',
    ),
    loginLockoutMs: parsePositiveInt(
      input.env.CATS_AUTH_LOGIN_LOCKOUT_MS,
      DEFAULT_AUTH_LOGIN_LOCKOUT_MS,
      'CATS_AUTH_LOGIN_LOCKOUT_MS',
    ),
    accountDailyFailureCap: parsePositiveInt(
      input.env.CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP,
      DEFAULT_AUTH_ACCOUNT_DAILY_FAILURE_CAP,
      'CATS_AUTH_ACCOUNT_DAILY_FAILURE_CAP',
    ),
    accountCooldownMs: parsePositiveInt(
      input.env.CATS_AUTH_ACCOUNT_COOLDOWN_MS,
      DEFAULT_AUTH_ACCOUNT_COOLDOWN_MS,
      'CATS_AUTH_ACCOUNT_COOLDOWN_MS',
    ),
    subnetDailyFailureCap: parsePositiveInt(
      input.env.CATS_AUTH_SUBNET_DAILY_FAILURE_CAP,
      DEFAULT_AUTH_SUBNET_DAILY_FAILURE_CAP,
      'CATS_AUTH_SUBNET_DAILY_FAILURE_CAP',
    ),
    allowedBrowserOrigins,
    authStatePath: resolvePlatformAuthStatePathFromChatState(input.chatStatePath),
    recoveryTokenPath: resolvePlatformAuthRecoveryTokenPathFromChatState(input.chatStatePath),
    google: {
      clientId: input.env.CATS_AUTH_GOOGLE_CLIENT_ID?.trim() || null,
      hostedDomains: parseCsv(input.env.CATS_AUTH_GOOGLE_HD),
      mobileAudiences: parseCsv(input.env.CATS_AUTH_GOOGLE_MOBILE_AUDIENCES),
    },
  };
}

function parseAuthMode(raw: string | undefined): PlatformAuthMode {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) {
    return 'default';
  }
  if (trimmed === 'true') {
    return 'enabled';
  }
  if (trimmed === 'false') {
    return 'unsafe_disabled';
  }
  throw new Error('CATS_AUTH_ENABLED must be true or false when set.');
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseCsv(raw: string | undefined): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOriginList(raw: string | undefined): string[] | null {
  const entries = parseCsv(raw);
  if (entries.length === 0) {
    return null;
  }
  return [...new Set(entries.map(normalizeOrigin))];
}

function defaultAllowedBrowserOrigins(host: string, port: number): string[] {
  return [...new Set([
    normalizeOrigin(`http://${host}:${port}`),
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ])];
}

function normalizeOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('origin must use http or https');
    }
    return parsed.origin;
  } catch (error) {
    throw new Error(
      `Invalid auth browser origin '${value}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
