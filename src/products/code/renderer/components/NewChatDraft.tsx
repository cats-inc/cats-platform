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

function resolveCodeDraftGreeting(props: NewChatDraftProps): string | undefined {
  const assistGreeting = props.payload.guideCatAssist?.codeNewDraft?.bundle.content.greeting?.trim();
  if (assistGreeting) return assistGreeting;
  if (props.greeting && props.greeting.trim().length > 0) return props.greeting;
  return NEW_CODE_DRAFT_COPY.greeting;
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
  const isSubmittingFirstTurn = isComposerBusyForDraft(props.busy);

  // Direct-lane +New Code still renders the workspace draft surface
  // (profile header + ComposerCatStack). It intentionally ignores
  // the chat-group / parallel draft fields — those live in the
  // ChatNewChatDraft path for group / parallel presets.
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
    greeting: resolveCodeDraftGreeting(props) ?? undefined,
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

/**
 * Direct-lane drafts (`draftDefaultRecipientCatId` present) keep the
 * workspace draft surface so the profile header + ComposerCatStack
 * stay intact. Teaching +collaborate / +compare are suppressed here
 * because direct-lane is a 1×1 context.
 */
function CodeDirectLaneDraft(props: NewChatDraftProps) {
  const helperChips = resolveCodeDraftHelperChips(props);
  const { permissionChip, whereExtras } = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });
  const workspaceProps = buildWorkspaceDraftProps({
    props,
    visibleHelperChips: helperChips,
    onSelectHelperChip: (prompt) => { props.onComposerChange(prompt); },
  });

  return (
    <WorkspaceNewChatDraft
      {...workspaceProps}
      copy={NEW_CODE_DRAFT_COPY}
      composerHeaderAccessory={permissionChip}
      composerHeaderWhereExtras={whereExtras}
      surfaceTag={<ComposerSurfaceChip surface="code" />}
    />
  );
}

/**
 * Generic +New Code (no direct-lane recipient), +Team Code, and
 * +Peer Code all render through `ChatNewChatDraft` so +collaborate
 * seeds temps in place and +compare appends a shadow row without
 * navigating off the current URL — matching +New Chat.
 */
function CodeChatDraft(props: NewChatDraftProps) {
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    props.payload.chat.advancedDraftControls,
    'code',
  );
  const helperChips = resolveCodeDraftHelperChips(props);
  const { permissionChip, whereExtras } = useDraftSessionChips({
    draftCwd: props.draftCwd,
    busy: props.busy,
    draftRuntimeSessionPolicy: props.draftRuntimeSessionPolicy,
    onDraftRuntimeSessionPolicyChange: props.onDraftRuntimeSessionPolicyChange,
  });
  const showDraftGroupAddButton = advancedDraftControlsEnabled
    && props.entryPreset !== 'group';
  const hideDraftGroupHint = advancedDraftControlsEnabled
    && props.entryPreset !== 'group';
  const hideDraftParallelHint = advancedDraftControlsEnabled
    && props.entryPreset !== 'parallel';
  const showDraftParallelAddButton = advancedDraftControlsEnabled
    || (props.parallelTargets?.length ?? 0) > 1;
  const codeGreeting = resolveCodeDraftGreeting(props);

  return (
    <ChatNewChatDraft
      {...props}
      greeting={codeGreeting}
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
      showDraftGroupAddButton={showDraftGroupAddButton}
      hideDraftGroupHint={hideDraftGroupHint}
      hideDraftParallelHint={hideDraftParallelHint}
      showDraftParallelAddButton={showDraftParallelAddButton}
    />
  );
}

export function NewChatDraft(props: NewChatDraftProps) {
  if (props.draftDefaultRecipientCatId) {
    return <CodeDirectLaneDraft {...props} />;
  }
  return <CodeChatDraft {...props} />;
}
