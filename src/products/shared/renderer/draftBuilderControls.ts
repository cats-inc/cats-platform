import type { NewChatPreset } from './draftStarterSuggestionContext.js';
import type { ChatNewChatDraftBuilderControls } from './components/ChatNewChatDraft.js';

export function resolveChatNewChatDraftBuilderControls(input: {
  advancedDraftControlsEnabled: boolean;
  entryPreset: NewChatPreset;
  showStructuredDraftControls: boolean;
  hasVisibleParallelDraftTargets: boolean;
}): ChatNewChatDraftBuilderControls {
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
