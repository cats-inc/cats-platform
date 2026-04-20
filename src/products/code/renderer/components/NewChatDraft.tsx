import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import {
  NewChatDraft as WorkspaceNewChatDraft,
  type NewChatDraftProps as WorkspaceDraftProps,
  type WorkspaceNewChatDraftCopy,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { ComposerSurfaceChip } from '../../../shared/renderer/components/ComposerSurfaceChip.js';
import { useDraftSessionChips } from '../../../shared/renderer/hooks/useDraftSessionChips.js';
import { isAdvancedDraftControlsEnabled } from '../../../shared/advancedDraftControls.js';
import { isComposerBusyForDraft } from '../../../../shared/composer.js';

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

function buildWorkspaceDraftProps(input: {
  props: NewChatDraftProps;
  visibleHelperChips: Array<{
    id: string;
    label?: string | null;
    prompt: string;
  }>;
  onSelectHelperChip: (prompt: string) => void;
}): WorkspaceDraftProps {
  const { props, visibleHelperChips, onSelectHelperChip } = input;
  const {
    greeting,
    greetingPool,
    draftTemporaryParticipants,
    onAddDraftTemporaryParticipant,
    onQuickAddDraftTemporaryParticipant,
    onRemoveDraftTemporaryParticipant,
    onUpdateDraftTemporaryParticipant,
    entryPreset,
    parallelTargets,
    onParallelTargetChange,
    onAddParallelTarget,
    onRemoveParallelTarget,
    draftWorkflowShape,
    onToggleDraftWorkflowShape,
    draftAudienceKeys,
    onSetAudienceKeys,
    draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange,
    onCancelPendingSend,
    hideDraftGroupHint,
    hideDraftParallelHint,
    ...workspaceProps
  } = props;
  const codeAssist = props.payload.guideCatAssist?.codeNewDraft ?? null;
  const assistGreeting = codeAssist?.bundle.content.greeting?.trim() || null;
  const isSubmittingFirstTurn = isComposerBusyForDraft(props.busy);

  // Default +New code intentionally ignores the chat-group and parallel draft fields
  // until Team Code and Peer Code get their own product-owned draft surfaces.
  void greetingPool;
  void draftTemporaryParticipants;
  void onAddDraftTemporaryParticipant;
  void onQuickAddDraftTemporaryParticipant;
  void onRemoveDraftTemporaryParticipant;
  void onUpdateDraftTemporaryParticipant;
  void entryPreset;
  void parallelTargets;
  void onParallelTargetChange;
  void onAddParallelTarget;
  void onRemoveParallelTarget;
  void draftWorkflowShape;
  void onToggleDraftWorkflowShape;
  void draftAudienceKeys;
  void onSetAudienceKeys;
  void draftRuntimeSessionPolicy;
  void onDraftRuntimeSessionPolicyChange;
  void onCancelPendingSend;
  void hideDraftGroupHint;
  void hideDraftParallelHint;

  return {
    ...workspaceProps,
    greeting: assistGreeting ?? greeting ?? undefined,
    postComposerAccessory: visibleHelperChips.length > 0 ? (
      <div className="draftPromptSuggestions">
        <div className="chipRow">
          {visibleHelperChips.map((chip) => (
            <button
              key={chip.id}
              className="promptChip draftPromptChip"
              type="button"
              disabled={isSubmittingFirstTurn}
              onClick={() => onSelectHelperChip(chip.prompt)}
            >
              {chip.label?.trim() || chip.prompt}
            </button>
          ))}
        </div>
      </div>
    ) : null,
  };
}

export function NewChatDraft(props: NewChatDraftProps) {
  if (props.entryPreset === 'group' || props.entryPreset === 'parallel') {
    return <CodeGroupParallelDraft {...props} />;
  }
  return <CodeDefaultDraft {...props} />;
}

function CodeGroupParallelDraft(props: NewChatDraftProps) {
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'code',
  );
  const helperChips = resolveCodeDraftHelperChips(props);
  const showCrossGroupButton = advancedDraftControlsEnabled && props.entryPreset === 'parallel';
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
      leadingStarterChips={helperChips.map((chip) => ({
        id: chip.id,
        label: chip.label,
        onClick: () => {
          props.onComposerChange(chip.prompt);
        },
      }))}
      composerHeaderAccessory={permissionChip}
      composerHeaderWhereExtras={whereExtras}
      surfaceTag={<ComposerSurfaceChip surface="code" />}
      folderActionLabel={NEW_CODE_DRAFT_COPY.folderActionLabel}
      showDraftGroupAddButton={showCrossGroupButton}
      hideDraftGroupHint={showCrossGroupButton}
      hideDraftParallelHint={advancedDraftControlsEnabled && props.entryPreset !== 'parallel'}
    />
  );
}

function CodeDefaultDraft(props: NewChatDraftProps) {
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'code',
  );
  const availableHelperChips = resolveCodeDraftHelperChips(props);
  const showAdvancedEntryButtons =
    advancedDraftControlsEnabled
    && props.allowAddCat !== false
    && !props.draftDefaultRecipientCatId;
  const { permissionChip, whereExtras } = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });
  const workspaceProps = buildWorkspaceDraftProps({
    props,
    visibleHelperChips: availableHelperChips,
    onSelectHelperChip: (prompt) => {
      props.onComposerChange(prompt);
    },
  });

  return (
    <WorkspaceNewChatDraft
      {...workspaceProps}
      copy={NEW_CODE_DRAFT_COPY}
      composerHeaderAccessory={permissionChip}
      composerHeaderWhereExtras={whereExtras}
      surfaceTag={<ComposerSurfaceChip surface="code" />}
      showDraftGroupAddButton={showAdvancedEntryButtons}
      onQuickAddDraftTemporaryParticipant={showAdvancedEntryButtons
        ? props.onQuickAddDraftTemporaryParticipant
        : undefined}
      showDraftParallelAddButton={showAdvancedEntryButtons}
      onAddParallelTarget={showAdvancedEntryButtons ? props.onAddParallelTarget : undefined}
    />
  );
}
