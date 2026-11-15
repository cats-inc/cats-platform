import {
  NewConversationDraft,
  type NewConversationDraftProps,
} from '../../../shared/renderer/components/NewConversationDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { isAdvancedDraftControlsEnabled } from '../../../shared/advancedDraftControls.js';
import { resolveNewConversationDraftBuilderControls } from '../../../shared/renderer/draftBuilderControls.js';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';
import { workingFolderCopy } from '../../../shared/renderer/workingFolderCopy.js';

export interface NewChatDraftProps extends NewConversationDraftProps {
  draftSurface: PlatformSurfaceId;
  onDraftSurfaceChange: (surface: PlatformSurfaceId) => void;
}

function buildWorkSurfaceTag(props: NewChatDraftProps) {
  return (
    <ComposerSurfaceChip
      surface={props.draftSurface}
      onDismiss={
        props.draftSurface !== 'work'
          ? () => props.onDraftSurfaceChange('work')
          : undefined
      }
    />
  );
}

/**
 * +New Work (including a cat-scoped `/work/new?cat=<id>`), +Group
 * Work, and +Parallel Work all render through `NewConversationDraft` so
 * +collaborate seeds temps in place and +compare appends a shadow
 * row without navigating off the current URL. Direct messages belong
 * to Chat (ADR-129), so Work has no direct-lane draft.
 */
function WorkChatDraft(props: NewChatDraftProps) {
  const { t } = useI18n();
  // A Work draft's working folder is its Workspace; switched to another surface, it takes that surface's name.
  const folderCopy = workingFolderCopy(props.draftSurface, t);
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'work',
  );
  const builderControls = resolveNewConversationDraftBuilderControls({
    advancedDraftControlsEnabled,
    entryPreset: props.entryPreset ?? 'default',
    showStructuredDraftControls: true,
    hasVisibleParallelDraftTargets: (props.parallelTargets?.length ?? 0) > 1,
  });

  return (
    <NewConversationDraft
      {...props}
      draftChrome={{
        surfaceTag: buildWorkSurfaceTag(props),
      }}
      builderControls={builderControls}
      draftCopy={{
        folderActionLabel: folderCopy.chooseAction,
        sidePanel: { folder: { sectionTitle: folderCopy.title, emptyState: folderCopy.emptyState } },
        workingFolder: folderCopy,
      }}
      assistSurface="work"
    />
  );
}

export function NewChatDraft(props: NewChatDraftProps) {
  return <WorkChatDraft {...props} />;
}
