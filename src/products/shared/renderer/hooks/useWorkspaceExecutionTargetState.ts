import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  getDefaultModel,
  getDefaultProviderInstance,
} from '../../../../shared/providerCatalog.js';
import {
  cloneProviderModelSelection,
  resolveCatalogTargetSelection,
  resolveSelectedProviderInstance,
  sameProviderModelSelection,
  type ProviderTargetSelection,
  type ProviderModelSelection,
} from '../../../../shared/providerSelection.js';
import {
  attachExecutionLabelToProviderTarget,
  resolveAdvancedCatalogFallback,
  sanitizePersistentTargetSelection,
  shouldDeferCatalogTargetReconciliation,
  shouldTreatPersistedTargetAsLegacyModel,
} from '../../../../design/components/providerModelFieldsSupport.js';
import {
  fetchAdvancedProviderModels,
  fetchProviderModels,
  fetchProviderRegistry,
} from '../api/providers.js';
import {
  isSoloThreadChannel,
} from '../../../chat/shared/channelTopology.js';
import {
  createExecutionTargetValueFromProviderSelection,
  type ExecutionTargetValue,
} from '../components/ExecutionTarget.js';
import type { RoomRoutingMode } from '../../../../shared/roomRouting.js';

export interface ExecutionTargetDefaultsLike {
  provider?: string | null;
  model?: string | null;
  instance?: string | null;
  modelSelection?: ProviderModelSelection | null;
}

export interface WorkspaceExecutionTargetPayloadLike {
  chat: {
    newChatDefaults: ExecutionTargetDefaultsLike | null | undefined;
  };
}

export interface WorkspaceExecutionTargetChatLike {
  newChatDefaults: ExecutionTargetDefaultsLike | null | undefined;
  globalOrchestrator: {
    executionTarget: {
      provider: string;
      model?: string | null;
      instance?: string | null;
    };
    executionModelSelection?: ProviderModelSelection | null;
  };
}

export interface WorkspaceExecutionTargetChannelLike {
  id: string;
  channelKind?: 'boss_thread' | 'direct_lane' | 'multi_cat_room' | null;
  roomRouting?: {
    mode?: RoomRoutingMode | null;
  } | null;
  assignedParticipants?: ReadonlyArray<{ participantId: string; status?: string | null }> | null;
  assignedCats?: ReadonlyArray<{ catId: string; status?: string | null }> | null;
  participantAssignments?: ReadonlyArray<{ participantId: string; status?: string | null }> | null;
  catAssignments?: ReadonlyArray<{ catId: string; status?: string | null }> | null;
  pendingProvider?: string | null;
  pendingModel?: string | null;
  pendingInstance?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
}

export interface PendingExecutionTargetUpdateInput {
  pendingProvider: string;
  pendingModel: string | null;
  pendingInstance: string | null;
  pendingModelSelection: ProviderModelSelection | null;
}

