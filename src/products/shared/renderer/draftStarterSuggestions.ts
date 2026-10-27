import type { GuideCatAssistEntryChip } from '../../../shared/guideCatAssist.js';
export type DraftStarterSuggestion = GuideCatAssistEntryChip;
export function resolveVisibleDraftStarterSuggestions(input: {
  suggestions?: ReadonlyArray<DraftStarterSuggestion | null | undefined> | null;
}): DraftStarterSuggestion[] {
  return (input.suggestions ?? []).filter((chip): chip is DraftStarterSuggestion => !!chip?.id?.trim()
    && (chip.action === 'open' || chip.action === 'prefill' && !!chip.prompt?.trim()));
}
