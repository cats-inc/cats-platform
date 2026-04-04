import type { NewChatMode } from '../shared/channelPaths.js';
import type { DraftStarterSuggestionMode } from './draftStarterSuggestions.js';

export interface DraftStarterSuggestionContext {
  mode: DraftStarterSuggestionMode;
  isGroupDraft: boolean;
  isDirectLaneContext: boolean;
  isCatLedDraft: boolean;
}

export function resolveDraftStarterSuggestionContext(input: {
  allowAddCat?: boolean;
  draftLeadCatId?: string | null;
  hasLeadCat: boolean;
  entryMode?: NewChatMode;
  participantCount: number;
  parallelTargetCount?: number;
}): DraftStarterSuggestionContext {
  const isParallelMode = (input.parallelTargetCount ?? 0) >= 2;
  const isGroupDraft = input.entryMode === 'group' || input.participantCount > 1;
  const isDirectLaneContext = !input.allowAddCat && Boolean(input.draftLeadCatId) && input.hasLeadCat;
  const isCatLedDraft = !isDirectLaneContext && input.hasLeadCat && !isGroupDraft;
  const mode: DraftStarterSuggestionMode = isParallelMode
    ? 'parallel'
    : isDirectLaneContext
      ? 'direct'
      : isGroupDraft
        ? 'group'
        : isCatLedDraft
          ? 'cat_led'
          : 'solo';

  return {
    mode,
    isGroupDraft,
    isDirectLaneContext,
    isCatLedDraft,
  };
}
