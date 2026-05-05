export type NewChatPreset = 'default' | 'group' | 'parallel';
export type DraftStarterSuggestionMode =
  | 'solo'
  | 'group'
  | 'direct'
  | 'parallel';

export interface DraftStarterSuggestionContext {
  mode: DraftStarterSuggestionMode;
  isGroupDraft: boolean;
  isDirectLaneContext: boolean;
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
  const mode: DraftStarterSuggestionMode = isParallelMode
    ? 'parallel'
    : isDirectLaneContext
      ? 'direct'
      : isGroupDraft
        ? 'group'
        : 'solo';

  return {
    mode,
    isGroupDraft,
    isDirectLaneContext,
  };
}