export interface PersistedNewChatDefaultsInput {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

export type WorkspaceExecutionTargetLoadState<
  TPayload extends WorkspaceExecutionTargetPayloadLike,
> =
  | { status: 'loading' }
  | { status: 'ready'; payload: TPayload }
  | { status: 'error'; message: string };

export interface UseWorkspaceExecutionTargetStateOptions<
  TPayload extends WorkspaceExecutionTargetPayloadLike,
  TChat extends WorkspaceExecutionTargetChatLike,
  TSelectedChannel extends WorkspaceExecutionTargetChannelLike,
> {
  state: WorkspaceExecutionTargetLoadState<TPayload>;
  readyChat: TChat | null;
  readySelectedChannel: TSelectedChannel | null;
  setState: Dispatch<SetStateAction<WorkspaceExecutionTargetLoadState<TPayload>>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  updateNewChatDefaultsPreference: (
    defaults: PersistedNewChatDefaultsInput,
    signal: AbortSignal,
  ) => Promise<TPayload>;
  updateChannelPendingExecutionTarget: (
    channelId: string,
    update: PendingExecutionTargetUpdateInput,
    signal: AbortSignal,
  ) => Promise<TPayload>;
  debounceMs?: number;
}

const RECONCILE_CACHE_TTL_MS = 5_000;

let cachedProviderRegistry:
  | {
      value: Awaited<ReturnType<typeof fetchProviderRegistry>>;
      expiresAt: number;
    }
  | null = null;
let inflightProviderRegistry:
  Promise<Awaited<ReturnType<typeof fetchProviderRegistry>>> | null = null;
const cachedProviderCatalogBundles = new Map<
  string,
  {
    value: {
      effectiveCatalog: Awaited<ReturnType<typeof fetchProviderModels>>;
      effectiveAdvancedCatalog: Awaited<ReturnType<typeof fetchAdvancedProviderModels>>;
    };
    expiresAt: number;
  }
>();
const inflightProviderCatalogBundles = new Map<
  string,
  Promise<{
    effectiveCatalog: Awaited<ReturnType<typeof fetchProviderModels>>;
    effectiveAdvancedCatalog: Awaited<ReturnType<typeof fetchAdvancedProviderModels>>;
  }>
>();

function logExecutionTargetReconcileWarning(
  message: string,
  error: unknown,
): void {
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    return;
  }

