import { useEffect, useState } from 'react';

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
import { inspectPath } from '../api/index.js';

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

interface RepoProbeResult {
  isRepo: boolean;
  repoRoot: string | null;
  branch: string | null;
}

function useCodeDraftRepoProbe(draftCwd: string | null): RepoProbeResult {
  const [result, setResult] = useState<RepoProbeResult>({
    isRepo: false,
    repoRoot: null,
    branch: null,
  });

  useEffect(() => {
    if (!draftCwd) {
      setResult({ isRepo: false, repoRoot: null, branch: null });
      return;
    }

    const controller = new AbortController();
    inspectPath(draftCwd, controller.signal)
      .then((info) => {
        if (controller.signal.aborted) {
          return;
        }
        setResult({
          isRepo: Boolean(info.isRepo),
          repoRoot: info.repoRoot ?? null,
          branch: info.branch ?? null,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setResult({ isRepo: false, repoRoot: null, branch: null });
      });

    return () => {
      controller.abort();
    };
  }, [draftCwd]);

  return result;
}

export function NewChatDraft(props: NewChatDraftProps) {
  const { isRepo, repoRoot, branch } = useCodeDraftRepoProbe(props.draftCwd);
  const [worktreeEnabled, setWorktreeEnabled] = useState(false);

  if (props.entryMode === 'group' || props.entryMode === 'parallel') {
    return <ChatNewChatDraft {...props} />;
  }

  const workspaceProps = buildWorkspaceDraftProps(props);
  const isSubmittingFirstTurn = isComposerBusyForDraft(props.busy);
  const branchLabel = branch ?? 'detached';
  const repoReady = isRepo && repoRoot;
  const branchChip = repoReady ? (
    <div className="composerBranchChipGroup">
      <span className="composerBranchChip">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="4" r="1.6" />
          <circle cx="12" cy="4" r="1.6" />
          <circle cx="4" cy="12" r="1.6" />
          <path d="M4 5.6v4.8" />
          <path d="M12 5.6v2.4a2 2 0 0 1-2 2H6" />
        </svg>
        <span>{branchLabel}</span>
      </span>
      <label className="composerWorktreeChip">
        <input
          type="checkbox"
          checked={worktreeEnabled}
          disabled={isSubmittingFirstTurn}
          onChange={(event) => setWorktreeEnabled(event.target.checked)}
        />
        <span>worktree</span>
      </label>
    </div>
  ) : null;

  return (
    <WorkspaceNewChatDraft
      {...workspaceProps}
      copy={NEW_CODE_DRAFT_COPY}
      composerFooterAccessory={branchChip}
    />
  );
}
