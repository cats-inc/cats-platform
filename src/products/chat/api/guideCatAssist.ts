import {
  GUIDE_CAT_ASSIST_V1_CHAT_NEW_SCOPE_KEYS_BY_MODE,
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
} from '../../../shared/guideCatAssistBaselines.js';
import {
  readGuideCatAssistCache,
  readGuideCatAssistConfig,
  recordGuideCatAssistRefreshFailure,
  upsertGuideCatAssistBundle,
} from '../../../shared/guideCatAssistStore.js';

export interface ChatGuideCatAssistReadModel {
  lobby: GuideCatAssistSurfaceReadModel;
  newChatByMode: Record<GuideCatAssistNewChatMode, GuideCatAssistSurfaceReadModel>;
}

const DEFAULT_GUIDE_CAT_ASSIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const guideCatAssistRefreshQueue = new Map<string, Promise<void>>();

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
  const selectedBundle = cachedBundle && !surfaceDisabled
    ? cachedBundle
    : options.baselineBundle;
  const stale = cachedBundle ? isGuideCatAssistBundleStale(cachedBundle) : false;
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
    renderSource: cachedBundle && !surfaceDisabled ? 'cache' : 'deterministic',
    cacheHit: cachedBundle !== null,
    missing,
    stale,
    refreshEligible,
    surfaceDisabled,
    lastFailure: options.refreshFailures[scopeKey] ?? null,
  };
}

export async function resolveChatGuideCatAssistReadModel(input: {
  chatStatePath: string;
  guideCatExists: boolean;
  runtimeReachable: boolean;
}): Promise<ChatGuideCatAssistReadModel> {
  const [config, cache] = await Promise.all([
    readGuideCatAssistConfig(input.chatStatePath),
    readGuideCatAssistCache(input.chatStatePath),
  ]);

  return {
    lobby: resolveSurfaceReadModel({
      scope: {
        surfaceId: 'lobby',
        surfaceMode: 'default',
        audienceState: 'default',
      },
      guideCatExists: input.guideCatExists,
      runtimeReachable: input.runtimeReachable,
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
      .reduce<Record<GuideCatAssistNewChatMode, GuideCatAssistSurfaceReadModel>>((acc, mode) => {
        const newChatMode = mode as GuideCatAssistNewChatMode;
        acc[newChatMode] = resolveSurfaceReadModel({
          scope: {
            surfaceId: 'chat:new',
            surfaceMode: newChatMode,
            audienceState: 'default',
          },
          guideCatExists: input.guideCatExists,
          runtimeReachable: input.runtimeReachable,
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
      }, {} as Record<GuideCatAssistNewChatMode, GuideCatAssistSurfaceReadModel>),
  };
}

export async function refreshGuideCatAssistEligibleScopes(input: {
  chatStatePath: string;
  guideCatExists: boolean;
  runtimeReachable: boolean;
  now?: Date;
  readModel?: ChatGuideCatAssistReadModel;
}): Promise<void> {
  if (!input.guideCatExists || !input.runtimeReachable) {
    return;
  }

  const [config, readModel] = await Promise.all([
    readGuideCatAssistConfig(input.chatStatePath),
    input.readModel
      ? Promise.resolve(input.readModel)
      : resolveChatGuideCatAssistReadModel({
        chatStatePath: input.chatStatePath,
        guideCatExists: input.guideCatExists,
        runtimeReachable: input.runtimeReachable,
      }),
  ]);
  const refreshableSurfaces = [
    readModel.lobby,
    ...Object.values(readModel.newChatByMode),
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
      await upsertGuideCatAssistBundle(input.chatStatePath, {
        ...surface.bundle,
        freshness: {
          ...surface.bundle.freshness,
          generatedAt,
          expiresAt,
          lastRefreshStatus: surface.cacheHit
            ? surface.bundle.freshness.lastRefreshStatus
            : 'skipped',
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

export function queueGuideCatAssistRefresh(input: {
  chatStatePath: string;
  guideCatExists: boolean;
  runtimeReachable: boolean;
  now?: Date;
  readModel?: ChatGuideCatAssistReadModel;
}): void {
  if (!input.guideCatExists || !input.runtimeReachable) {
    return;
  }
  if (guideCatAssistRefreshQueue.has(input.chatStatePath)) {
    return;
  }

  const refreshPromise = refreshGuideCatAssistEligibleScopes(input)
    .catch(() => {})
    .finally(() => {
      guideCatAssistRefreshQueue.delete(input.chatStatePath);
    });
  guideCatAssistRefreshQueue.set(input.chatStatePath, refreshPromise);
}
