import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  GUIDE_CAT_ASSIST_REFRESH_CONTEXT_HASH_PREFIX,
  GUIDE_CAT_ASSIST_SCHEMA_VERSION,
  createGuideCatAssistBundleId,
  createGuideCatAssistScopeKey,
  type GuideCatAssistBundle,
  type GuideCatAssistCacheFile,
  type GuideCatAssistConfigFile,
  type GuideCatAssistContent,
  type GuideCatAssistEntryChip,
  type GuideCatAssistRefreshFailure,
  type GuideCatAssistRefreshPreferences,
  type GuideCatAssistScope,
} from './guideCatAssist.js';
import {
  resolveGuideCatAssistCachePathFromChatState,
  resolveGuideCatAssistConfigPathFromChatState,
} from './platformPaths.js';

const EPOCH_ISO = new Date(0).toISOString();

const DEFAULT_REFRESH_PREFERENCES: GuideCatAssistRefreshPreferences = {
  runtimeRefreshEnabled: true,
  defaultTtlMs: null,
};

const EMPTY_GUIDE_CAT_ASSIST_CONFIG: GuideCatAssistConfigFile = {
  schemaVersion: GUIDE_CAT_ASSIST_SCHEMA_VERSION,
  updatedAt: EPOCH_ISO,
  disabledSurfaceKeys: [],
  deterministicSeed: null,
  curatedOverrides: {},
  refreshPreferences: { ...DEFAULT_REFRESH_PREFERENCES },
};

const EMPTY_GUIDE_CAT_ASSIST_CACHE: GuideCatAssistCacheFile = {
  schemaVersion: GUIDE_CAT_ASSIST_SCHEMA_VERSION,
  updatedAt: EPOCH_ISO,
  bundles: {},
  refreshFailures: {},
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value.reduce<string[]>((acc, entry) => {
    const normalized = readNonEmptyString(entry);
    if (!normalized || seen.has(normalized)) {
      return acc;
    }
    seen.add(normalized);
    acc.push(normalized);
    return acc;
  }, []);
}

function normalizeRefreshPreferences(value: unknown): GuideCatAssistRefreshPreferences {
  if (!isObjectRecord(value)) {
    return { ...DEFAULT_REFRESH_PREFERENCES };
  }

  return {
    runtimeRefreshEnabled: value.runtimeRefreshEnabled !== false,
    defaultTtlMs: readNullableNumber(value.defaultTtlMs),
  };
}

function normalizeEntryChip(value: unknown): GuideCatAssistEntryChip | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = readNonEmptyString(value.id);
  const prompt = readNonEmptyString(value.prompt);
  if (!id || !prompt) {
    return null;
  }

  return {
    id,
    prompt,
    label: readNonEmptyString(value.label),
  };
}

function normalizeGuideCatAssistContent(value: unknown): GuideCatAssistContent {
  if (!isObjectRecord(value)) {
    return {
      greeting: null,
      entryChips: [],
    };
  }

  return {
    greeting: readNonEmptyString(value.greeting),
    entryChips: Array.isArray(value.entryChips)
      ? value.entryChips
          .map((entry) => normalizeEntryChip(entry))
          .filter((entry): entry is GuideCatAssistEntryChip => Boolean(entry))
      : [],
  };
}

function normalizeGuideCatAssistScope(value: unknown): GuideCatAssistScope | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const surfaceId = readNonEmptyString(value.surfaceId);
  const surfaceMode = readNonEmptyString(value.surfaceMode) ?? 'default';
  const audienceState = readNonEmptyString(value.audienceState) ?? 'default';
  if (!surfaceId) {
    return null;
  }

  return {
    surfaceId,
    surfaceMode,
    audienceState,
    product: readNonEmptyString(value.product),
    route: readNonEmptyString(value.route),
    workspace: readNonEmptyString(value.workspace),
    recentActivityClass: readNonEmptyString(value.recentActivityClass),
    variantKey: readNonEmptyString(value.variantKey),
  };
}

function normalizeGuideCatAssistRefreshFailure(value: unknown): GuideCatAssistRefreshFailure | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const scopeKey = readNonEmptyString(value.scopeKey);
  const failedAt = readNonEmptyString(value.failedAt);
  const message = readNonEmptyString(value.message);
  if (!scopeKey || !failedAt || !message) {
    return null;
  }

  return {
    scopeKey,
    failedAt,
    message,
    code: readNonEmptyString(value.code),
    attempts:
      typeof value.attempts === 'number' && Number.isFinite(value.attempts) && value.attempts > 0
        ? Math.trunc(value.attempts)
        : 1,
  };
}

