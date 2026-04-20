import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import {
  NewChatDraft as SharedNewChatDraft,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { isAdvancedDraftControlsEnabled } from '../../../shared/advancedDraftControls.js';

export type { NewChatDraftProps };

export function NewChatDraft(props: NewChatDraftProps) {
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'work',
  );
  const sharedGreeting = props.greeting ?? undefined;
  const showCrossGroupButton = advancedDraftControlsEnabled && props.entryPreset === 'parallel';
  const showAdvancedEntryButtons =
    advancedDraftControlsEnabled
    && props.allowAddCat !== false
    && !props.draftDefaultRecipientCatId;

  if (props.entryPreset === 'group' || props.entryPreset === 'parallel') {
    return (
      <ChatNewChatDraft
        {...props}
        surfaceTag={<ComposerSurfaceChip surface="work" />}
        showDraftGroupAddButton={showCrossGroupButton}
        hideDraftGroupHint={showCrossGroupButton}
        hideDraftParallelHint={advancedDraftControlsEnabled && props.entryPreset !== 'parallel'}
      />
    );
  }

  return (
    <SharedNewChatDraft
      {...props}
      greeting={sharedGreeting}
      surfaceTag={<ComposerSurfaceChip surface="work" />}
      showDraftGroupAddButton={showAdvancedEntryButtons}
      onQuickAddDraftTemporaryParticipant={showAdvancedEntryButtons
        ? props.onQuickAddDraftTemporaryParticipant
        : undefined}
      showDraftParallelAddButton={showAdvancedEntryButtons}
      onAddParallelTarget={showAdvancedEntryButtons ? props.onAddParallelTarget : undefined}
    />
  );
}
