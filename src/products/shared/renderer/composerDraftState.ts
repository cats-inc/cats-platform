import type {
  Dispatch,
  SetStateAction,
} from 'react';
import {
  createDefaultRuntimeSessionPolicy,
  type RuntimeSessionPolicy,
} from '../../../shared/runtimeSessionPolicy.js';

export interface ResetComposerDraftStateOptions<ModelValue, ParticipantValue> {
  setDraftCwd: Dispatch<SetStateAction<string | null>>;
  setDraftCatIds: Dispatch<SetStateAction<string[]>>;
  setDraftHighlightedCatId: Dispatch<SetStateAction<string | null>>;
  setDraftCatExecutionTargetOverrides: Dispatch<SetStateAction<Map<string, ModelValue>>>;
  setDraftRuntimeSessionPolicy?: Dispatch<SetStateAction<RuntimeSessionPolicy>>;
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
  setDraftCatExecutionTargetOverrides,
  setDraftRuntimeSessionPolicy,
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
  setDraftCatExecutionTargetOverrides(new Map<string, ModelValue>());
  setDraftRuntimeSessionPolicy?.(createDefaultRuntimeSessionPolicy());
  setDraftFiles([]);
  setChannelFiles?.([]);
  resetDraftParallelChatTargets?.();
  setDraftWorkflowShape?.('sequential');
  setDraftAudienceKeys?.(null);
}
