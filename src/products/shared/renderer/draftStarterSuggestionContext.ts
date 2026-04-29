export type NewChatPreset = 'default' | 'group' | 'parallel';
export type DraftStarterSuggestionMode =
  | 'solo'
  | 'participant'
  | 'group'
  | 'direct'
  | 'parallel';

export interface DraftStarterSuggestionContext {
  mode: DraftStarterSuggestionMode;
  isGroupDraft: boolean;
  isDirectLaneContext: boolean;
  isParticipantDraft: boolean;
}

export function resolveDraftStarterSuggestionContext(input: {
  allowAddCat?: boolean;
  draftDefaultRecipientCatId?: string | null;
  hasDefaultRecipientCat: boolean;
  entryPreset?: NewChatPreset;
  participantCount: number;
  parallelTargetCount?: number;
}): DraftStarterSuggestionContext {
  const isParallelMode = (input.parallelTargetCount ?? 0) >= 2;
  const isGroupDraft = input.entryPreset === 'group' || input.participantCount > 1;
  const isDirectLaneContext =
    !input.allowAddCat
    && Boolean(input.draftDefaultRecipientCatId)
    && input.hasDefaultRecipientCat;
  const isParticipantDraft = !isDirectLaneContext && input.hasDefaultRecipientCat && !isGroupDraft;
  const mode: DraftStarterSuggestionMode = isParallelMode
    ? 'parallel'
    : isDirectLaneContext
      ? 'direct'
      : isGroupDraft
        ? 'group'
        : isParticipantDraft
          ? 'participant'
          : 'solo';

  return {
    mode,
    isGroupDraft,
    isDirectLaneContext,
    isParticipantDraft,
  };
}
