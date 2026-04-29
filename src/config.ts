import path from 'node:path';
import {
  DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS,
  DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS,
  resolveDefaultSessionCreateSlowWarningMs,
} from './runtime/client.js';
import { DEFAULT_RUNTIME_STALE_SESSION_RETRY_LIMIT } from './shared/runtimeRecovery.js';
import {
  resolveBundledPlatformConfigExamplePath,
  resolveDefaultPlatformDir,
  resolvePlatformConfigDir,
  resolvePlatformStateDir,
  resolvePlatformStatePath,
} from './shared/platformPaths.js';

export interface AppConfig {
  host: string;
  port: number;
  runtimeBaseUrl: string;
  runtimeApiKey: string;
  runtimeSessionCreateTimeoutMs: number;
  runtimeSessionCreateSlowWarningMs: number;
  runtimeMessageIdleTimeoutMs: number;
  runtimeSetupProxyTimeoutMs?: number;
  runtimeSetupScanProxyTimeoutMs?: number;
  runtimeSetupApplyProxyTimeoutMs?: number;
  debugLiveTrace: boolean;
  debugKeepRuntimeSessionsOnProductDelete: boolean;
  chatProviderAgentDecisionEnabled?: boolean;
  mobilePairingEnabled: boolean;
  mobileBundleRoot: string;
  runtimeDataDir: string;
  desktopHostStatePath: string;
  desktopDir: string;
  runtimeDir: string;
  runtimeStaleSessionRetryLimit: number;
  platformDir: string;
  platformStateDir: string;
  platformConfigDir: string;
  providerCapabilityBootstrapConfigPath: string;
  providerCapabilityBootstrapBundledExamplePath: string;
  chatStatePath: string;
  maxBossCats: number;
  maxCats: number;
  maxChatParticipants: number;
  maxAudienceParticipants: number;
  maxParallelChats: number;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8181;
const DEFAULT_RUNTIME_BASE_URL = 'http://127.0.0.1:3110';
const DEFAULT_RUNTIME_SETUP_SCAN_PROXY_TIMEOUT_MS = 120_000;
const DEFAULT_RUNTIME_SETUP_APPLY_PROXY_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BOSS_CATS = 1;
const DEFAULT_MAX_CATS = 5;
const DEFAULT_MAX_CHAT_PARTICIPANTS = 5;
const DEFAULT_MAX_AUDIENCE_PARTICIPANTS = 3;
const DEFAULT_MAX_PARALLEL_CHATS = 3;

function readFirstDefined(env: NodeJS.ProcessEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function parsePort(rawValue: string | undefined, fallback: number): number {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port value: ${rawValue}`);
  }

  return parsed;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalPositiveInt(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  return fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const catsHomeDir = env.HOME || env.USERPROFILE || undefined;
  const platformDir = env.CATS_PLATFORM_DIR?.trim()
    || resolveDefaultPlatformDir(catsHomeDir);
  const platformStateDir = resolvePlatformStateDir(platformDir);
  const platformConfigDir = resolvePlatformConfigDir(platformDir);
  const runtimeDir = env.CATS_RUNTIME_DIR?.trim()
    || joinCatsHomePath(catsHomeDir, 'runtime');
  const desktopDir = env.CATS_DESKTOP_DIR?.trim()
    || joinCatsHomePath(catsHomeDir, 'desktop');
  const legacySetupProxyTimeoutMs = parseOptionalPositiveInt(
    env.CATS_RUNTIME_SETUP_PROXY_TIMEOUT_MS,
  );
  const runtimeSessionCreateTimeoutMs = parsePositiveInt(
    env.CATS_RUNTIME_SESSION_CREATE_TIMEOUT_MS,
    DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS,
  );
  return {
    host: readFirstDefined(env, ['CATS_HOST', 'CATS_INC_HOST']) || DEFAULT_HOST,
    port: parsePort(readFirstDefined(env, ['CATS_PORT', 'CATS_INC_PORT']), DEFAULT_PORT),
    runtimeBaseUrl: (env.CATS_RUNTIME_BASE_URL || DEFAULT_RUNTIME_BASE_URL).replace(/\/+$/, ''),
    runtimeApiKey: env.CATS_RUNTIME_API_KEY?.trim() || '',
    runtimeSessionCreateTimeoutMs,
    runtimeSessionCreateSlowWarningMs: parsePositiveInt(
      env.CATS_RUNTIME_SESSION_CREATE_SLOW_WARNING_MS,
      resolveDefaultSessionCreateSlowWarningMs(runtimeSessionCreateTimeoutMs),
    ),
    runtimeMessageIdleTimeoutMs: parsePositiveInt(
      env.CATS_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS,
      DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS,
    ),
    runtimeSetupProxyTimeoutMs: legacySetupProxyTimeoutMs,
    runtimeSetupScanProxyTimeoutMs: parsePositiveInt(
      env.CATS_RUNTIME_SETUP_SCAN_PROXY_TIMEOUT_MS,
      legacySetupProxyTimeoutMs ?? DEFAULT_RUNTIME_SETUP_SCAN_PROXY_TIMEOUT_MS,
    ),
    runtimeSetupApplyProxyTimeoutMs: parsePositiveInt(
      env.CATS_RUNTIME_SETUP_APPLY_PROXY_TIMEOUT_MS,
      legacySetupProxyTimeoutMs ?? DEFAULT_RUNTIME_SETUP_APPLY_PROXY_TIMEOUT_MS,
    ),
    debugLiveTrace: parseBoolean(env.CATS_DEBUG_LIVE_TRACE, false),
    debugKeepRuntimeSessionsOnProductDelete: parseBoolean(
      env.CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE,
      false,
    ),
    chatProviderAgentDecisionEnabled: parseBoolean(
      env.CATS_CHAT_PROVIDER_AGENT_DECISION_ENABLED,
      false,
    ),
    mobilePairingEnabled: parseBoolean(env.CATS_DESKTOP_MOBILE_PAIRING_ENABLED, false),
    mobileBundleRoot: env.CATS_MOBILE_BUNDLE_ROOT?.trim()
      || path.resolve(process.cwd(), 'build', 'mobile'),
    runtimeDataDir: path.join(runtimeDir, 'data'),
    desktopHostStatePath: path.join(desktopDir, 'state.json'),
    desktopDir,
    runtimeDir,
    runtimeStaleSessionRetryLimit: parseNonNegativeInt(
      env.CATS_RUNTIME_STALE_SESSION_RETRY_LIMIT,
      DEFAULT_RUNTIME_STALE_SESSION_RETRY_LIMIT,
    ),
    platformDir,
    platformStateDir,
    platformConfigDir,
    providerCapabilityBootstrapConfigPath:
      env.CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG?.trim()
      || path.join(platformConfigDir, 'provider-capability-bootstrap.yaml'),
    providerCapabilityBootstrapBundledExamplePath:
      resolveBundledPlatformConfigExamplePath('provider-capability-bootstrap.yaml', env),
    chatStatePath: resolvePlatformStatePath(platformDir),
    maxBossCats: parsePositiveInt(env.CATS_MAX_BOSS_CATS, DEFAULT_MAX_BOSS_CATS),
    maxCats: parsePositiveInt(env.CATS_MAX_CATS, DEFAULT_MAX_CATS),
    maxChatParticipants: parsePositiveInt(
      env.CATS_MAX_CHAT_PARTICIPANTS,
      DEFAULT_MAX_CHAT_PARTICIPANTS,
    ),
    maxAudienceParticipants: parsePositiveInt(
      env.CATS_MAX_AUDIENCE_PARTICIPANTS,
      DEFAULT_MAX_AUDIENCE_PARTICIPANTS,
    ),
    maxParallelChats: parsePositiveInt(env.CATS_MAX_PARALLEL_CHATS, DEFAULT_MAX_PARALLEL_CHATS),
  };
}

function joinCatsHomePath(homeDir: string | undefined, section: string): string {
  return path.join(homeDir || '', '.cats', section);
}
