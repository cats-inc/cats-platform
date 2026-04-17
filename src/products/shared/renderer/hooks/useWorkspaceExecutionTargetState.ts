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
  sameProviderModelSelection,
  type ProviderModelSelection,
} from '../../../../shared/providerSelection.js';
import type { ExecutionTargetValue } from '../components/ExecutionTarget.js';

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
  composerMode?: string | null;
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

export function toSoloChannelExecutionTargetValue<
  TChat extends WorkspaceExecutionTargetChatLike,
  TSelectedChannel extends WorkspaceExecutionTargetChannelLike,
>(
  readyChat: TChat | null,
  readySelectedChannel: TSelectedChannel | null,
): ExecutionTargetValue | null {
  if (!readyChat || !readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
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
  const [draftModel, setDraftModel] = useState<ExecutionTargetValue>(
    createDefaultExecutionTargetValue,
  );
  const [soloChannelModel, setSoloChannelModel] = useState<ExecutionTargetValue>(
    createDefaultExecutionTargetValue,
  );
  const latestNewChatDefaultsSaveId = useRef(0);
  const pendingNewChatDefaultsSaveTimeout = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingNewChatDefaultsSaveAbort = useRef<AbortController | null>(null);
  const latestSoloChannelModelSaveId = useRef(0);
  const pendingSoloChannelModelSaveTimeout = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingSoloChannelModelSaveAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!readyChat) {
      return;
    }

    const nextDraftModel = toExecutionTargetValue(readyChat.newChatDefaults);
    setDraftModel((currentDraftModel) =>
      sameExecutionTargetValue(currentDraftModel, nextDraftModel)
        ? currentDraftModel
        : nextDraftModel);
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
      if (pendingSoloChannelModelSaveTimeout.current) {
        clearTimeout(pendingSoloChannelModelSaveTimeout.current);
        pendingSoloChannelModelSaveTimeout.current = null;
      }
      pendingSoloChannelModelSaveAbort.current?.abort();
      pendingSoloChannelModelSaveAbort.current = null;
    };
  }, []);

  useEffect(() => {
    const nextSoloChannelModel = toSoloChannelExecutionTargetValue(
      readyChat,
      readySelectedChannel,
    );
    if (!nextSoloChannelModel) {
      return;
    }

    setSoloChannelModel(nextSoloChannelModel);
  }, [
    readySelectedChannel?.id,
    readySelectedChannel?.composerMode,
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
    if (!readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
      return;
    }

    if (!readySelectedChannel.pendingProvider) {
      return;
    }

    setSoloChannelModel({
      provider: readySelectedChannel.pendingProvider,
      model: readySelectedChannel.pendingModel ?? null,
      instance: readySelectedChannel.pendingInstance ?? null,
      modelSelection: readySelectedChannel.pendingModelSelection ?? null,
    });
  }, [readySelectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const persistedDraftModel = toExecutionTargetValue(
      state.payload.chat.newChatDefaults,
    );
    if (sameExecutionTargetValue(draftModel, persistedDraftModel)) {
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
    const nextDraftModel: PersistedNewChatDefaultsInput = {
      provider: draftModel.provider,
      instance: draftModel.instance,
      model: draftModel.model,
      modelSelection: draftModel.modelSelection,
    };

    pendingNewChatDefaultsSaveTimeout.current = setTimeout(() => {
      pendingNewChatDefaultsSaveTimeout.current = null;

      void updateNewChatDefaultsPreference(nextDraftModel, controller.signal)
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
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
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

    const persistedSoloModel = toSoloChannelExecutionTargetValue(
      readyChat,
      readySelectedChannel,
    );
    if (
      !readySelectedChannel
      || !persistedSoloModel
      || sameExecutionTargetValue(soloChannelModel, persistedSoloModel)
    ) {
      return;
    }

    if (pendingSoloChannelModelSaveTimeout.current) {
      clearTimeout(pendingSoloChannelModelSaveTimeout.current);
      pendingSoloChannelModelSaveTimeout.current = null;
    }
    pendingSoloChannelModelSaveAbort.current?.abort();

    const channelId = readySelectedChannel.id;
    const saveId = latestSoloChannelModelSaveId.current + 1;
    latestSoloChannelModelSaveId.current = saveId;
    const controller = new AbortController();
    pendingSoloChannelModelSaveAbort.current = controller;
    const nextSoloModel = {
      pendingProvider: soloChannelModel.provider,
      pendingModel: soloChannelModel.model,
      pendingInstance: soloChannelModel.instance,
      pendingModelSelection: soloChannelModel.modelSelection,
    };

    pendingSoloChannelModelSaveTimeout.current = setTimeout(() => {
      pendingSoloChannelModelSaveTimeout.current = null;

      void updateChannelPendingExecutionTarget(
        channelId,
        nextSoloModel,
        controller.signal,
      )
        .then((payload) => {
          if (controller.signal.aborted || latestSoloChannelModelSaveId.current !== saveId) {
            return;
          }
          pendingSoloChannelModelSaveAbort.current = null;
          startTransition(() => setState({ status: 'ready', payload }));
        })
        .catch((error) => {
          if (controller.signal.aborted || latestSoloChannelModelSaveId.current !== saveId) {
            return;
          }
          pendingSoloChannelModelSaveAbort.current = null;
          setFeedback(
            error instanceof Error
              ? error.message
              : 'Failed to save this chat AI reply settings.',
          );
        });
    }, debounceMs);

    return () => {
      if (pendingSoloChannelModelSaveTimeout.current) {
        clearTimeout(pendingSoloChannelModelSaveTimeout.current);
        pendingSoloChannelModelSaveTimeout.current = null;
      }
      controller.abort();
    };
  }, [
    debounceMs,
    readyChat,
    readySelectedChannel,
    setFeedback,
    setState,
    soloChannelModel.instance,
    soloChannelModel.model,
    soloChannelModel.modelSelection,
    soloChannelModel.provider,
    state.status,
    updateChannelPendingExecutionTarget,
  ]);

  return {
    draftModel,
    setDraftModel,
    soloChannelModel,
    setSoloChannelModel,
  };
}


