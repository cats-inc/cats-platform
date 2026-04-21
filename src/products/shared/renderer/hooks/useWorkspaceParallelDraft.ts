import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { DraftRoomWorkflowShape } from '../../../../shared/roomRouting.js';

import {
  createInitialParallelTargets,
  createNextParallelTarget,
  syncLeadParallelTarget,
} from '../draftChatUtils.js';
import type { WorkspaceExecutionTargetValue } from './useWorkspaceComposerSubmit.js';
import {
  createDraftParallelBranch,
  createDraftParallelBranches,
  updateDraftParallelBranchAt,
} from '../draftParallelBranches.js';

export function useWorkspaceParallelDraft(options: {
  draftExecutionTarget: WorkspaceExecutionTargetValue;
  maxParallelChats: number;
  seedCompareTarget?: boolean;
}) {
  const {
    draftExecutionTarget,
    maxParallelChats,
    seedCompareTarget = true,
  } = options;
  const [draftParallelBranches, setDraftParallelBranches] = useState(
    () => createDraftParallelBranches(
      createInitialParallelTargets({
        provider: draftExecutionTarget.provider,
        model: draftExecutionTarget.model,
        instance: draftExecutionTarget.instance,
        modelSelection: draftExecutionTarget.modelSelection,
      }, {
        includeCompareTarget: seedCompareTarget,
      }),
    ),
  );
  const draftParallelChatTargets = useMemo(
    () => draftParallelBranches.map((branch) => branch.target),
    [draftParallelBranches],
  );

  const resetDraftParallelChatTargets = useCallback((options?: {
    includeCompareTarget?: boolean;
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  }) => {
    setDraftParallelBranches(createDraftParallelBranches(
      createInitialParallelTargets(draftExecutionTarget, {
        includeCompareTarget: options?.includeCompareTarget ?? seedCompareTarget,
      }),
      {
        seedAudienceKeys: options?.seedAudienceKeys,
        seedWorkflowShape: options?.seedWorkflowShape,
      },
    ));
  }, [draftExecutionTarget, seedCompareTarget]);

  useEffect(() => {
    setDraftParallelBranches((currentBranches) =>
      updateDraftParallelBranchAt(currentBranches, 0, (branch) => ({
        ...branch,
        target: syncLeadParallelTarget([branch.target], draftExecutionTarget)[0] ?? draftExecutionTarget,
      })));
  }, [draftExecutionTarget]);

  const onDraftParallelChatTargetChange = useCallback((index: number, value: WorkspaceExecutionTargetValue) => {
    setDraftParallelBranches((prev) =>
      updateDraftParallelBranchAt(prev, index, (branch) => ({
        ...branch,
        target: value,
      })),
    );
  }, []);

  const onAddDraftParallelChatTarget = useCallback((options?: {
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  }) => {
    setDraftParallelBranches((prev) => {
      if (prev.length >= maxParallelChats) {
        return prev;
      }

      const seedBranch = prev[0] ?? null;
      const audienceKeys = options?.seedAudienceKeys ?? seedBranch?.audienceKeys ?? [];
      const workflowShape = options?.seedWorkflowShape
        ?? seedBranch?.workflowShape
        ?? 'sequential';
      return [
        ...prev,
        createDraftParallelBranch(
          createNextParallelTarget(
            prev.map((branch) => branch.target),
            draftExecutionTarget,
          ),
          { audienceKeys, workflowShape },
        ),
      ];
    });
  }, [
    draftExecutionTarget,
    maxParallelChats,
  ]);

  const onRemoveDraftParallelChatTarget = useCallback((index: number) => {
    setDraftParallelBranches((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }, []);

  const onSetDraftParallelBranchAudienceKeys = useCallback((index: number, keys: string[]) => {
    setDraftParallelBranches((prev) =>
      updateDraftParallelBranchAt(prev, index, (branch) => ({
        ...branch,
        audienceKeys: [...keys],
      })),
    );
  }, []);

  const onToggleDraftParallelBranchWorkflowShape = useCallback((index: number) => {
    setDraftParallelBranches((prev) =>
      updateDraftParallelBranchAt(prev, index, (branch) => ({
        ...branch,
        workflowShape: branch.workflowShape === 'concurrent' ? 'sequential' : 'concurrent',
      })),
    );
  }, []);

  return {
    draftParallelBranches,
    draftParallelChatTargets,
    resetDraftParallelChatTargets,
    onDraftParallelChatTargetChange,
    onAddDraftParallelChatTarget,
    onRemoveDraftParallelChatTarget,
    onSetDraftParallelBranchAudienceKeys,
    onToggleDraftParallelBranchWorkflowShape,
  };
}