  console.warn(
    `[cats-platform] ${message}`,
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
}

function serializeExecutionTargetModelSelection(
  selection: ProviderModelSelection | null | undefined,
): string {
  const clonedSelection = cloneProviderModelSelection(selection);
  if (!clonedSelection) {
    return 'null';
  }

  const serializedControls = clonedSelection.controls
    ? Object.fromEntries(
      Object.keys(clonedSelection.controls)
        .sort()
        .map((key) => [key, clonedSelection.controls?.[key]]),
    )
    : undefined;

  return JSON.stringify({
    ...(clonedSelection.entryId ? { entryId: clonedSelection.entryId } : {}),
    entryMode: clonedSelection.entryMode,
    ...(clonedSelection.presetId ? { presetId: clonedSelection.presetId } : {}),
    ...(serializedControls ? { controls: serializedControls } : {}),
  });
}

function buildExecutionTargetReconcileSignature(
  target: ExecutionTargetValue,
): string {
  return JSON.stringify({
    provider: target.provider.trim(),
    instance: target.instance ?? null,
    model: target.model ?? null,
    modelSelection: serializeExecutionTargetModelSelection(target.modelSelection),
  });
}

function shouldUseExecutionTargetCatalogCache(input: {
  fetchProviderRegistryFn?: typeof fetchProviderRegistry;
  fetchProviderModelsFn?: typeof fetchProviderModels;
  fetchAdvancedProviderModelsFn?: typeof fetchAdvancedProviderModels;
}): boolean {
  return (input.fetchProviderRegistryFn ?? fetchProviderRegistry) === fetchProviderRegistry
    && (input.fetchProviderModelsFn ?? fetchProviderModels) === fetchProviderModels
    && (input.fetchAdvancedProviderModelsFn ?? fetchAdvancedProviderModels)
      === fetchAdvancedProviderModels;
}

async function readProviderRegistryCached(
  fetchProviderRegistryFn: typeof fetchProviderRegistry,
): Promise<Awaited<ReturnType<typeof fetchProviderRegistry>>> {
  const now = Date.now();
  if (cachedProviderRegistry && cachedProviderRegistry.expiresAt > now) {
    return cachedProviderRegistry.value;
  }

  if (inflightProviderRegistry) {
    return inflightProviderRegistry;
  }

  inflightProviderRegistry = fetchProviderRegistryFn()
    .then((value) => {
      cachedProviderRegistry = {
        value,
        expiresAt: Date.now() + RECONCILE_CACHE_TTL_MS,
      };
      return value;
    })
    .finally(() => {
      inflightProviderRegistry = null;
    });

  return inflightProviderRegistry;
}

async function readProviderCatalogBundleCached(input: {
  provider: string;
  instance: string | null;
  fetchProviderModelsFn: typeof fetchProviderModels;
  fetchAdvancedProviderModelsFn: typeof fetchAdvancedProviderModels;
}): Promise<{
  effectiveCatalog: Awaited<ReturnType<typeof fetchProviderModels>>;
  effectiveAdvancedCatalog: Awaited<ReturnType<typeof fetchAdvancedProviderModels>>;
}> {
  const cacheKey = `${input.provider}\u0000${input.instance ?? ''}`;
  const now = Date.now();
  const cachedBundle = cachedProviderCatalogBundles.get(cacheKey);
  if (cachedBundle && cachedBundle.expiresAt > now) {
    return cachedBundle.value;
  }

  const inflightBundle = inflightProviderCatalogBundles.get(cacheKey);
  if (inflightBundle) {
    return inflightBundle;
  }

  const bundlePromise = Promise.allSettled([
    input.fetchProviderModelsFn(input.provider, input.instance),
    input.fetchAdvancedProviderModelsFn(input.provider, input.instance),
  ]).then(([modelsResult, advancedResult]) => {
    if (modelsResult.status !== 'fulfilled') {
      throw modelsResult.reason;
    }

    const effectiveCatalog = modelsResult.value;
    const effectiveAdvancedCatalog = resolveAdvancedCatalogFallback({
      provider: input.provider,
      instance: input.instance,
      catalog: effectiveCatalog,
      advancedCatalogResult: advancedResult,
      modelsResult,
    });
    const value = {
      effectiveCatalog,
      effectiveAdvancedCatalog,
    };
    cachedProviderCatalogBundles.set(cacheKey, {
      value,
      expiresAt: Date.now() + RECONCILE_CACHE_TTL_MS,
    });
    return value;
  }).finally(() => {
    inflightProviderCatalogBundles.delete(cacheKey);
  });

  inflightProviderCatalogBundles.set(cacheKey, bundlePromise);
  return bundlePromise;
}

async function readProviderCatalogBundle(input: {
  provider: string;
  instance: string | null;
  fetchProviderModelsFn: typeof fetchProviderModels;
  fetchAdvancedProviderModelsFn: typeof fetchAdvancedProviderModels;
}): Promise<{
  effectiveCatalog: Awaited<ReturnType<typeof fetchProviderModels>>;
  effectiveAdvancedCatalog: Awaited<ReturnType<typeof fetchAdvancedProviderModels>>;
}> {
  const [modelsResult, advancedResult] = await Promise.allSettled([
    input.fetchProviderModelsFn(input.provider, input.instance),
    input.fetchAdvancedProviderModelsFn(input.provider, input.instance),
  ]);
  if (modelsResult.status !== 'fulfilled') {
    throw modelsResult.reason;
  }

  return {
    effectiveCatalog: modelsResult.value,
    effectiveAdvancedCatalog: resolveAdvancedCatalogFallback({
      provider: input.provider,
      instance: input.instance,
      catalog: modelsResult.value,
      advancedCatalogResult: advancedResult,
      modelsResult,
    }),
  };
}

export function createExecutionTargetValueForProvider(
  provider: string,
): ExecutionTargetValue {
  return {
    provider,
    model: getDefaultModel(provider) || null,
    instance: getDefaultProviderInstance(provider),
    modelSelection: null,
    executionLabel: null,
  };
}

export function createDefaultExecutionTargetValue(): ExecutionTargetValue {
  return createExecutionTargetValueForProvider('claude');
}

export function toExecutionTargetValue(
  defaults: ExecutionTargetDefaultsLike | null | undefined,
): ExecutionTargetValue {
  if (!defaults) {
    return createDefaultExecutionTargetValue();
  }

  const provider = defaults.provider?.trim() || 'claude';
  return {
    provider,
    model: defaults.model ?? (getDefaultModel(provider) || null),
    instance: defaults.instance ?? getDefaultProviderInstance(provider),
    modelSelection: defaults.modelSelection ?? null,
    executionLabel: null,
  };
}

export function sameExecutionTargetValue(
  left: ExecutionTargetValue,
  right: ExecutionTargetValue,
): boolean {
  return left.provider === right.provider
    && (left.instance ?? null) === (right.instance ?? null)
    && (left.model ?? null) === (right.model ?? null)
    && sameProviderModelSelection(left.modelSelection, right.modelSelection);
}

function sameExecutionTargetValueAndLabel(
  left: ExecutionTargetValue,
  right: ExecutionTargetValue,
): boolean {
  return sameExecutionTargetValue(left, right)
    && (left.executionLabel ?? null) === (right.executionLabel ?? null);
}

function mergeExecutionTargetValue(
  current: ExecutionTargetValue,
  next: ExecutionTargetValue,
): ExecutionTargetValue {
  if (!sameExecutionTargetValue(current, next)) {
    return next;
  }

  const nextExecutionLabel = next.executionLabel === null
    ? null
    : next.executionLabel ?? current.executionLabel ?? null;
  if ((current.executionLabel ?? null) === nextExecutionLabel) {
    return current;
  }

  return {
    ...current,
    executionLabel: nextExecutionLabel,
  };
}

function toProviderTargetSelection(
  target: ExecutionTargetValue,
): ProviderTargetSelection {
  return {
    provider: target.provider,
    instance: target.instance ?? '',
    model: target.model ?? '',
    modelSelection: target.modelSelection ?? null,
    executionLabel: target.executionLabel ?? null,
  };
}

export async function reconcileRuntimeBackedExecutionTargetValue(input: {
  target: ExecutionTargetValue;
  fetchProviderRegistryFn?: typeof fetchProviderRegistry;
  fetchProviderModelsFn?: typeof fetchProviderModels;
  fetchAdvancedProviderModelsFn?: typeof fetchAdvancedProviderModels;
}): Promise<ExecutionTargetValue> {
  const provider = input.target.provider.trim();
  if (!provider) {
    return input.target;
  }

  const fetchProviderRegistryFn = input.fetchProviderRegistryFn ?? fetchProviderRegistry;
  const fetchProviderModelsFn = input.fetchProviderModelsFn ?? fetchProviderModels;
  const fetchAdvancedProviderModelsFn =
    input.fetchAdvancedProviderModelsFn ?? fetchAdvancedProviderModels;
  const shouldUseCache = shouldUseExecutionTargetCatalogCache(input);
  const registry = shouldUseCache
    ? await readProviderRegistryCached(fetchProviderRegistryFn)
    : await fetchProviderRegistryFn();
  const selectedProvider = registry.providers.find((option) => option.id === provider);
  if (!selectedProvider) {
    return input.target;
  }

  const resolvedInstance = resolveSelectedProviderInstance(
    selectedProvider,
    input.target.instance ?? '',
  );
  let effectiveCatalog: Awaited<ReturnType<typeof fetchProviderModels>>;
  let effectiveAdvancedCatalog: Awaited<ReturnType<typeof fetchAdvancedProviderModels>>;
  try {
    const bundle = shouldUseCache
      ? await readProviderCatalogBundleCached({
          provider,
          instance: resolvedInstance || null,
          fetchProviderModelsFn,
          fetchAdvancedProviderModelsFn,
        })
      : await readProviderCatalogBundle({
          provider,
          instance: resolvedInstance || null,
          fetchProviderModelsFn,
          fetchAdvancedProviderModelsFn,
        });
    effectiveCatalog = bundle.effectiveCatalog;
    effectiveAdvancedCatalog = bundle.effectiveAdvancedCatalog;
  } catch {
    const normalizedFallbackTarget: ExecutionTargetValue = {
      ...input.target,
      instance: resolvedInstance || null,
    };
    return sameExecutionTargetValueAndLabel(input.target, normalizedFallbackTarget)
      ? input.target
      : normalizedFallbackTarget;
  }

  let nextTarget = toProviderTargetSelection({
    ...input.target,
    provider,
    instance: resolvedInstance || null,
  });

  const shouldDeferReconciliation = shouldDeferCatalogTargetReconciliation({
    catalogSource: effectiveCatalog.source,
    advancedCatalogSource: effectiveAdvancedCatalog.source,
    model: nextTarget.model,
    modelSelection: nextTarget.modelSelection,
  });
  if (!shouldDeferReconciliation && effectiveCatalog.models.length > 0) {
    const preserveExistingSelection =
      Boolean(nextTarget.modelSelection)
      || shouldTreatPersistedTargetAsLegacyModel({
        catalog: effectiveCatalog,
        model: nextTarget.model,
        modelSelection: nextTarget.modelSelection,
      });
    nextTarget = sanitizePersistentTargetSelection({
      target: resolveCatalogTargetSelection({
        target: nextTarget,
        catalog: effectiveCatalog,
        advancedCatalog: effectiveAdvancedCatalog,
        preserveCurrentModel: preserveExistingSelection,
        preserveCurrentSelection: preserveExistingSelection,
      }),
      controls: effectiveAdvancedCatalog.controls,
    });
  }

  const labeledTarget = nextTarget.model
    ? attachExecutionLabelToProviderTarget({
        target: nextTarget,
        effectiveCatalog,
        effectiveAdvancedCatalog,
      })
    : {
        ...nextTarget,
        executionLabel: null,
      };

  return createExecutionTargetValueFromProviderSelection(labeledTarget);
}

export function toSoloChannelExecutionTargetValue<
  TChat extends WorkspaceExecutionTargetChatLike,
  TSelectedChannel extends WorkspaceExecutionTargetChannelLike,
>(
  readyChat: TChat | null,
  readySelectedChannel: TSelectedChannel | null,
): ExecutionTargetValue | null {
  if (!readyChat || !readySelectedChannel || !isSoloThreadChannel(readySelectedChannel)) {
    return null;
  }

  return {
    provider:
      readySelectedChannel.pendingProvider
      ?? readyChat.globalOrchestrator.executionTarget.provider,
    model:
      readySelectedChannel.pendingModel
      ?? readyChat.globalOrchestrator.executionTarget.model
      ?? null,
    instance:
      readySelectedChannel.pendingInstance
      ?? readyChat.globalOrchestrator.executionTarget.instance
      ?? null,
    modelSelection:
      readySelectedChannel.pendingModelSelection
      ?? readyChat.globalOrchestrator.executionModelSelection
      ?? null,
    executionLabel: null,
  };
}

export function useWorkspaceExecutionTargetState<
  TPayload extends WorkspaceExecutionTargetPayloadLike,
  TChat extends WorkspaceExecutionTargetChatLike,
  TSelectedChannel extends WorkspaceExecutionTargetChannelLike,
>({
  state,
  readyChat,
  readySelectedChannel,
  setState,
  setFeedback,
  updateNewChatDefaultsPreference,
  updateChannelPendingExecutionTarget,
  debounceMs = 150,
}: UseWorkspaceExecutionTargetStateOptions<TPayload, TChat, TSelectedChannel>) {
  const [draftExecutionTarget, setDraftExecutionTarget] = useState<ExecutionTargetValue>(
    createDefaultExecutionTargetValue,
  );
  const [soloChannelExecutionTarget, setSoloChannelExecutionTarget] = useState<ExecutionTargetValue>(
    createDefaultExecutionTargetValue,
  );
  const latestNewChatDefaultsSaveId = useRef(0);
  const pendingNewChatDefaultsSaveTimeout = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingNewChatDefaultsSaveAbort = useRef<AbortController | null>(null);
  const latestSoloChannelExecutionTargetSaveId = useRef(0);
  const pendingSoloChannelExecutionTargetSaveTimeout = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingSoloChannelExecutionTargetSaveAbort = useRef<AbortController | null>(null);
  const draftExecutionTargetReconcileSignature = buildExecutionTargetReconcileSignature(
    draftExecutionTarget,
  );
  const soloChannelExecutionTargetReconcileSignature = buildExecutionTargetReconcileSignature(
    soloChannelExecutionTarget,
  );

  useEffect(() => {
    if (!readyChat) {
      return;
    }

    const nextDraftExecutionTarget = toExecutionTargetValue(readyChat.newChatDefaults);
    setDraftExecutionTarget((currentDraftExecutionTarget) =>
      mergeExecutionTargetValue(currentDraftExecutionTarget, nextDraftExecutionTarget));
  }, [
    readyChat?.newChatDefaults?.instance,
    readyChat?.newChatDefaults?.model,
    readyChat?.newChatDefaults?.modelSelection,
    readyChat?.newChatDefaults?.provider,
  ]);

  useEffect(() => {
    return () => {
      if (pendingNewChatDefaultsSaveTimeout.current) {
        clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
        pendingNewChatDefaultsSaveTimeout.current = null;
      }
      pendingNewChatDefaultsSaveAbort.current?.abort();
      pendingNewChatDefaultsSaveAbort.current = null;
      if (pendingSoloChannelExecutionTargetSaveTimeout.current) {
        clearTimeout(pendingSoloChannelExecutionTargetSaveTimeout.current);
        pendingSoloChannelExecutionTargetSaveTimeout.current = null;
      }
      pendingSoloChannelExecutionTargetSaveAbort.current?.abort();
      pendingSoloChannelExecutionTargetSaveAbort.current = null;
    };
  }, []);

  useEffect(() => {
    const nextSoloChannelExecutionTarget = toSoloChannelExecutionTargetValue(
      readyChat,
      readySelectedChannel,
    );
    if (!nextSoloChannelExecutionTarget) {
      return;
    }

    setSoloChannelExecutionTarget((currentSoloChannelExecutionTarget) =>
      mergeExecutionTargetValue(currentSoloChannelExecutionTarget, nextSoloChannelExecutionTarget));
  }, [
    readySelectedChannel?.id,
    readySelectedChannel?.channelKind,
    readySelectedChannel?.roomRouting?.mode,
    readySelectedChannel?.pendingProvider,
    readySelectedChannel?.pendingModel,
    readySelectedChannel?.pendingInstance,
    readySelectedChannel?.pendingModelSelection,
    readyChat?.globalOrchestrator.executionTarget.provider,
    readyChat?.globalOrchestrator.executionTarget.model,
    readyChat?.globalOrchestrator.executionTarget.instance,
    readyChat?.globalOrchestrator.executionModelSelection,
  ]);

  useEffect(() => {
    if (!readySelectedChannel || !isSoloThreadChannel(readySelectedChannel)) {
      return;
    }

    if (!readySelectedChannel.pendingProvider) {
      return;
    }

    const pendingProvider = readySelectedChannel.pendingProvider;

    setSoloChannelExecutionTarget((currentSoloChannelExecutionTarget) =>
      mergeExecutionTargetValue(currentSoloChannelExecutionTarget, {
        provider: pendingProvider,
        model: readySelectedChannel.pendingModel ?? null,
        instance: readySelectedChannel.pendingInstance ?? null,
        modelSelection: readySelectedChannel.pendingModelSelection ?? null,
        executionLabel: null,
      }));
  }, [readySelectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    let cancelled = false;

    void reconcileRuntimeBackedExecutionTargetValue({
      target: draftExecutionTarget,
    }).then((nextDraftExecutionTarget) => {
      if (cancelled) {
        return;
      }

      setDraftExecutionTarget((currentDraftExecutionTarget) =>
        mergeExecutionTargetValue(currentDraftExecutionTarget, nextDraftExecutionTarget));
    }).catch((error) => {
      logExecutionTargetReconcileWarning(
        `failed to reconcile draft execution target for ${draftExecutionTarget.provider}:${draftExecutionTarget.model ?? 'default'}`,
        error,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    draftExecutionTargetReconcileSignature,
    state.status,
  ]);

  useEffect(() => {
    if (state.status !== 'ready' || !readySelectedChannel || !isSoloThreadChannel(readySelectedChannel)) {
      return;
    }

    let cancelled = false;

    void reconcileRuntimeBackedExecutionTargetValue({
      target: soloChannelExecutionTarget,
    }).then((nextSoloChannelExecutionTarget) => {
      if (cancelled) {
        return;
      }

      setSoloChannelExecutionTarget((currentSoloChannelExecutionTarget) =>
        mergeExecutionTargetValue(currentSoloChannelExecutionTarget, nextSoloChannelExecutionTarget));
    }).catch((error) => {
      logExecutionTargetReconcileWarning(
        `failed to reconcile solo execution target for ${soloChannelExecutionTarget.provider}:${soloChannelExecutionTarget.model ?? 'default'}`,
        error,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    readySelectedChannel?.id,
    readySelectedChannel?.channelKind,
    readySelectedChannel?.roomRouting?.mode,
    soloChannelExecutionTargetReconcileSignature,
    state.status,
  ]);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const persistedDraftExecutionTarget = toExecutionTargetValue(
      state.payload.chat.newChatDefaults,
    );
    if (sameExecutionTargetValue(draftExecutionTarget, persistedDraftExecutionTarget)) {
      return;
    }

    if (pendingNewChatDefaultsSaveTimeout.current) {
      clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
      pendingNewChatDefaultsSaveTimeout.current = null;
    }
    pendingNewChatDefaultsSaveAbort.current?.abort();

    const saveId = latestNewChatDefaultsSaveId.current + 1;
    latestNewChatDefaultsSaveId.current = saveId;
    const controller = new AbortController();
    pendingNewChatDefaultsSaveAbort.current = controller;
    const nextDraftExecutionTarget: PersistedNewChatDefaultsInput = {
      provider: draftExecutionTarget.provider,
      instance: draftExecutionTarget.instance,
      model: draftExecutionTarget.model,
      modelSelection: draftExecutionTarget.modelSelection,
    };

    pendingNewChatDefaultsSaveTimeout.current = setTimeout(() => {
      pendingNewChatDefaultsSaveTimeout.current = null;

      void updateNewChatDefaultsPreference(nextDraftExecutionTarget, controller.signal)
        .then((payload) => {
          if (controller.signal.aborted || latestNewChatDefaultsSaveId.current !== saveId) {
            return;
          }
          pendingNewChatDefaultsSaveAbort.current = null;
          startTransition(() => setState({ status: 'ready', payload }));
        })
        .catch((error) => {
          if (controller.signal.aborted || latestNewChatDefaultsSaveId.current !== saveId) {
            return;
          }
          pendingNewChatDefaultsSaveAbort.current = null;
          setFeedback(
            error instanceof Error
              ? error.message
              : 'Failed to save new chat model defaults.',
          );
        });
    }, debounceMs);

    return () => {
      if (pendingNewChatDefaultsSaveTimeout.current) {
        clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
        pendingNewChatDefaultsSaveTimeout.current = null;
      }
      controller.abort();
    };
  }, [
    debounceMs,
    draftExecutionTarget.instance,
    draftExecutionTarget.model,
    draftExecutionTarget.modelSelection,
    draftExecutionTarget.provider,
    setFeedback,
    setState,
    state.status,
    state.status === 'ready'
      ? state.payload.chat.newChatDefaults?.instance ?? null
      : null,
    state.status === 'ready'
      ? state.payload.chat.newChatDefaults?.model ?? null
      : null,
    state.status === 'ready'
      ? state.payload.chat.newChatDefaults?.modelSelection ?? null
      : null,
    state.status === 'ready'
      ? state.payload.chat.newChatDefaults?.provider ?? null
      : null,
    updateNewChatDefaultsPreference,
  ]);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const persistedSoloChannelExecutionTarget = toSoloChannelExecutionTargetValue(
      readyChat,
      readySelectedChannel,
    );
    if (
      !readySelectedChannel
      || !persistedSoloChannelExecutionTarget
      || sameExecutionTargetValue(
        soloChannelExecutionTarget,
        persistedSoloChannelExecutionTarget,
      )
    ) {
      return;
    }

    if (pendingSoloChannelExecutionTargetSaveTimeout.current) {
      clearTimeout(pendingSoloChannelExecutionTargetSaveTimeout.current);
      pendingSoloChannelExecutionTargetSaveTimeout.current = null;
    }
    pendingSoloChannelExecutionTargetSaveAbort.current?.abort();

    const channelId = readySelectedChannel.id;
    const saveId = latestSoloChannelExecutionTargetSaveId.current + 1;
    latestSoloChannelExecutionTargetSaveId.current = saveId;
    const controller = new AbortController();
    pendingSoloChannelExecutionTargetSaveAbort.current = controller;
    const nextSoloChannelExecutionTarget = {
      pendingProvider: soloChannelExecutionTarget.provider,
      pendingModel: soloChannelExecutionTarget.model,
      pendingInstance: soloChannelExecutionTarget.instance,
      pendingModelSelection: soloChannelExecutionTarget.modelSelection,
    };

    pendingSoloChannelExecutionTargetSaveTimeout.current = setTimeout(() => {
      pendingSoloChannelExecutionTargetSaveTimeout.current = null;

      void updateChannelPendingExecutionTarget(
        channelId,
        nextSoloChannelExecutionTarget,
        controller.signal,
      )
        .then((payload) => {
          if (
            controller.signal.aborted
            || latestSoloChannelExecutionTargetSaveId.current !== saveId
          ) {
            return;
          }
          pendingSoloChannelExecutionTargetSaveAbort.current = null;
          startTransition(() => setState({ status: 'ready', payload }));
        })
        .catch((error) => {
          if (
            controller.signal.aborted
            || latestSoloChannelExecutionTargetSaveId.current !== saveId
          ) {
            return;
          }
          pendingSoloChannelExecutionTargetSaveAbort.current = null;
          setFeedback(
            error instanceof Error
              ? error.message
              : 'Failed to save this chat AI reply settings.',
          );
        });
    }, debounceMs);

    return () => {
      if (pendingSoloChannelExecutionTargetSaveTimeout.current) {
        clearTimeout(pendingSoloChannelExecutionTargetSaveTimeout.current);
        pendingSoloChannelExecutionTargetSaveTimeout.current = null;
      }
      controller.abort();
    };
  }, [
    debounceMs,
    readyChat?.globalOrchestrator.executionTarget.provider,
    readyChat?.globalOrchestrator.executionTarget.model,
    readyChat?.globalOrchestrator.executionTarget.instance,
    readyChat?.globalOrchestrator.executionModelSelection,
    readySelectedChannel?.id,
    readySelectedChannel?.channelKind,
    readySelectedChannel?.roomRouting?.mode,
    readySelectedChannel?.pendingProvider,
    readySelectedChannel?.pendingModel,
    readySelectedChannel?.pendingInstance,
    readySelectedChannel?.pendingModelSelection,
    setFeedback,
    setState,
    soloChannelExecutionTarget.instance,
    soloChannelExecutionTarget.model,
    soloChannelExecutionTarget.modelSelection,
    soloChannelExecutionTarget.provider,
    state.status,
    updateChannelPendingExecutionTarget,
  ]);

  return {
    draftExecutionTarget,
    setDraftExecutionTarget,
    soloChannelExecutionTarget,
    setSoloChannelExecutionTarget,
  };
}
