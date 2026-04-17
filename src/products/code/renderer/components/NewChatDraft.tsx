import {
  NewChatDraft as ChatNewChatDraft,
  type NewChatDraftProps,
} from '../../../shared/renderer/components/ChatNewChatDraft.js';
import {
  NewChatDraft as WorkspaceNewChatDraft,
  type NewChatDraftProps as WorkspaceDraftProps,
  type WorkspaceNewChatDraftCopy,
} from '../../../shared/renderer/components/NewChatDraft.js';
import { isComposerBusyForDraft } from '../../../../shared/composer.js';

export const NEW_CODE_DRAFT_COPY: WorkspaceNewChatDraftCopy = {
  greeting: 'Ready to code.',
  composerPlaceholder: 'What should this code session build, fix, or investigate?',
  sidePanelTitle: 'New Code Setup',
  participantsSectionTitle: 'Participants',
  participantsEmptyState: 'No participants available yet.',
  privateSessionEyebrow: 'Focused Code Session',
  privateSessionHeroNote: 'Single-participant coding lane.',
  privateSessionBoundHeroNote: 'Single-participant coding lane.',
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

function buildWorkspaceDraftProps(props: NewChatDraftProps): WorkspaceDraftProps {
  const {
    greeting,
    greetingPool,
    draftTemporaryParticipants,
    onAddDraftTemporaryParticipant,
    onQuickAddDraftTemporaryParticipant,
    onRemoveDraftTemporaryParticipant,
    onUpdateDraftTemporaryParticipant,
    entryMode,
    starterSuggestions,
    parallelTargets,
    onParallelTargetChange,
    onAddParallelTarget,
    onRemoveParallelTarget,
    draftWorkflowShape,
    onToggleDraftWorkflowShape,
    draftAudienceKeys,
    onSetAudienceKeys,
    onCancelPendingSend,
    ...workspaceProps
  } = props;
  const codeAssist = props.payload.guideCatAssist?.codeNewDraft ?? null;
  const assistGreeting = codeAssist?.bundle.content.greeting?.trim() || null;
  const visibleHelperChips = !props.composerDraft.trim()
    ? (codeAssist?.bundle.content.entryChips ?? [])
      .filter((chip) => chip.prompt.trim().length > 0)
      .slice(0, 3)
    : [];
  const isSubmittingFirstTurn = isComposerBusyForDraft(props.busy);

  // Default +New code intentionally ignores the chat-group and parallel draft fields
  // until Team Code and Peer Code get their own product-owned draft surfaces.
  void greetingPool;
  void draftTemporaryParticipants;
  void onAddDraftTemporaryParticipant;
  void onQuickAddDraftTemporaryParticipant;
  void onRemoveDraftTemporaryParticipant;
  void onUpdateDraftTemporaryParticipant;
  void entryMode;
  void starterSuggestions;
  void parallelTargets;
  void onParallelTargetChange;
  void onAddParallelTarget;
  void onRemoveParallelTarget;
  void draftWorkflowShape;
  void onToggleDraftWorkflowShape;
  void draftAudienceKeys;
  void onSetAudienceKeys;
  void onCancelPendingSend;

  return {
    ...workspaceProps,
    greeting: assistGreeting ?? greeting ?? undefined,
    greetingAccessory: visibleHelperChips.length > 0 ? (
      <div className="draftPromptSuggestions">
        <div className="chipRow">
          {visibleHelperChips.map((chip) => (
            <button
              key={chip.id}
              className="promptChip draftPromptChip"
              type="button"
              disabled={isSubmittingFirstTurn}
              onClick={() => props.onComposerChange(chip.prompt)}
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
  if (props.entryMode === 'group' || props.entryMode === 'parallel') {
    return <ChatNewChatDraft {...props} />;
  }

  const workspaceProps = buildWorkspaceDraftProps(props);

  return (
    <WorkspaceNewChatDraft
      {...workspaceProps}
      copy={NEW_CODE_DRAFT_COPY}
    />
  );
}
