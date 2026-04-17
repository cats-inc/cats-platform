import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  createInitialParallelTargets,
  createNextParallelTarget,
  syncLeadParallelTarget,
} from '../draftChatUtils.js';
import type { WorkspaceExecutionTargetValue } from './useWorkspaceComposerSubmit.js';

export function useWorkspaceParallelDraft(options: {
  draftExecutionTarget: WorkspaceExecutionTargetValue;
  maxParallelChats: number;
}) {
  const { draftExecutionTarget, maxParallelChats } = options;
  const [draftParallelChatTargets, setDraftParallelChatTargets] = useState<WorkspaceExecutionTargetValue[]>(
    () => createInitialParallelTargets({
      provider: draftExecutionTarget.provider,
      model: draftExecutionTarget.model,
      instance: draftExecutionTarget.instance,
      modelSelection: draftExecutionTarget.modelSelection,
    }),
  );

  const resetDraftParallelChatTargets = useCallback(() => {
    setDraftParallelChatTargets(createInitialParallelTargets(draftExecutionTarget));
  }, [draftExecutionTarget]);

  useEffect(() => {
    setDraftParallelChatTargets((currentTargets) =>
      syncLeadParallelTarget(currentTargets, draftExecutionTarget));
  }, [draftExecutionTarget]);

  const onDraftParallelChatTargetChange = useCallback((index: number, value: WorkspaceExecutionTargetValue) => {
    setDraftParallelChatTargets((prev) =>
      prev.map((target, currentIndex) => (currentIndex === index ? value : target)),
    );
  }, []);

  const onAddDraftParallelChatTarget = useCallback(() => {
    setDraftParallelChatTargets((prev) => {
      if (prev.length >= maxParallelChats) {
        return prev;
      }

      return [
        ...prev,
        createNextParallelTarget(prev, draftExecutionTarget),
      ];
    });
  }, [
    draftExecutionTarget,
    maxParallelChats,
  ]);

  const onRemoveDraftParallelChatTarget = useCallback((index: number) => {
    setDraftParallelChatTargets((prev) => {
      if (prev.length <= 2) {
        return prev;
      }

      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }, []);

  return {
    draftParallelChatTargets,
    resetDraftParallelChatTargets,
    onDraftParallelChatTargetChange,
    onAddDraftParallelChatTarget,
    onRemoveDraftParallelChatTarget,
  };
}

