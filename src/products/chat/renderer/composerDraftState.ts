import type {
  Dispatch,
  SetStateAction,
} from 'react';

export interface ResetComposerDraftStateOptions<ModelValue, ParticipantValue> {
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftTemporaryParticipants: Dispatch<SetStateAction<ParticipantValue[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatModelOverrides: Dispatch<SetStateAction<Map<string, ModelValue>>>;
  setDraftFiles: Dispatch<SetStateAction<File[]>>;
  setChannelFiles?: Dispatch<SetStateAction<File[]>>;
  resetDraftParallelChatTargets?: () => void;
}

export function resetComposerDraftState<ModelValue, ParticipantValue>({
  setDraftCwd,
  setDraftCatIds,
  setDraftTemporaryParticipants,
  setDraftHighlightedCatId,
  setDraftCatModelOverrides,
  setDraftFiles,
  setChannelFiles,
  resetDraftParallelChatTargets,
}: ResetComposerDraftStateOptions<ModelValue, ParticipantValue>): void {
  setDraftCwd(null);
  setDraftCatIds([]);
  setDraftTemporaryParticipants([]);
  setDraftHighlightedCatId(null);
  setDraftCatModelOverrides(new Map<string, ModelValue>());
  setDraftFiles([]);
  setChannelFiles?.([]);
  resetDraftParallelChatTargets?.();
}
