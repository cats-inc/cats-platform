import { createHash } from 'node:crypto';

import type {
  ArtifactCanvasError,
  ArtifactCanvasIframeSandboxProfile,
} from './contracts.js';

export type ArtifactCanvasUrlScheme = 'http' | 'https';

export interface ArtifactCanvasRuntimePreviewOriginAllowlistEntry {
  hostname: string;
  schemes?: ArtifactCanvasUrlScheme[];
  ports?: number[] | '*';
}

export interface ArtifactCanvasScriptedPreviewProducerAllowlistEntry {
  producerKind: 'tool' | 'system' | 'user';
  producerIdentity: string;
}

export interface ArtifactCanvasPolicyConfig {
  runtimePreviewOriginAllowlist: ArtifactCanvasRuntimePreviewOriginAllowlistEntry[];
  scriptedPreviewProducerAllowlist: ArtifactCanvasScriptedPreviewProducerAllowlistEntry[];
  catsShellOrigin: string;
}

export interface ArtifactCanvasProducerIdentity {
  kind: 'agent' | 'tool' | 'system' | 'user';
  producerIdentity: string | null;
}

export type ArtifactCanvasIframePolicyDecision =
  | {
      status: 'accepted';
      safeUrl: string;
      profile: ArtifactCanvasIframeSandboxProfile;
      policyVersion: string;
    }
  | {
      status: 'rejected';
      error: ArtifactCanvasError;
      policyVersion: string;
    };

interface NormalizedRuntimePreviewOriginAllowlistEntry {
  hostname: string;
  schemes: ArtifactCanvasUrlScheme[];
  ports: number[] | '*';
}

interface NormalizedScriptedPreviewProducerAllowlistEntry {
  producerKind: 'tool' | 'system' | 'user';
  producerIdentity: string;
}

interface NormalizedArtifactCanvasPolicyConfig {
  runtimePreviewOriginAllowlist: NormalizedRuntimePreviewOriginAllowlistEntry[];
  scriptedPreviewProducerAllowlist: NormalizedScriptedPreviewProducerAllowlistEntry[];
  catsShellOrigin: string;
}

export const ARTIFACT_CANVAS_POLICY_VERSION_ALGORITHM = 'artifact-canvas-policy-v1' as const;

export const DEFAULT_ARTIFACT_CANVAS_RUNTIME_PREVIEW_ORIGIN_ALLOWLIST:
  readonly ArtifactCanvasRuntimePreviewOriginAllowlistEntry[] = [
    { hostname: '127.0.0.1', schemes: ['http'], ports: '*' },
    { hostname: '::1', schemes: ['http'], ports: '*' },
    { hostname: 'localhost', schemes: ['http'], ports: '*' },
  ];

export const DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG: ArtifactCanvasPolicyConfig = {
  runtimePreviewOriginAllowlist: [
    ...DEFAULT_ARTIFACT_CANVAS_RUNTIME_PREVIEW_ORIGIN_ALLOWLIST,
  ],
  scriptedPreviewProducerAllowlist: [],
  catsShellOrigin: 'http://127.0.0.1:5173',
};

export const ARTIFACT_CANVAS_STATIC_IFRAME_SANDBOX_PROFILE:
  ArtifactCanvasIframeSandboxProfile = {
    name: 'static',
    sandbox: '',
    referrerPolicy: 'no-referrer',
    allow: '',
  };

export const ARTIFACT_CANVAS_SCRIPTED_CROSS_ORIGIN_IFRAME_SANDBOX_PROFILE:
  ArtifactCanvasIframeSandboxProfile = {
    name: 'scripted-cross-origin',
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
    referrerPolicy: 'no-referrer',
    allow: 'clipboard-read; clipboard-write',
  };

