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
import type { ExecutionTargetValue } from '../../../shared/renderer/components/ExecutionTarget.js';
import type { SelectedChannelView } from '../../shared/channelEntry.js';
import { relayParallelChatMessage } from '../api/index.js';
import {
  createDraftParallelBranch,
  createDraftParallelBranches,
  mergeDraftParallelTargetBranchFields,
  updateDraftParallelBranchAt,
} from '../../../shared/renderer/draftParallelBranches.js';

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
  const [draftParallelBranches, setDraftParallelBranches] = useState(
    () => createDraftParallelBranches(
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
  const draftParallelChatTargets = useMemo(
    () => draftParallelBranches.map((branch) => branch.target),
    [draftParallelBranches],
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
    setDraftParallelBranches(createDraftParallelBranches(
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
    setDraftParallelBranches((currentBranches) =>
      updateDraftParallelBranchAt(currentBranches, 0, (branch) => ({
        ...branch,
        target: mergeDraftParallelTargetBranchFields(
          syncLeadCompareTarget([branch.target], draftExecutionTarget)[0] ?? draftExecutionTarget,
          branch.target,
        ),
      })));
  }, [draftExecutionTarget]);

  const onDraftParallelChatTargetChange = useCallback((index: number, value: ExecutionTargetValue) => {
    setDraftParallelBranches((prev) =>
      updateDraftParallelBranchAt(prev, index, (branch) => ({
        ...branch,
        target: mergeDraftParallelTargetBranchFields(value, branch.target),
      })),
    );
  }, []);

  const onAddDraftParallelChatTarget = useCallback((options?: {
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  }) => {
    setDraftParallelBranches((prev) => {
      const nextTarget = createNextCompareTarget(
        prev.map((branch) => branch.target),
        draftExecutionTarget,
      );
      const seedBranch = prev[0] ?? null;
      const audienceKeys = options?.seedAudienceKeys ?? seedBranch?.target.audienceKeys ?? [];
      const workflowShape = options?.seedWorkflowShape
        ?? seedBranch?.target.workflowShape
        ?? 'sequential';
      return [
        ...prev,
        createDraftParallelBranch(nextTarget, { audienceKeys, workflowShape }),
      ];
    });
  }, [
    draftExecutionTarget,
  ]);

  const onRemoveDraftParallelChatTarget = useCallback((index: number) => {
    setDraftParallelBranches((prev) => {
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
    setDraftParallelBranches((prev) =>
      updateDraftParallelBranchAt(prev, index, (branch) => ({
        ...branch,
        target: {
          ...branch.target,
          audienceKeys: [...keys],
        },
      })),
    );
  }, []);

  const onToggleDraftParallelBranchWorkflowShape = useCallback((index: number) => {
    setDraftParallelBranches((prev) =>
      updateDraftParallelBranchAt(prev, index, (branch) => ({
        ...branch,
        target: {
          ...branch.target,
          workflowShape: branch.target.workflowShape === 'concurrent' ? 'sequential' : 'concurrent',
        },
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
    draftParallelBranches,
    draftParallelChatTargets,
    compareSendScope,
    setCompareSendScope,
    selectedParallelChatGroup,
    resetDraftParallelChatTargets,
    onDraftParallelChatTargetChange,
    onAddDraftParallelChatTarget,
    onRemoveDraftParallelChatTarget,
    onSetDraftParallelBranchAudienceKeys,
    onToggleDraftParallelBranchWorkflowShape,
    onRelayCompareMessage,
  };
}
