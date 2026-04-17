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
  draftModel: WorkspaceExecutionTargetValue;
  maxParallelChats: number;
}) {
  const { draftModel, maxParallelChats } = options;
  const [draftParallelChatTargets, setDraftParallelChatTargets] = useState<WorkspaceExecutionTargetValue[]>(
    () => createInitialParallelTargets({
      provider: draftModel.provider,
      model: draftModel.model,
      instance: draftModel.instance,
      modelSelection: draftModel.modelSelection,
    }),
  );

  const resetDraftParallelChatTargets = useCallback(() => {
    setDraftParallelChatTargets(createInitialParallelTargets(draftModel));
  }, [draftModel]);

  useEffect(() => {
    setDraftParallelChatTargets((currentTargets) =>
      syncLeadParallelTarget(currentTargets, draftModel));
  }, [draftModel]);

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
        createNextParallelTarget(prev, draftModel),
      ];
    });
  }, [
    draftModel,
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

