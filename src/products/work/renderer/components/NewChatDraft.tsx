import { useNavigate } from 'react-router-dom';

import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import {
  NewChatDraft as SharedNewChatDraft,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { isAdvancedDraftControlsEnabled } from '../../../shared/advancedDraftControls.js';
import { buildNewGroupChatPath, buildNewParallelChatPath } from '../../shared/channelPaths.js';

export type { NewChatDraftProps };

export function NewChatDraft(props: NewChatDraftProps) {
  const navigate = useNavigate();
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

  // +New Work's draft surface intentionally omits the M*N composer
  // layout. When the user clicks the teaching +collaborate /
  // +compare buttons on +New Work, route them to the dedicated
  // group / parallel Work draft instead of silently mutating shared
  // draft state that +New Work does not render.
  const navigateToGroupWork = showAdvancedEntryButtons
    ? () => { navigate(buildNewGroupChatPath()); }
    : undefined;
  const navigateToParallelWork = showAdvancedEntryButtons
    ? () => { navigate(buildNewParallelChatPath()); }
    : undefined;

  return (
    <SharedNewChatDraft
      {...props}
      greeting={sharedGreeting}
      surfaceTag={<ComposerSurfaceChip surface="work" />}
      showDraftGroupAddButton={showAdvancedEntryButtons}
      onQuickAddDraftTemporaryParticipant={navigateToGroupWork}
      showDraftParallelAddButton={showAdvancedEntryButtons}
      onAddParallelTarget={navigateToParallelWork}
    />
  );
}
