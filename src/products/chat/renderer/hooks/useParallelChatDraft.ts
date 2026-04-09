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
import { PRODUCT_PROVIDER_ORDER } from '../../../../shared/providerCatalog.js';
import type { ModelSelectorValue } from '../components/ModelSelector.js';
import type { SelectedChannelView } from '../../shared/channelEntry.js';
import { relayParallelChatMessage } from '../api/index.js';

type LoadStateLike =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

function createInitialCompareTargets(baseTarget: ModelSelectorValue): ModelSelectorValue[] {
  const fallbackProvider = PRODUCT_PROVIDER_ORDER.find((provider) => provider !== baseTarget.provider)
    ?? 'codex';

  return [
    baseTarget,
    {
      provider: fallbackProvider,
      model: null,
      instance: null,
      modelSelection: null,
    },
  ];
}

function createNextCompareTarget(
  currentTargets: ModelSelectorValue[],
  fallbackTarget: ModelSelectorValue,
): ModelSelectorValue {
  const nextProvider = PRODUCT_PROVIDER_ORDER.find((provider) =>
    !currentTargets.some((target) => target.provider === provider),
  ) ?? PRODUCT_PROVIDER_ORDER.find((provider) => provider !== fallbackTarget.provider)
    ?? fallbackTarget.provider;

  return {
    provider: nextProvider,
    model: null,
    instance: null,
    modelSelection: null,
  };
}

export function useParallelChatDraft(options: {
  readyPayload: AppShellPayload | null;
  selectedChannel: SelectedChannelView | null;
  draftModel: ModelSelectorValue;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  setBusy: Dispatch<SetStateAction<string>>;
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
  const [draftParallelChatTargets, setDraftParallelChatTargets] = useState<ModelSelectorValue[]>(
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
  }, [
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
  ]);

  useEffect(() => {
    setCompareSendScope('all_members');
  }, [selectedParallelChatGroup?.id]);

  const onDraftParallelChatTargetChange = useCallback((index: number, value: ModelSelectorValue) => {
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
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
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

    setBusy('parallelChat:relay');
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
      setBusy('');
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
