import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type {
  AppShellPayload,
  ParallelChatRelayCommandKind,
} from '../../api/contracts.js';
import {
  PRODUCT_PROVIDER_ORDER,
  getDefaultModel,
  getDefaultProviderInstance,
} from '../../../../shared/providerCatalog.js';
import {
  clearBusyState,
  createParallelChatBusyState,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import type { ExecutionTargetValue } from '../components/ExecutionTarget.js';
import type { SelectedChannelView } from '../../shared/channelEntry.js';
import { relayParallelChatMessage } from '../api/index.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

export function createDefaultTargetForProvider(provider: string): ExecutionTargetValue {
  return {
    provider,
    model: getDefaultModel(provider) || null,
    instance: getDefaultProviderInstance(provider),
    modelSelection: null,
  };
}

export function createInitialCompareTargets(baseTarget: ExecutionTargetValue): ExecutionTargetValue[] {
  const fallbackProvider = PRODUCT_PROVIDER_ORDER.find((provider) => provider !== baseTarget.provider)
    ?? 'codex';

  return [
    baseTarget,
    createDefaultTargetForProvider(fallbackProvider),
  ];
}

export function syncLeadCompareTarget(
  currentTargets: ExecutionTargetValue[],
  leadTarget: ExecutionTargetValue,
): ExecutionTargetValue[] {
  if (currentTargets.length === 0) {
    return currentTargets;
  }

  const currentLeadTarget = currentTargets[0];
  if (
    currentLeadTarget?.provider === leadTarget.provider
    && (currentLeadTarget.instance ?? null) === (leadTarget.instance ?? null)
    && (currentLeadTarget.model ?? null) === (leadTarget.model ?? null)
    && JSON.stringify(currentLeadTarget.modelSelection ?? null)
      === JSON.stringify(leadTarget.modelSelection ?? null)
  ) {
    return currentTargets;
  }

  return [
    {
      provider: leadTarget.provider,
      model: leadTarget.model,
      instance: leadTarget.instance,
      modelSelection: leadTarget.modelSelection,
    },
    ...currentTargets.slice(1),
  ];
}

export function createNextCompareTarget(
  currentTargets: ExecutionTargetValue[],
  fallbackTarget: ExecutionTargetValue,
): ExecutionTargetValue {
  const nextProvider = PRODUCT_PROVIDER_ORDER.find((provider) =>
    !currentTargets.some((target) => target.provider === provider),
  ) ?? PRODUCT_PROVIDER_ORDER.find((provider) => provider !== fallbackTarget.provider)
    ?? fallbackTarget.provider;

  if (nextProvider === fallbackTarget.provider) {
    return {
      provider: fallbackTarget.provider,
      model: fallbackTarget.model,
      instance: fallbackTarget.instance,
      modelSelection: fallbackTarget.modelSelection,
    };
  }

  return createDefaultTargetForProvider(nextProvider);
}

export function useParallelChatDraft(options: {
  readyPayload: AppShellPayload | null;
  selectedChannel: SelectedChannelView | null;
  draftModel: ExecutionTargetValue;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
}) {
  const {
    readyPayload,
    selectedChannel,
    draftModel,
    setState,
    setBusy,
    setFeedback,
  } = options;
  const [draftParallelChatTargets, setDraftParallelChatTargets] = useState<ExecutionTargetValue[]>(
    () => createInitialCompareTargets({
      provider: draftModel.provider,
      model: draftModel.model,
      instance: draftModel.instance,
      modelSelection: draftModel.modelSelection,
    }),
  );
  const [compareSendScope, setCompareSendScope] = useState<'all_members' | 'active_only'>(
    'all_members',
  );

  const selectedParallelChatGroup = useMemo(
    () => readyPayload && selectedChannel
      ? readyPayload.chat.parallelChatGroups.find((group) =>
          group.memberChannelIds.includes(selectedChannel.id),
        ) ?? null
      : null,
    [readyPayload, selectedChannel],
  );

  const resetDraftParallelChatTargets = useCallback(() => {
    setDraftParallelChatTargets(createInitialCompareTargets(draftModel));
  }, [draftModel]);

  useEffect(() => {
    setCompareSendScope('all_members');
  }, [selectedParallelChatGroup?.id]);

  useEffect(() => {
    setDraftParallelChatTargets((currentTargets) =>
      syncLeadCompareTarget(currentTargets, draftModel));
  }, [draftModel]);

  const onDraftParallelChatTargetChange = useCallback((index: number, value: ExecutionTargetValue) => {
    setDraftParallelChatTargets((prev) =>
      prev.map((target, currentIndex) => (currentIndex === index ? value : target)),
    );
  }, []);

  const onAddDraftParallelChatTarget = useCallback(() => {
    setDraftParallelChatTargets((prev) => [
      ...prev,
      createNextCompareTarget(prev, draftModel),
    ]);
  }, [
    draftModel,
  ]);

  const onRemoveDraftParallelChatTarget = useCallback((index: number) => {
    setDraftParallelChatTargets((prev) => {
      if (prev.length <= 2) {
        return prev;
      }

      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }, []);

  const onRelayCompareMessage = useCallback(async (
    messageId: string,
    command: ParallelChatRelayCommandKind,
  ): Promise<void> => {
    if (!selectedChannel || !selectedParallelChatGroup) {
      return;
    }

    setBusy(createParallelChatBusyState('relay'));
    setFeedback('');
    try {
      const dispatch = await relayParallelChatMessage(selectedParallelChatGroup.id, {
        activeChannelId: selectedChannel.id,
        sourceChannelId: selectedChannel.id,
        sourceMessageId: messageId,
        command,
        targetPolicy: 'all_others',
      });
      startTransition(() => setState({ status: 'ready', payload: dispatch.appShell }));

      const failures = dispatch.results.filter((result) => result.status === 'error');
      if (failures.length > 0) {
        setFeedback(
          failures
            .map((result) => result.error || `Relay failed for ${result.channelId}.`)
            .join(' '),
        );
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to relay compare message.');
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    selectedChannel,
    selectedParallelChatGroup,
    setBusy,
    setFeedback,
    setState,
  ]);

  return {
    draftParallelChatTargets,
    compareSendScope,
    setCompareSendScope,
    selectedParallelChatGroup,
    resetDraftParallelChatTargets,
    onDraftParallelChatTargetChange,
    onAddDraftParallelChatTarget,
    onRemoveDraftParallelChatTarget,
    onRelayCompareMessage,
  };
}

