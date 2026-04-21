import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { DraftRoomWorkflowShape } from '../../../../shared/roomRouting.js';
import type { RuntimeSessionPolicy } from '../../../../shared/runtimeSessionPolicy.js';

import {
  createInitialParallelTargets,
  createNextParallelTarget,
  syncLeadParallelTarget,
} from '../draftChatUtils.js';
import type { WorkspaceExecutionTargetValue } from './useWorkspaceComposerSubmit.js';
import {
  createDraftParallelTarget,
  createDraftParallelTargets,
  mergeDraftParallelTargetBranchFields,
  setDraftParallelTargetCwd,
  setDraftParallelTargetPromptOverride,
  setDraftParallelTargetRuntimeSessionPolicy,
  updateDraftParallelTargetAt,
} from '../draftParallelTargets.js';

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
  const [draftParallelChatTargets, setDraftParallelChatTargets] = useState(
    () => createDraftParallelTargets(
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

  const resetDraftParallelChatTargets = useCallback((options?: {
    includeCompareTarget?: boolean;
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  }) => {
    setDraftParallelChatTargets(createDraftParallelTargets(
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
    setDraftParallelChatTargets((currentTargets) =>
      updateDraftParallelTargetAt(currentTargets, 0, (target) =>
        mergeDraftParallelTargetBranchFields(
          syncLeadParallelTarget([target], draftExecutionTarget)[0] ?? draftExecutionTarget,
          target,
        )));
  }, [draftExecutionTarget]);

  const onDraftParallelChatTargetChange = useCallback((index: number, value: WorkspaceExecutionTargetValue) => {
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
      if (prev.length >= maxParallelChats) {
        return prev;
      }

      const seedTarget = prev[0] ?? null;
      const audienceKeys = options?.seedAudienceKeys ?? seedTarget?.audienceKeys ?? [];
      const workflowShape = options?.seedWorkflowShape
        ?? seedTarget?.workflowShape
        ?? 'sequential';
      return [
        ...prev,
        createDraftParallelTarget(
          createNextParallelTarget(
            prev,
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
    setDraftParallelChatTargets((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }, []);

  const onSetDraftParallelBranchAudienceKeys = useCallback((index: number, keys: string[]) => {
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

  return {
    draftParallelChatTargets,
    resetDraftParallelChatTargets,
    onDraftParallelChatTargetChange,
    onAddDraftParallelChatTarget,
    onRemoveDraftParallelChatTarget,
    onSetDraftParallelBranchAudienceKeys,
    onSetDraftParallelBranchCwd,
    onSetDraftParallelBranchRuntimeSessionPolicy,
    onSetDraftParallelBranchPromptOverride,
    onToggleDraftParallelBranchWorkflowShape,
  };
}
