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
import {
  parseChatNaturalProductIntentMode,
  type ChatNaturalProductIntentMode,
} from './products/chat/shared/naturalProductIntentMode.js';
import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  validateArtifactCanvasPolicyConfig,
  type ArtifactCanvasPolicyConfig,
  type ArtifactCanvasRuntimePreviewOriginAllowlistEntry,
  type ArtifactCanvasScriptedPreviewProducerAllowlistEntry,
} from './products/shared/artifactCanvas/iframePolicy.js';
import {
  DEFAULT_LIVE_PREVIEW_CONFIG,
  type LivePreviewCommandProfile,
  type LivePreviewConfig,
} from './products/code/livePreview/contracts.js';
import { validateLivePreviewConfig } from './products/code/livePreview/profileValidation.js';
import {
  loadPlatformAuthConfig,
  type PlatformAuthConfig,
} from './platform/auth/config.js';

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
  chatNaturalProductIntentMode: ChatNaturalProductIntentMode;
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
  auth: PlatformAuthConfig;
  artifactCanvas: ArtifactCanvasPolicyConfig;
  codeLivePreview: LivePreviewConfig;
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
  const host = readFirstDefined(env, ['CATS_HOST', 'CATS_INC_HOST']) || DEFAULT_HOST;
  const port = parsePort(readFirstDefined(env, ['CATS_PORT', 'CATS_INC_PORT']), DEFAULT_PORT);
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
  const artifactCanvas = loadArtifactCanvasPolicyConfig(env);
  validateArtifactCanvasPolicyConfig(artifactCanvas);
  const codeLivePreview = loadCodeLivePreviewConfig(env);
  validateLivePreviewConfig(codeLivePreview);
  const chatStatePath = resolvePlatformStatePath(platformDir);
  const auth = loadPlatformAuthConfig({
    env,
    host,
    port,
    chatStatePath,
  });
  return {
    host,
    port,
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
    chatNaturalProductIntentMode: parseChatNaturalProductIntentMode(
      env.CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE,
    ),
    mobilePairingEnabled: parseBoolean(env.CATS_DESKTOP_MOBILE_PAIRING_ENABLED, true),
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
    chatStatePath,
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
    auth,
    artifactCanvas,
    codeLivePreview,
  };
}

function joinCatsHomePath(homeDir: string | undefined, section: string): string {
  return path.join(homeDir || '', '.cats', section);
}

function loadArtifactCanvasPolicyConfig(env: NodeJS.ProcessEnv): ArtifactCanvasPolicyConfig {
  return {
    runtimePreviewOriginAllowlist:
      parseArtifactCanvasRuntimePreviewOriginAllowlist(
        env.CATS_ARTIFACT_CANVAS_RUNTIME_PREVIEW_ORIGIN_ALLOWLIST,
      ) ?? [...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG.runtimePreviewOriginAllowlist],
    scriptedPreviewProducerAllowlist:
      parseArtifactCanvasScriptedPreviewProducerAllowlist(
        env.CATS_ARTIFACT_CANVAS_SCRIPTED_PREVIEW_PRODUCER_ALLOWLIST,
      ) ?? [...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG.scriptedPreviewProducerAllowlist],
    catsShellOrigin:
      env.CATS_ARTIFACT_CANVAS_SHELL_ORIGIN?.trim()
      || DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG.catsShellOrigin,
  };
}

function parseArtifactCanvasRuntimePreviewOriginAllowlist(
  raw: string | undefined,
): ArtifactCanvasRuntimePreviewOriginAllowlistEntry[] | null {
  const parsed = parseArtifactCanvasJsonArray(raw);
  return parsed === null
    ? null
    : parsed.map((entry) => ({
        hostname: readArtifactCanvasString(entry, 'hostname'),
        schemes: readOptionalArtifactCanvasStringArray(entry, 'schemes') as
          ArtifactCanvasRuntimePreviewOriginAllowlistEntry['schemes'],
        ports: readArtifactCanvasPorts(entry),
      }));
}

function parseArtifactCanvasScriptedPreviewProducerAllowlist(
  raw: string | undefined,
): ArtifactCanvasScriptedPreviewProducerAllowlistEntry[] | null {
  const parsed = parseArtifactCanvasJsonArray(raw);
  return parsed === null
    ? null
    : parsed.map((entry) => ({
        producerKind: readArtifactCanvasString(entry, 'producerKind') as
          ArtifactCanvasScriptedPreviewProducerAllowlistEntry['producerKind'],
        producerIdentity: readArtifactCanvasString(entry, 'producerIdentity'),
      }));
}

