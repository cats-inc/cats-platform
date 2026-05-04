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
import type { DraftRoomWorkflowShape } from '../../../../shared/roomRouting.js';
import type { RuntimeSessionPolicy } from '../../../../shared/runtimeSessionPolicy.js';
import type { ExecutionTargetValue } from '../../../shared/renderer/components/ExecutionTarget.js';
import type { SelectedChannelView } from '../../shared/channelEntry.js';
import { relayParallelChatMessage } from '../api/index.js';
import {
  createDraftParallelTarget,
  createDraftParallelTargets,
  mergeDraftParallelTargetBranchFields,
  setDraftParallelTargetCwd,
  setDraftParallelTargetPromptOverride,
  setDraftParallelTargetRuntimeSessionPolicy,
  updateDraftParallelTargetAt,
} from '../../../shared/renderer/draftParallelTargets.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../../shared/i18n/index.js';

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
  return createInitialCompareTargetsWithOptions(baseTarget);
}

function createInitialCompareTargetsWithOptions(
  baseTarget: ExecutionTargetValue,
  options: {
    includeCompareTarget?: boolean;
  } = {},
): ExecutionTargetValue[] {
  if (options.includeCompareTarget === false) {
    return [baseTarget];
  }

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
  draftExecutionTarget: ExecutionTargetValue;
  setState: Dispatch<SetStateAction<LoadStateLike>>;
  setBusy: Dispatch<SetStateAction<WorkspaceBusyState>>;
  setFeedback: Dispatch<SetStateAction<string>>;
  seedCompareTarget?: boolean;
}) {
  const {
    readyPayload,
    selectedChannel,
    draftExecutionTarget,
    setState,
    setBusy,
    setFeedback,
    seedCompareTarget = true,
  } = options;
  const { locale, t } = useI18n();
  const [draftParallelChatTargets, setDraftParallelChatTargets] = useState(
    () => createDraftParallelTargets(
      createInitialCompareTargetsWithOptions({
        provider: draftExecutionTarget.provider,
        model: draftExecutionTarget.model,
        instance: draftExecutionTarget.instance,
        modelSelection: draftExecutionTarget.modelSelection,
      }, {
        includeCompareTarget: seedCompareTarget,
      }),
    ),
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

  const resetDraftParallelChatTargets = useCallback((options?: {
    includeCompareTarget?: boolean;
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  }) => {
    setDraftParallelChatTargets(createDraftParallelTargets(
      createInitialCompareTargetsWithOptions(draftExecutionTarget, {
        includeCompareTarget: options?.includeCompareTarget ?? seedCompareTarget,
      }),
      {
        seedAudienceKeys: options?.seedAudienceKeys,
        seedWorkflowShape: options?.seedWorkflowShape,
      },
    ));
  }, [draftExecutionTarget, seedCompareTarget]);

  useEffect(() => {
    setCompareSendScope('all_members');
  }, [selectedParallelChatGroup?.id]);

  useEffect(() => {
    setDraftParallelChatTargets((currentTargets) =>
      updateDraftParallelTargetAt(currentTargets, 0, (target) =>
        mergeDraftParallelTargetBranchFields(
          syncLeadCompareTarget([target], draftExecutionTarget)[0] ?? draftExecutionTarget,
          target,
        )));
  }, [draftExecutionTarget]);

  const onDraftParallelChatTargetChange = useCallback((index: number, value: ExecutionTargetValue) => {
    setDraftParallelChatTargets((prev) =>
      updateDraftParallelTargetAt(prev, index, (target) =>
        mergeDraftParallelTargetBranchFields(value, target)),
    );
  }, []);

  const onAddDraftParallelChatTarget = useCallback((options?: {
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  }) => {
    setDraftParallelChatTargets((prev) => {
      const nextTarget = createNextCompareTarget(
        prev,
        draftExecutionTarget,
      );
      const seedTarget = prev[0] ?? null;
      const audienceKeys = options?.seedAudienceKeys ?? seedTarget?.audienceKeys ?? [];
      const workflowShape = options?.seedWorkflowShape
        ?? seedTarget?.workflowShape
        ?? 'sequential';
      return [
        ...prev,
        createDraftParallelTarget(nextTarget, { audienceKeys, workflowShape }),
      ];
    });
  }, [
    draftExecutionTarget,
  ]);

  const onRemoveDraftParallelChatTarget = useCallback((index: number) => {
    setDraftParallelChatTargets((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }, []);

  const onSetDraftParallelBranchAudienceKeys = useCallback((
    index: number,
    keys: string[],
  ) => {
    setDraftParallelChatTargets((prev) =>
      updateDraftParallelTargetAt(prev, index, (target) => ({
        ...target,
        audienceKeys: [...keys],
      })),
    );
  }, []);

  const onSetDraftParallelBranchCwd = useCallback((index: number, cwd: string | null) => {
    setDraftParallelChatTargets((prev) => setDraftParallelTargetCwd(prev, index, cwd));
  }, []);

  const onSetDraftParallelBranchRuntimeSessionPolicy = useCallback((
    index: number,
    runtimeSessionPolicy: RuntimeSessionPolicy | null,
  ) => {
    setDraftParallelChatTargets((prev) =>
      setDraftParallelTargetRuntimeSessionPolicy(prev, index, runtimeSessionPolicy),
    );
  }, []);

  const onSetDraftParallelBranchPromptOverride = useCallback((
    index: number,
    promptOverride: string | null,
  ) => {
    setDraftParallelChatTargets((prev) =>
      setDraftParallelTargetPromptOverride(prev, index, promptOverride),
    );
  }, []);

  const onToggleDraftParallelBranchWorkflowShape = useCallback((index: number) => {
    setDraftParallelChatTargets((prev) =>
      updateDraftParallelTargetAt(prev, index, (target) => ({
        ...target,
        workflowShape: target.workflowShape === 'concurrent' ? 'sequential' : 'concurrent',
      })),
    );
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
        locale,
      });
      startTransition(() => setState({ status: 'ready', payload: dispatch.appShell }));

      const failures = dispatch.results.filter((result) => result.status === 'error');
      if (failures.length > 0) {
        setFeedback(
          failures
            .map((result) => result.error || t(messageKeys.chatComposerErrorRelayFailedForChannel, {
              channelId: result.channelId,
            }))
            .join(' '),
        );
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.chatComposerErrorRelayCompareFailed));
    } finally {
      setBusy(clearBusyState());
    }
  }, [
    selectedChannel,
    selectedParallelChatGroup,
    setBusy,
    setFeedback,
    setState,
    locale,
    t,
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
    onSetDraftParallelBranchAudienceKeys,
    onSetDraftParallelBranchCwd,
    onSetDraftParallelBranchRuntimeSessionPolicy,
    onSetDraftParallelBranchPromptOverride,
    onToggleDraftParallelBranchWorkflowShape,
    onRelayCompareMessage,
  };
}
