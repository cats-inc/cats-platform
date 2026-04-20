import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import {
  type WorkspaceNewChatDraftCopy,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { useDraftSessionChips } from '../../../shared/renderer/hooks/useDraftSessionChips.js';

export const NEW_CODE_DRAFT_COPY: WorkspaceNewChatDraftCopy = {
  greeting: 'Ready to code.',
  composerPlaceholder: 'What should this code session build, fix, or investigate?',
  sidePanelTitle: 'New Code Setup',
  participantsSectionTitle: 'Participants',
  participantsEmptyState: 'No participants available yet.',
  executionSectionTitle: 'Execution',
  executionActionLabel: 'Choose execution target',
  executionEmptyState: 'No execution target set yet.',
  folderSectionTitle: 'Workspace',
  folderActionLabel: 'Choose workspace',
  folderEmptyState: 'No workspace selected yet.',
};

export type {
  NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';

function resolveCodeDraftHelperChips(props: NewChatDraftProps): Array<{
  id: string;
  label: string;
  prompt: string;
}> {
  return (props.payload.guideCatAssist?.codeNewDraft?.bundle.content.entryChips ?? [])
    .filter((chip) => chip.prompt.trim().length > 0)
    .slice(0, 3)
    .map((chip) => ({
      id: chip.id,
      label: chip.label?.trim() || chip.prompt,
      prompt: chip.prompt,
    }));
}

/**
 * Every Code entry — +New Code, +Team Code, +Peer Code — renders
 * through `ChatNewChatDraft`. The shell (`WorkspaceProductApp`)
 * already computes `showDraftGroupAddButton` / `hideDraftGroupHint` /
 * `hideDraftParallelHint` correctly per preset for surface='code', so
 * this wrapper only layers on Code-specific chrome: surface chip,
 * session chips, helper chips, and the Code copy strings.
 */
export function NewChatDraft(props: NewChatDraftProps) {
  const helperChips = resolveCodeDraftHelperChips(props);
  const { permissionChip, whereExtras } = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });

  return (
    <ChatNewChatDraft
      {...props}
      preserveHelperChipsOnSelect
      leadingStarterChips={helperChips.length > 0
        ? helperChips.map((chip) => ({
            id: chip.id,
            label: chip.label,
            onClick: () => { props.onComposerChange(chip.prompt); },
          }))
        : undefined}
      composerHeaderAccessory={permissionChip}
      composerHeaderWhereExtras={whereExtras}
      surfaceTag={<ComposerSurfaceChip surface="code" />}
      composerPlaceholder={NEW_CODE_DRAFT_COPY.composerPlaceholder}
      folderActionLabel={NEW_CODE_DRAFT_COPY.folderActionLabel}
    />
  );
}
