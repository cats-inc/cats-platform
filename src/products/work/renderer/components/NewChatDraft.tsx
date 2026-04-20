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

/**
 * Generic +New Work (no direct-lane recipient), +Group Work, and
 * +Parallel Work all render through `ChatNewChatDraft` so
 * +collaborate seeds temps in place and +compare appends a shadow
 * row without navigating off the current URL.
 */
function WorkChatDraft(props: NewChatDraftProps) {
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'work',
  );
  const showDraftGroupAddButton = advancedDraftControlsEnabled
    && props.entryPreset !== 'group';
  const hideDraftGroupHint = advancedDraftControlsEnabled
    && props.entryPreset !== 'group';
  const hideDraftParallelHint = advancedDraftControlsEnabled
    && props.entryPreset !== 'parallel';
  const showDraftParallelAddButton = advancedDraftControlsEnabled
    || (props.parallelTargets?.length ?? 0) > 1;

  return (
    <ChatNewChatDraft
      {...props}
      surfaceTag={<ComposerSurfaceChip surface="work" />}
      showDraftGroupAddButton={showDraftGroupAddButton}
      hideDraftGroupHint={hideDraftGroupHint}
      hideDraftParallelHint={hideDraftParallelHint}
      showDraftParallelAddButton={showDraftParallelAddButton}
    />
  );
}

/**
 * Direct-lane drafts keep the workspace draft surface so the
 * profile header / ComposerCatStack stay intact.
 */
function WorkDirectLaneDraft(props: NewChatDraftProps) {
  const sharedGreeting = props.greeting ?? undefined;
  return (
    <SharedNewChatDraft
      {...props}
      greeting={sharedGreeting}
      surfaceTag={<ComposerSurfaceChip surface="work" />}
    />
  );
}

export function NewChatDraft(props: NewChatDraftProps) {
  if (props.draftDefaultRecipientCatId) {
    return <WorkDirectLaneDraft {...props} />;
  }
  return <WorkChatDraft {...props} />;
}