function normalizeGuideCatAssistBundle(value: unknown): GuideCatAssistBundle | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const scope = normalizeGuideCatAssistScope(value.scope);
  if (!scope) {
    return null;
  }

  const bundleId = readNonEmptyString(value.bundleId) ?? createGuideCatAssistBundleId(scope);
  const content = normalizeGuideCatAssistContent(value.content);
  const provenanceRecord = isObjectRecord(value.provenance) ? value.provenance : null;
  const freshnessRecord = isObjectRecord(value.freshness) ? value.freshness : null;
  const lastRefreshStatus = readNonEmptyString(freshnessRecord?.lastRefreshStatus);

  return {
    bundleId,
    scope,
    content,
    provenance: {
      originMode: provenanceRecord?.originMode === 'runtime' ? 'runtime' : 'deterministic',
      refreshContextHash:
        readNonEmptyString(provenanceRecord?.refreshContextHash)
        ?? `${GUIDE_CAT_ASSIST_REFRESH_CONTEXT_HASH_PREFIX}:missing`,
      missionId: readNonEmptyString(provenanceRecord?.missionId),
      runId: readNonEmptyString(provenanceRecord?.runId),
    },
    freshness: {
      generatedAt: readNonEmptyString(freshnessRecord?.generatedAt) ?? EPOCH_ISO,
      expiresAt: readNonEmptyString(freshnessRecord?.expiresAt),
      lastRefreshStatus:
        lastRefreshStatus === 'ok'
        || lastRefreshStatus === 'failed'
        || lastRefreshStatus === 'skipped'
        || lastRefreshStatus === 'never'
          ? lastRefreshStatus
          : 'never',
    },
  };
}

