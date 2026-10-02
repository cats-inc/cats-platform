import type { NewChatPreset } from './draftStarterSuggestionContext.js';
import type { NewConversationDraftBuilderControls } from './components/NewConversationDraft.js';

export function resolveNewConversationDraftBuilderControls(input: {
  advancedDraftControlsEnabled: boolean;
  entryPreset: NewChatPreset;
  showStructuredDraftControls: boolean;
  hasVisibleParallelDraftTargets: boolean;
}): NewConversationDraftBuilderControls {
  return {
    showParallelAddButton:
      input.showStructuredDraftControls
      && (input.advancedDraftControlsEnabled || input.hasVisibleParallelDraftTargets),
    showGroupAddButton:
      input.advancedDraftControlsEnabled
      && input.showStructuredDraftControls
      && input.entryPreset !== 'group',
    hideGroupHint:
      input.advancedDraftControlsEnabled
      && input.showStructuredDraftControls
      && input.entryPreset !== 'group',
    hideParallelHint:
      input.advancedDraftControlsEnabled
      && input.showStructuredDraftControls
      && input.entryPreset !== 'parallel',
  };
}
