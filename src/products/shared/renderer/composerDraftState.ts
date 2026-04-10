import type {
  Dispatch,
  SetStateAction,
} from 'react';

export interface ResetComposerDraftStateOptions<ModelValue, ParticipantValue> {
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatModelOverrides: Dispatch<SetStateAction<Map<string, ModelValue>>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setDraftTemporaryParticipants?: Dispatch<SetStateAction<ParticipantValue[]>>;
  setChannelFiles?: Dispatch<SetStateAction<File[]>>;
  resetDraftParallelChatTargets?: () => void;
  setDraftWorkflowShape?: Dispatch<SetStateAction<'sequential' | 'concurrent'>>;
  setDraftAudienceKeys?: Dispatch<SetStateAction<string[] | null>>;
}

export function resetComposerDraftState<ModelValue, ParticipantValue = never>({
  setDraftCwd,
  setDraftCatIds,
  setDraftHighlightedCatId,
  setDraftCatModelOverrides,
  setDraftFiles,
  setDraftTemporaryParticipants,
  setChannelFiles,
  resetDraftParallelChatTargets,
  setDraftWorkflowShape,
  setDraftAudienceKeys,
}: ResetComposerDraftStateOptions<ModelValue, ParticipantValue>): void {
  setDraftCwd(null);
  setDraftCatIds([]);
  setDraftTemporaryParticipants?.([]);
  setDraftHighlightedCatId(null);
  setDraftCatModelOverrides(new Map<string, ModelValue>());
  setDraftFiles([]);
  setChannelFiles?.([]);
  resetDraftParallelChatTargets?.();
  setDraftWorkflowShape?.('sequential');
  setDraftAudienceKeys?.(null);
}