export function normalizeArtifactCanvasHostname(hostname: string): string {
  let normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

export function validateArtifactCanvasPolicyConfig(
  config: ArtifactCanvasPolicyConfig,
): void {
  normalizeArtifactCanvasPolicyConfig(config);
}

export function buildArtifactCanvasPolicyVersion(
  config: ArtifactCanvasPolicyConfig = DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
): { canonicalJson: string; policyVersion: string } {
  const normalized = normalizeArtifactCanvasPolicyConfig(config);
  const canonical = {
    algorithm: ARTIFACT_CANVAS_POLICY_VERSION_ALGORITHM,
    catsShellOrigin: normalized.catsShellOrigin,
    runtimePreviewOriginAllowlist: normalized.runtimePreviewOriginAllowlist,
    scriptedPreviewProducerAllowlist: normalized.scriptedPreviewProducerAllowlist,
  };
  const canonicalJson = stableJsonStringify(canonical);
  const policyVersion = createHash('sha256')
    .update(canonicalJson)
    .digest('hex')
    .slice(0, 16);
  return { canonicalJson, policyVersion };
}

export function isUrlAllowedArtifactCanvasScheme(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function rejectArtifactCanvasCredentialUrl(value: string): ArtifactCanvasError | null {
  try {
    const parsed = new URL(value);
    if (parsed.username !== '' || parsed.password !== '') {
      return {
        code: 'artifact_canvas_url_credentials_not_allowed',
        message: 'Artifact Canvas URLs must not include credentials.',
      };
    }
    return null;
  } catch {
    return {
      code: 'artifact_canvas_iframe_scheme_rejected',
      message: 'Artifact Canvas URL is invalid.',
    };
  }
}

export function matchesArtifactCanvasRuntimePreviewOrigin(
  value: string,
  config: ArtifactCanvasPolicyConfig = DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
): boolean {
  const normalized = normalizeArtifactCanvasPolicyConfig(config);
  const parsed = parseHttpUrl(value);
  if (!parsed) {
    return false;
  }
  if (normalizeOrigin(parsed) === normalized.catsShellOrigin) {
    return false;
  }
  const hostname = normalizeArtifactCanvasHostname(parsed.hostname);
  const scheme = parseScheme(parsed);
  const port = resolveEffectivePort(parsed);
  return normalized.runtimePreviewOriginAllowlist.some((entry) =>
    entry.hostname === hostname
    && entry.schemes.includes(scheme)
    && (entry.ports === '*' || entry.ports.includes(port)));
}

export function canUseScriptedArtifactCanvasPreview(input: {
  producer: ArtifactCanvasProducerIdentity;
  config?: ArtifactCanvasPolicyConfig;
}): boolean {
  if (input.producer.kind === 'agent') {
    return false;
  }
  const producerIdentity = input.producer.producerIdentity?.trim();
  if (!producerIdentity) {
    return false;
  }
  const normalized = normalizeArtifactCanvasPolicyConfig(
    input.config ?? DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  );
  return normalized.scriptedPreviewProducerAllowlist.some((entry) =>
    entry.producerKind === input.producer.kind
    && entry.producerIdentity === producerIdentity);
}

export function resolveArtifactCanvasIframePolicy(input: {
  url: string;
  producer: ArtifactCanvasProducerIdentity;
  artifactKind?: string | null;
  config?: ArtifactCanvasPolicyConfig;
}): ArtifactCanvasIframePolicyDecision {
  const config = input.config ?? DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG;
  const { policyVersion } = buildArtifactCanvasPolicyVersion(config);
  const parsed = parseHttpUrl(input.url);
  if (!parsed) {
    return {
      status: 'rejected',
      error: {
        code: 'artifact_canvas_iframe_scheme_rejected',
        message: 'Artifact Canvas iframe URLs must use http or https.',
      },
      policyVersion,
    };
  }
  const credentialError = rejectArtifactCanvasCredentialUrl(input.url);
  if (credentialError) {
    return {
      status: 'rejected',
      error: credentialError,
      policyVersion,
    };
  }

  const canScript = input.artifactKind === 'preview'
    && matchesArtifactCanvasRuntimePreviewOrigin(parsed.toString(), config)
    && canUseScriptedArtifactCanvasPreview({ producer: input.producer, config });
  return {
    status: 'accepted',
    safeUrl: parsed.toString(),
    profile: canScript
      ? ARTIFACT_CANVAS_SCRIPTED_CROSS_ORIGIN_IFRAME_SANDBOX_PROFILE
      : ARTIFACT_CANVAS_STATIC_IFRAME_SANDBOX_PROFILE,
    policyVersion,
  };
}

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(',')}}`;
}

function normalizeArtifactCanvasPolicyConfig(
  config: ArtifactCanvasPolicyConfig,
): NormalizedArtifactCanvasPolicyConfig {
  const runtimePreviewOriginAllowlist = config.runtimePreviewOriginAllowlist
    .map(normalizeOriginAllowlistEntry)
    .sort((left, right) =>
      compareCodePointStrings(stableJsonStringify(left), stableJsonStringify(right)));
  const scriptedPreviewProducerAllowlist = config.scriptedPreviewProducerAllowlist
    .map(normalizeProducerAllowlistEntry)
    .sort((left, right) =>
      compareCodePointStrings(left.producerKind, right.producerKind)
      || compareCodePointStrings(left.producerIdentity, right.producerIdentity));
  return {
    runtimePreviewOriginAllowlist,
    scriptedPreviewProducerAllowlist,
    catsShellOrigin: normalizeCatsShellOrigin(config.catsShellOrigin),
  };
}

function normalizeOriginAllowlistEntry(
  entry: ArtifactCanvasRuntimePreviewOriginAllowlistEntry,
): NormalizedRuntimePreviewOriginAllowlistEntry {
  const hostname = normalizeArtifactCanvasHostname(entry.hostname);
  if (!hostname) {
    throw new Error('artifactCanvas.runtimePreviewOriginAllowlist hostname is required.');
  }
  const schemes = dedupeStrings(entry.schemes ?? ['http']);
  for (const scheme of schemes) {
    if (scheme !== 'http' && scheme !== 'https') {
      throw new Error(`Unsupported Artifact Canvas runtime preview scheme: ${scheme}`);
    }
  }
  const ports = entry.ports ?? '*';
  const normalizedPorts = ports === '*'
    ? '*'
    : [...new Set(ports)].sort((left, right) => left - right);
  if (normalizedPorts !== '*') {
    const invalidPort = normalizedPorts.find((port) =>
      !Number.isInteger(port) || port <= 0 || port > 65_535);
    if (invalidPort !== undefined) {
      throw new Error(`Invalid Artifact Canvas runtime preview port: ${invalidPort}`);
    }
  }
  return {
    hostname,
    schemes: schemes.sort(compareCodePointStrings),
    ports: normalizedPorts,
  };
}

function normalizeProducerAllowlistEntry(
  entry: ArtifactCanvasScriptedPreviewProducerAllowlistEntry,
): NormalizedScriptedPreviewProducerAllowlistEntry {
  const producerIdentity = entry.producerIdentity.trim();
  if (!producerIdentity) {
    throw new Error('artifactCanvas.scriptedPreviewProducerAllowlist producerIdentity is required.');
  }
  return {
    producerKind: entry.producerKind,
    producerIdentity,
  };
}

function normalizeCatsShellOrigin(origin: string): string {
  const parsed = parseHttpUrl(origin);
  if (!parsed) {
    throw new Error('artifactCanvas catsShellOrigin must be an http(s) origin.');
  }
  return normalizeOrigin(parsed);
}

function normalizeOrigin(url: URL): string {
  const scheme = parseScheme(url);
  const hostname = normalizeArtifactCanvasHostname(url.hostname);
  const port = resolveEffectivePort(url);
  const defaultPort = scheme === 'http' ? 80 : 443;
  const portSuffix = port === defaultPort ? '' : `:${port}`;
  const bracketedHost = hostname.includes(':') ? `[${hostname}]` : hostname;
  return `${scheme}://${bracketedHost}${portSuffix}`;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function parseScheme(url: URL): ArtifactCanvasUrlScheme {
  return url.protocol === 'https:' ? 'https' : 'http';
}

function resolveEffectivePort(url: URL): number {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === 'https:' ? 443 : 80;
}

function dedupeStrings<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function compareCodePointStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