function parseArtifactCanvasJsonArray(raw: string | undefined): Record<string, unknown>[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((entry) => isRecord(entry))) {
    throw new Error('Artifact Canvas allowlist config must be a JSON array of objects.');
  }
  return parsed;
}

function readArtifactCanvasString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error(`Artifact Canvas allowlist entry ${key} must be a string.`);
  }
  return value;
}

function readOptionalArtifactCanvasStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`Artifact Canvas allowlist entry ${key} must be a string array.`);
  }
  return value;
}

function readArtifactCanvasPorts(
  record: Record<string, unknown>,
): ArtifactCanvasRuntimePreviewOriginAllowlistEntry['ports'] {
  const value = record.ports;
  if (value === undefined) {
    return undefined;
  }
  if (value === '*') {
    return '*';
  }
  if (!Array.isArray(value) || !value.every((entry) => Number.isInteger(entry))) {
    throw new Error('Artifact Canvas allowlist entry ports must be "*" or an integer array.');
  }
  return value;
}

function loadCodeLivePreviewConfig(env: NodeJS.ProcessEnv): LivePreviewConfig {
  return {
    enabled: parseBoolean(env.CATS_CODE_LIVE_PREVIEW_ENABLED, DEFAULT_LIVE_PREVIEW_CONFIG.enabled),
    useRealProcessAdapter: parseBoolean(
      env.CATS_CODE_LIVE_PREVIEW_USE_REAL_PROCESS_ADAPTER,
      DEFAULT_LIVE_PREVIEW_CONFIG.useRealProcessAdapter ?? false,
    ),
    portRange: parseLivePreviewPortRange(
      env.CATS_CODE_LIVE_PREVIEW_PORT_RANGE,
      DEFAULT_LIVE_PREVIEW_CONFIG.portRange,
    ),
    maxConcurrentGlobal: parseStrictPositiveInt(
      env.CATS_CODE_LIVE_PREVIEW_MAX_GLOBAL,
      DEFAULT_LIVE_PREVIEW_CONFIG.maxConcurrentGlobal,
      'CATS_CODE_LIVE_PREVIEW_MAX_GLOBAL',
    ),
    maxConcurrentPerWorkspace: parseStrictPositiveInt(
      env.CATS_CODE_LIVE_PREVIEW_MAX_PER_WORKSPACE,
      DEFAULT_LIVE_PREVIEW_CONFIG.maxConcurrentPerWorkspace,
      'CATS_CODE_LIVE_PREVIEW_MAX_PER_WORKSPACE',
    ),
    defaultLeaseTtlMs: parseStrictPositiveInt(
      env.CATS_CODE_LIVE_PREVIEW_LEASE_TTL_MS,
      DEFAULT_LIVE_PREVIEW_CONFIG.defaultLeaseTtlMs,
      'CATS_CODE_LIVE_PREVIEW_LEASE_TTL_MS',
    ),
    logMaxBytes: parseStrictPositiveInt(
      env.CATS_CODE_LIVE_PREVIEW_LOG_MAX_BYTES,
      DEFAULT_LIVE_PREVIEW_CONFIG.logMaxBytes,
      'CATS_CODE_LIVE_PREVIEW_LOG_MAX_BYTES',
    ),
    allowIpv6Loopback: parseBoolean(
      env.CATS_CODE_LIVE_PREVIEW_ALLOW_IPV6_LOOPBACK,
      DEFAULT_LIVE_PREVIEW_CONFIG.allowIpv6Loopback,
    ),
    commandProfiles:
      parseLivePreviewCommandProfiles(env.CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES)
      ?? [...DEFAULT_LIVE_PREVIEW_CONFIG.commandProfiles],
  };
}

function parseLivePreviewPortRange(
  raw: string | undefined,
  fallback: LivePreviewConfig['portRange'],
): LivePreviewConfig['portRange'] {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { ...fallback };
  }
  const match = /^(\d+)-(\d+)$/u.exec(trimmed);
  if (!match) {
    throw new Error('CATS_CODE_LIVE_PREVIEW_PORT_RANGE must use start-end syntax.');
  }
  return {
    start: Number.parseInt(match[1]!, 10),
    end: Number.parseInt(match[2]!, 10),
  };
}

function parseStrictPositiveInt(raw: string | undefined, fallback: number, name: string): number {
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

function parseLivePreviewCommandProfiles(
  raw: string | undefined,
): LivePreviewCommandProfile[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((entry) => isRecord(entry))) {
    throw new Error('CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES must be a JSON array of objects.');
  }
  return parsed as unknown as LivePreviewCommandProfile[];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
