export const GUIDE_CAT_ASSIST_SCHEMA_VERSION = 1 as const;
export const GUIDE_CAT_ASSIST_REFRESH_CONTEXT_HASH_PREFIX = 'gca:v1';

export type GuideCatAssistSurfaceId =
  | 'lobby'
  | 'chat:new'
  | 'chat:composer'
  | 'code:new'
  | (string & {});
export type GuideCatAssistSurfaceMode =
  | 'default'
  | (string & {});
export type GuideCatAssistAudienceState =
  | 'default'
  | 'first_run'
  | 'returning'
  | 'recap_candidate'
  | (string & {});
export type GuideCatAssistOriginMode = 'deterministic' | 'runtime';
export type GuideCatAssistRefreshStatus = 'never' | 'ok' | 'failed' | 'skipped';

export interface GuideCatAssistScope {
  surfaceId: GuideCatAssistSurfaceId;
  surfaceMode: GuideCatAssistSurfaceMode;
  audienceState: GuideCatAssistAudienceState;
  product?: string | null;
  route?: string | null;
  workspace?: string | null;
  recentActivityClass?: string | null;
  variantKey?: string | null;
}

export interface GuideCatAssistEntryChip {
  id: string;
  prompt: string;
  label?: string | null;
}

export interface GuideCatAssistContent {
  greeting: string | null;
  entryChips: GuideCatAssistEntryChip[];
}

export interface GuideCatAssistBundle {
  bundleId: string;
  scope: GuideCatAssistScope;
  content: GuideCatAssistContent;
  provenance: {
    originMode: GuideCatAssistOriginMode;
    refreshContextHash: string;
    missionId?: string | null;
    runId?: string | null;
  };
  freshness: {
    generatedAt: string;
    expiresAt: string | null;
    lastRefreshStatus: GuideCatAssistRefreshStatus;
  };
}

export interface GuideCatAssistRefreshFailure {
  scopeKey: string;
  failedAt: string;
  message: string;
  code: string | null;
  attempts: number;
}

export interface GuideCatAssistRefreshPreferences {
  runtimeRefreshEnabled: boolean;
  defaultTtlMs: number | null;
}

export interface GuideCatAssistConfigFile {
  schemaVersion: 1;
  updatedAt: string;
  disabledSurfaceKeys: string[];
  deterministicSeed: string | null;
  curatedOverrides: Record<string, GuideCatAssistContent>;
  refreshPreferences: GuideCatAssistRefreshPreferences;
}

export interface GuideCatAssistCacheFile {
  schemaVersion: 1;
  updatedAt: string;
  bundles: Record<string, GuideCatAssistBundle>;
  refreshFailures: Record<string, GuideCatAssistRefreshFailure>;
}

export type GuideCatAssistRenderSource = 'deterministic' | 'cache';

export interface GuideCatAssistSurfaceReadModel {
  scopeKey: string;
  bundle: GuideCatAssistBundle;
  renderSource: GuideCatAssistRenderSource;
  cacheHit: boolean;
  missing: boolean;
  stale: boolean;
  refreshEligible: boolean;
  surfaceDisabled: boolean;
  lastFailure: GuideCatAssistRefreshFailure | null;
}

export interface GuideCatAssistRefreshContextInput {
  schemaVersion?: number;
  scope: Pick<GuideCatAssistScope, 'surfaceId' | 'surfaceMode' | 'audienceState'>;
  guideCat: {
    id: string;
    name?: string | null;
    executionTarget?: {
      provider?: string | null;
      instance?: string | null;
      model?: string | null;
    } | null;
    modelSelection?: unknown;
  };
  ownerProfile?: {
    displayName?: string | null;
  } | null;
  assistTemplateRevision?: string | null;
}

/**
 * The +New chat workspace is a single guide-cat-assist surface. Earlier
 * revisions split it by transient composer presets
 * and gave each one its own scope key, but that conflated stable surface
 * identity with transient composer state — the user lands on `/chat/new`
 * regardless and shapes the chat through the composer. Direct-message routes
 * are outside guide-cat-assist altogether (DM has no helper chips and the
 * guide cat will never insert content into a private 1:1
 * conversation), so it does not get its own scope key here either. If
 * runtime-backed generation later produces meaningfully different
 * content for some sub-context, that is the moment to introduce a new
 * scope key — not before.
 */