function normalizeGuideCatAssistBundleRecord(
  value: unknown,
): Record<string, GuideCatAssistBundle> {
  if (!isObjectRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, GuideCatAssistBundle>>((acc, [key, entry]) => {
    const normalizedBundle = normalizeGuideCatAssistBundle(entry);
    if (!normalizedBundle) {
      return acc;
    }

    const scopeKey = createGuideCatAssistScopeKey(normalizedBundle.scope);
    acc[scopeKey] = normalizedBundle;
    return acc;
  }, {});
}

function normalizeGuideCatAssistRefreshFailureRecord(
  value: unknown,
): Record<string, GuideCatAssistRefreshFailure> {
  if (!isObjectRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, GuideCatAssistRefreshFailure>>((acc, [key, entry]) => {
    const normalizedFailure = normalizeGuideCatAssistRefreshFailure(entry);
    if (!normalizedFailure) {
      return acc;
    }

    acc[normalizedFailure.scopeKey] = normalizedFailure;
    return acc;
  }, {});
}

function normalizeGuideCatAssistContentRecord(
  value: unknown,
): Record<string, GuideCatAssistContent> {
  if (!isObjectRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, GuideCatAssistContent>>((acc, [key, entry]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return acc;
    }
    acc[normalizedKey] = normalizeGuideCatAssistContent(entry);
    return acc;
  }, {});
}

function normalizeGuideCatAssistConfigFile(value: unknown): GuideCatAssistConfigFile {
  if (!isObjectRecord(value)) {
    return structuredClone(EMPTY_GUIDE_CAT_ASSIST_CONFIG);
  }

  return {
    schemaVersion: GUIDE_CAT_ASSIST_SCHEMA_VERSION,
    updatedAt: readNonEmptyString(value.updatedAt) ?? EPOCH_ISO,
    disabledSurfaceKeys: normalizeStringArray(value.disabledSurfaceKeys),
    deterministicSeed: readNonEmptyString(value.deterministicSeed),
    curatedOverrides: normalizeGuideCatAssistContentRecord(value.curatedOverrides),
    refreshPreferences: normalizeRefreshPreferences(value.refreshPreferences),
  };
}

function normalizeGuideCatAssistCacheFile(value: unknown): GuideCatAssistCacheFile {
  if (!isObjectRecord(value)) {
    return structuredClone(EMPTY_GUIDE_CAT_ASSIST_CACHE);
  }

  return {
    schemaVersion: GUIDE_CAT_ASSIST_SCHEMA_VERSION,
    updatedAt: readNonEmptyString(value.updatedAt) ?? EPOCH_ISO,
    bundles: normalizeGuideCatAssistBundleRecord(value.bundles),
    refreshFailures: normalizeGuideCatAssistRefreshFailureRecord(value.refreshFailures),
  };
}

async function writeAtomicJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await writeFile(tempPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  await rename(tempPath, filePath);
}

export function resolveGuideCatAssistConfigPath(chatStatePath: string): string {
  return resolveGuideCatAssistConfigPathFromChatState(chatStatePath);
}

export function resolveGuideCatAssistCachePath(chatStatePath: string): string {
  return resolveGuideCatAssistCachePathFromChatState(chatStatePath);
}

export async function readGuideCatAssistConfig(
  chatStatePath: string,
): Promise<GuideCatAssistConfigFile> {
  try {
    const raw = await readFile(resolveGuideCatAssistConfigPath(chatStatePath), 'utf8');
    return normalizeGuideCatAssistConfigFile(JSON.parse(raw) as unknown);
  } catch {
    return structuredClone(EMPTY_GUIDE_CAT_ASSIST_CONFIG);
  }
}

export async function writeGuideCatAssistConfig(
  chatStatePath: string,
  config: GuideCatAssistConfigFile,
): Promise<GuideCatAssistConfigFile> {
  const normalizedConfig = normalizeGuideCatAssistConfigFile({
    ...config,
    updatedAt: new Date().toISOString(),
  });
  await writeAtomicJson(resolveGuideCatAssistConfigPath(chatStatePath), normalizedConfig);
  return structuredClone(normalizedConfig);
}

export async function readGuideCatAssistCache(
  chatStatePath: string,
): Promise<GuideCatAssistCacheFile> {
  try {
    const raw = await readFile(resolveGuideCatAssistCachePath(chatStatePath), 'utf8');
    return normalizeGuideCatAssistCacheFile(JSON.parse(raw) as unknown);
  } catch {
    return structuredClone(EMPTY_GUIDE_CAT_ASSIST_CACHE);
  }
}

export async function writeGuideCatAssistCache(
  chatStatePath: string,
  cache: GuideCatAssistCacheFile,
): Promise<GuideCatAssistCacheFile> {
  const normalizedCache = normalizeGuideCatAssistCacheFile({
    ...cache,
    updatedAt: new Date().toISOString(),
  });
  await writeAtomicJson(resolveGuideCatAssistCachePath(chatStatePath), normalizedCache);
  return structuredClone(normalizedCache);
}

export async function clearGuideCatAssistCache(
  chatStatePath: string,
  now: Date = new Date(),
): Promise<GuideCatAssistCacheFile> {
  return writeGuideCatAssistCache(chatStatePath, {
    ...EMPTY_GUIDE_CAT_ASSIST_CACHE,
    updatedAt: now.toISOString(),
  });
}

export async function readGuideCatAssistBundle(
  chatStatePath: string,
  scope:
    | string
    | Pick<GuideCatAssistScope, 'surfaceId' | 'surfaceMode' | 'audienceState'>,
): Promise<GuideCatAssistBundle | null> {
  const scopeKey = typeof scope === 'string'
    ? scope
    : createGuideCatAssistScopeKey(scope);
  const cache = await readGuideCatAssistCache(chatStatePath);
  return structuredClone(cache.bundles[scopeKey] ?? null);
}

export async function upsertGuideCatAssistBundle(
  chatStatePath: string,
  bundle: GuideCatAssistBundle,
): Promise<GuideCatAssistBundle> {
  const scopeKey = createGuideCatAssistScopeKey(bundle.scope);
  const cache = await readGuideCatAssistCache(chatStatePath);
  const normalizedBundle = normalizeGuideCatAssistBundle({
    ...bundle,
    bundleId: bundle.bundleId || createGuideCatAssistBundleId(bundle.scope),
    provenance: {
      ...bundle.provenance,
      refreshContextHash:
        readNonEmptyString(bundle.provenance.refreshContextHash)
        ?? `${GUIDE_CAT_ASSIST_REFRESH_CONTEXT_HASH_PREFIX}:missing`,
    },
  });
  if (!normalizedBundle) {
    throw new Error(`Invalid Guide Cat assist bundle for scope '${scopeKey}'`);
  }

  const nextCache: GuideCatAssistCacheFile = {
    ...cache,
    updatedAt: new Date().toISOString(),
    bundles: {
      ...cache.bundles,
      [scopeKey]: normalizedBundle,
    },
    refreshFailures: {
      ...cache.refreshFailures,
    },
  };
  delete nextCache.refreshFailures[scopeKey];

  await writeAtomicJson(resolveGuideCatAssistCachePath(chatStatePath), nextCache);
  return structuredClone(normalizedBundle);
}

export async function recordGuideCatAssistRefreshFailure(
  chatStatePath: string,
  failure: Omit<GuideCatAssistRefreshFailure, 'attempts'> & { attempts?: number | null },
): Promise<GuideCatAssistRefreshFailure> {
  const cache = await readGuideCatAssistCache(chatStatePath);
  const existingFailure = cache.refreshFailures[failure.scopeKey];
  const nextFailure: GuideCatAssistRefreshFailure = {
    scopeKey: failure.scopeKey,
    failedAt: failure.failedAt,
    message: failure.message,
    code: failure.code,
    attempts:
      typeof failure.attempts === 'number' && Number.isFinite(failure.attempts) && failure.attempts > 0
        ? Math.trunc(failure.attempts)
        : (existingFailure?.attempts ?? 0) + 1,
  };
  const nextCache: GuideCatAssistCacheFile = {
    ...cache,
    updatedAt: new Date().toISOString(),
    refreshFailures: {
      ...cache.refreshFailures,
      [failure.scopeKey]: nextFailure,
    },
  };
  await writeAtomicJson(resolveGuideCatAssistCachePath(chatStatePath), nextCache);
  return structuredClone(nextFailure);
}
