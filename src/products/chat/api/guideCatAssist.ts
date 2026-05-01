import type { GuideCatRecord } from '../../../core/types.js';
import {
  type GuideCatAssistNewChatByMode,
  GUIDE_CAT_ASSIST_V1_CHAT_NEW_SCOPE_KEYS_BY_MODE,
  buildGuideCatAssistRefreshContextHash,
  createGuideCatAssistScopeKey,
  isGuideCatAssistBundleStale,
  type GuideCatAssistContent,
  type GuideCatAssistNewChatMode,
  type GuideCatAssistScope,
  type GuideCatAssistSurfaceReadModel,
} from '../../../shared/guideCatAssist.js';
import {
  resolveLobbyGuideCatAssistBaseline,
  resolveNewChatGuideCatAssistBaseline,
  resolveNewCodeGuideCatAssistBaseline,
} from '../../../shared/guideCatAssistBaselines.js';
import {
  readGuideCatAssistCache,
  readGuideCatAssistConfig,
  recordGuideCatAssistRefreshFailure,
  upsertGuideCatAssistBundle,
} from '../../../shared/guideCatAssistStore.js';

export interface ChatGuideCatAssistReadModel {
  lobby: GuideCatAssistSurfaceReadModel;
  newChatByMode: GuideCatAssistNewChatByMode;
  newCode: GuideCatAssistSurfaceReadModel;
}

interface GuideCatAssistRefreshQueueInput {
  chatStatePath: string;
  guideCat: GuideCatRecord | null;
  ownerDisplayName?: string | null;
  runtimeReachable: boolean;
  now?: Date;
  readModel?: ChatGuideCatAssistReadModel;
}

interface GuideCatAssistRefreshQueueEntry {
  pendingInput: GuideCatAssistRefreshQueueInput | null;
  activePromise: Promise<void>;
}

const DEFAULT_GUIDE_CAT_ASSIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Bump when a baseline chip / greeting / copy in `guideCatAssistBaselines.ts`
// changes — the constant is mixed into `refreshContextHash`, so changing it
// invalidates every locally-cached bundle and forces the next render to
// pick up the new baseline. Without a bump, label edits never reach users
// who already have a cached bundle on disk. Last bump: 2026-05-01 to roll
// out two new Code chips ("Write tests" + cross-surface "Start a project").
const GUIDE_CAT_ASSIST_TEMPLATE_REVISION = 'guide-cat-assist-v3';
const guideCatAssistRefreshQueue = new Map<string, GuideCatAssistRefreshQueueEntry>();

function mergeOverrideContent(
  baseContent: GuideCatAssistContent,
  overrideContent: GuideCatAssistContent | undefined,
): GuideCatAssistContent {
  if (!overrideContent) {
    return baseContent;
  }

  return {
    ...baseContent,
    greeting: overrideContent.greeting,
    entryChips: [...overrideContent.entryChips],
  };
}

function resolveSurfaceReadModel(options: {
  scope: Pick<GuideCatAssistScope, 'surfaceId' | 'surfaceMode' | 'audienceState'>;
  guideCatExists: boolean;
  runtimeReachable: boolean;
  refreshContextHash: string | null;
  refreshRuntimeEnabled: boolean;
  disabledSurfaceKeys: readonly string[];
  curatedOverrides: Record<string, GuideCatAssistContent>;
  cacheBundles: Record<string, ReturnType<typeof resolveLobbyGuideCatAssistBaseline>>;
  refreshFailures: Record<string, { scopeKey: string; failedAt: string; message: string; code: string | null; attempts: number }>;
  baselineBundle: ReturnType<typeof resolveLobbyGuideCatAssistBaseline>;
}): GuideCatAssistSurfaceReadModel {
  const scopeKey = createGuideCatAssistScopeKey(options.scope);
  const cachedBundle = options.cacheBundles[scopeKey] ?? null;
  const surfaceDisabled = options.disabledSurfaceKeys.includes(scopeKey);
  const override = options.curatedOverrides[scopeKey];
  const stale = cachedBundle
    ? (
      isGuideCatAssistBundleStale(cachedBundle)
      || (
        options.refreshContextHash !== null
        && cachedBundle.provenance.refreshContextHash !== options.refreshContextHash
      )
    )
    : false;
  // When the cached bundle's refreshContextHash no longer matches the
  // current one — meaning the scope, guideCat, owner, or baseline
  // template revision has changed — the cached content is structurally
  // out of date (not just TTL-expired). Drop back to the freshly-built
  // baseline immediately instead of serving cached copy until a
  // background refresh lands. Without this branch, a `GUIDE_CAT_ASSIST_TEMPLATE_REVISION`
  // bump (the lever for rolling out new chip / greeting copy) would
  // never reach users with a populated cache.
  const cacheRefreshContextDrift = Boolean(
    cachedBundle
    && options.refreshContextHash !== null
    && cachedBundle.provenance.refreshContextHash !== options.refreshContextHash,
  );
  const canRenderFromCache =
    options.guideCatExists
    && cachedBundle !== null
    && !surfaceDisabled
    && !cacheRefreshContextDrift;
  const selectedBundle = canRenderFromCache
    ? cachedBundle
    : options.baselineBundle;
  const missing = cachedBundle === null;
  const refreshEligible =
    !surfaceDisabled
    && options.guideCatExists
    && options.runtimeReachable
    && options.refreshRuntimeEnabled
    && (missing || stale);

  return {
    scopeKey,
    bundle: {
      ...selectedBundle,
      content: mergeOverrideContent(selectedBundle.content, override),
    },
    renderSource: canRenderFromCache ? 'cache' : 'deterministic',
    cacheHit: cachedBundle !== null,
    missing,
    stale,
    refreshEligible,
    surfaceDisabled,
    lastFailure: options.refreshFailures[scopeKey] ?? null,
  };
}