export const GUIDE_CAT_ASSIST_V1_SCOPE_KEYS = {
  lobbyDefault: 'lobby:default:default',
  chatNewDefault: 'chat:new:default:default',
  codeNewDefault: 'code:new:default:default',
} as const;

type StableJsonValue =
  | string
  | number
  | boolean
  | null
  | StableJsonValue[]
  | { [key: string]: StableJsonValue };

function normalizeStableJsonValue(value: unknown): StableJsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeStableJsonValue(entry));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .reduce<Record<string, StableJsonValue>>((acc, key) => {
        acc[key] = normalizeStableJsonValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return String(value);
}

export function createGuideCatAssistScopeKey(
  scope: Pick<GuideCatAssistScope, 'surfaceId' | 'surfaceMode' | 'audienceState'>,
): string {
  return `${scope.surfaceId}:${scope.surfaceMode}:${scope.audienceState}`;
}

export function parseGuideCatAssistScopeKey(
  scopeKey: string,
): Pick<GuideCatAssistScope, 'surfaceId' | 'surfaceMode' | 'audienceState'> | null {
  const normalizedScopeKey = scopeKey.trim();
  if (!normalizedScopeKey) {
    return null;
  }

  const lastSeparatorIndex = normalizedScopeKey.lastIndexOf(':');
  if (lastSeparatorIndex <= 0) {
    return null;
  }
  const audienceState = normalizedScopeKey.slice(lastSeparatorIndex + 1).trim();
  const scopeWithoutAudience = normalizedScopeKey.slice(0, lastSeparatorIndex);
  const secondLastSeparatorIndex = scopeWithoutAudience.lastIndexOf(':');
  if (secondLastSeparatorIndex <= 0) {
    return null;
  }

  const surfaceId = scopeWithoutAudience.slice(0, secondLastSeparatorIndex).trim();
  const surfaceMode = scopeWithoutAudience.slice(secondLastSeparatorIndex + 1).trim();
  if (!surfaceId || !surfaceMode || !audienceState) {
    return null;
  }

  return {
    surfaceId,
    surfaceMode,
    audienceState,
  };
}

export function createGuideCatAssistBundleId(
  scope: Pick<GuideCatAssistScope, 'surfaceId' | 'surfaceMode' | 'audienceState'>,
): string {
  return createGuideCatAssistScopeKey(scope);
}

export function buildGuideCatAssistRefreshContextHash(
  input: GuideCatAssistRefreshContextInput,
): string {
  const payload = normalizeStableJsonValue({
    schemaVersion: input.schemaVersion ?? GUIDE_CAT_ASSIST_SCHEMA_VERSION,
    scope: {
      surfaceId: input.scope.surfaceId,
      surfaceMode: input.scope.surfaceMode,
      audienceState: input.scope.audienceState,
    },
    guideCat: {
      id: input.guideCat.id,
      name: input.guideCat.name ?? null,
      executionTarget: {
        provider: input.guideCat.executionTarget?.provider ?? null,
        instance: input.guideCat.executionTarget?.instance ?? null,
        model: input.guideCat.executionTarget?.model ?? null,
      },
      modelSelection: input.guideCat.modelSelection ?? null,
    },
    ownerProfile: {
      displayName: input.ownerProfile?.displayName ?? null,
    },
    assistTemplateRevision: input.assistTemplateRevision ?? null,
  });
  const digest = stableHashHex(JSON.stringify(payload));
  return `${GUIDE_CAT_ASSIST_REFRESH_CONTEXT_HASH_PREFIX}:${digest}`;
}

function stableHashHex(value: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= code + (left >>> 16);
    right = Math.imul(right, 0x01000193) >>> 0;
  }
  return `${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
}

export function isGuideCatAssistBundleStale(
  bundle: Pick<GuideCatAssistBundle, 'freshness'>,
  now: Date = new Date(),
): boolean {
  if (!bundle.freshness.expiresAt) {
    return bundle.freshness.lastRefreshStatus !== 'never';
  }

  const expiresAtMs = Date.parse(bundle.freshness.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }
  return expiresAtMs <= now.getTime();
}
