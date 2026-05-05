export type NewChatPreset = 'default' | 'group' | 'parallel';

/**
 * Composer-state hint used by the renderer to label the +New chat draft.
 * This is purely renderer-internal — it does NOT correspond to a
 * guide-cat-assist scope. The chat-new surface is a single scope (see
 * `GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewDefault`); composer mode just
 * shapes how the local draft renders. Direct lane is a separate surface
 * altogether and never produces helper chips, so it is not represented
 * here — use `isDirectLaneContext` to suppress chip rendering instead.
 */
export type DraftStarterSuggestionMode =
  | 'solo'
  | 'group'
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
    : isGroupDraft
      ? 'group'
      : 'solo';

  return {
    mode,
    isGroupDraft,
    isDirectLaneContext,
  };
}