function resolveGuideCatAssistRefreshContextHash(options: {
  scope: Pick<GuideCatAssistScope, 'surfaceId' | 'surfaceMode' | 'audienceState'>;
  guideCat: GuideCatRecord | null;
  ownerDisplayName?: string | null;
}): string | null {
  if (!options.guideCat) {
    return null;
  }

  return buildGuideCatAssistRefreshContextHash({
    scope: options.scope,
    guideCat: {
      id: options.guideCat.id,
      name: options.guideCat.name,
      executionTarget: options.guideCat.executionTarget,
      modelSelection: options.guideCat.modelSelection,
    },
    ownerProfile: {
      displayName: options.ownerDisplayName ?? null,
    },
    assistTemplateRevision: GUIDE_CAT_ASSIST_TEMPLATE_REVISION,
  });
}

export async function resolveChatGuideCatAssistReadModel(input: {
  chatStatePath: string;
  guideCat: GuideCatRecord | null;
  ownerDisplayName?: string | null;
  runtimeReachable: boolean;
}): Promise<ChatGuideCatAssistReadModel> {
  const [config, cache] = await Promise.all([
    readGuideCatAssistConfig(input.chatStatePath),
    readGuideCatAssistCache(input.chatStatePath),
  ]);
  const newCodeScope = {
    surfaceId: 'code:new',
    surfaceMode: 'default',
    audienceState: 'default',
  } as const;

  return {
    lobby: resolveSurfaceReadModel({
      scope: {
        surfaceId: 'lobby',
        surfaceMode: 'default',
        audienceState: 'default',
      },
      guideCatExists: Boolean(input.guideCat),
      runtimeReachable: input.runtimeReachable,
      refreshContextHash: resolveGuideCatAssistRefreshContextHash({
        scope: {
          surfaceId: 'lobby',
          surfaceMode: 'default',
          audienceState: 'default',
        },
        guideCat: input.guideCat,
        ownerDisplayName: input.ownerDisplayName,
      }),
      refreshRuntimeEnabled: config.refreshPreferences.runtimeRefreshEnabled,
      disabledSurfaceKeys: config.disabledSurfaceKeys,
      curatedOverrides: config.curatedOverrides,
      cacheBundles: cache.bundles,
      refreshFailures: cache.refreshFailures,
      baselineBundle: resolveLobbyGuideCatAssistBaseline({
        seed: config.deterministicSeed,
      }),
    }),
    newChatByMode: Object.keys(GUIDE_CAT_ASSIST_V1_CHAT_NEW_SCOPE_KEYS_BY_MODE)
      .reduce<GuideCatAssistNewChatByMode>((acc, mode) => {
        const newChatMode = mode as GuideCatAssistNewChatMode;
        acc[newChatMode] = resolveSurfaceReadModel({
          scope: {
            surfaceId: 'chat:new',
            surfaceMode: newChatMode,
            audienceState: 'default',
          },
          guideCatExists: Boolean(input.guideCat),
          runtimeReachable: input.runtimeReachable,
          refreshContextHash: resolveGuideCatAssistRefreshContextHash({
            scope: {
              surfaceId: 'chat:new',
              surfaceMode: newChatMode,
              audienceState: 'default',
            },
            guideCat: input.guideCat,
            ownerDisplayName: input.ownerDisplayName,
          }),
          refreshRuntimeEnabled: config.refreshPreferences.runtimeRefreshEnabled,
          disabledSurfaceKeys: config.disabledSurfaceKeys,
          curatedOverrides: config.curatedOverrides,
          cacheBundles: cache.bundles,
          refreshFailures: cache.refreshFailures,
          baselineBundle: resolveNewChatGuideCatAssistBaseline({
            mode: newChatMode,
            seed: config.deterministicSeed,
          }),
        });
        return acc;
      }, {} as GuideCatAssistNewChatByMode),
    newCode: resolveSurfaceReadModel({
      scope: newCodeScope,
      guideCatExists: Boolean(input.guideCat),
      runtimeReachable: input.runtimeReachable,
      refreshContextHash: resolveGuideCatAssistRefreshContextHash({
        scope: newCodeScope,
        guideCat: input.guideCat,
        ownerDisplayName: input.ownerDisplayName,
      }),
      refreshRuntimeEnabled: config.refreshPreferences.runtimeRefreshEnabled,
      disabledSurfaceKeys: config.disabledSurfaceKeys,
      curatedOverrides: config.curatedOverrides,
      cacheBundles: cache.bundles,
      refreshFailures: cache.refreshFailures,
      baselineBundle: resolveNewCodeGuideCatAssistBaseline({
        seed: config.deterministicSeed,
      }),
    }),
  };
}

export async function refreshGuideCatAssistEligibleScopes(input: {
  chatStatePath: string;
  guideCat: GuideCatRecord | null;
  ownerDisplayName?: string | null;
  runtimeReachable: boolean;
  now?: Date;
  readModel?: ChatGuideCatAssistReadModel;
}): Promise<void> {
  if (!input.guideCat || !input.runtimeReachable) {
    return;
  }

  // V1 only re-materializes deterministic or last-good bundles into the local cache.
  // Runtime-backed content generation is deferred to a later slice.
  const [config, readModel] = await Promise.all([
    readGuideCatAssistConfig(input.chatStatePath),
    input.readModel
      ? Promise.resolve(input.readModel)
      : resolveChatGuideCatAssistReadModel({
        chatStatePath: input.chatStatePath,
        guideCat: input.guideCat,
        ownerDisplayName: input.ownerDisplayName,
        runtimeReachable: input.runtimeReachable,
      }),
  ]);
  const refreshableSurfaces = [
    readModel.lobby,
    ...Object.values(readModel.newChatByMode),
    readModel.newCode,
  ].filter((surface) => surface.refreshEligible);
  if (refreshableSurfaces.length === 0) {
    return;
  }

  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const ttlMs = config.refreshPreferences.defaultTtlMs ?? DEFAULT_GUIDE_CAT_ASSIST_CACHE_TTL_MS;
  const expiresAt = ttlMs > 0 ? new Date(now.getTime() + ttlMs).toISOString() : null;

  for (const surface of refreshableSurfaces) {
    try {
      const refreshContextHash = resolveGuideCatAssistRefreshContextHash({
        scope: surface.bundle.scope,
        guideCat: input.guideCat,
        ownerDisplayName: input.ownerDisplayName,
      }) ?? surface.bundle.provenance.refreshContextHash;
      await upsertGuideCatAssistBundle(input.chatStatePath, {
        ...surface.bundle,
        provenance: {
          ...surface.bundle.provenance,
          refreshContextHash,
        },
        freshness: {
          ...surface.bundle.freshness,
          generatedAt,
          expiresAt,
          lastRefreshStatus: 'skipped',
        },
      });
    } catch (error) {
      await recordGuideCatAssistRefreshFailure(input.chatStatePath, {
        scopeKey: surface.scopeKey,
        failedAt: generatedAt,
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof Error ? error.name : null,
      });
    }
  }
}

export function queueGuideCatAssistRefresh(input: GuideCatAssistRefreshQueueInput): void {
  if (!input.guideCat || !input.runtimeReachable) {
    return;
  }

  // V1 queues cache hydration only; it does not dispatch runtime content generation.
  const existingEntry = guideCatAssistRefreshQueue.get(input.chatStatePath);
  if (existingEntry) {
    existingEntry.pendingInput = input;
    return;
  }

  const entry: GuideCatAssistRefreshQueueEntry = {
    pendingInput: null,
    activePromise: Promise.resolve(),
  };
  guideCatAssistRefreshQueue.set(input.chatStatePath, entry);

  entry.activePromise = (async () => {
    let nextInput: GuideCatAssistRefreshQueueInput | null = input;
    while (nextInput) {
      await refreshGuideCatAssistEligibleScopes(nextInput).catch(() => {});
      nextInput = entry.pendingInput;
      entry.pendingInput = null;
    }
    guideCatAssistRefreshQueue.delete(input.chatStatePath);
  })();
}

export async function waitForGuideCatAssistRefreshIdle(chatStatePath: string): Promise<void> {
  const entry = guideCatAssistRefreshQueue.get(chatStatePath);
  if (!entry) {
    return;
  }
  await entry.activePromise.catch(() => {});
}
