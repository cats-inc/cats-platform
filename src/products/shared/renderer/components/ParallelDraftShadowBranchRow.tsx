import type { RoomWorkflowShape } from '../../../../shared/roomRouting.js';
import { buildAudienceParticipantFromExecutionTarget } from '../audienceParticipantBuilder.js';
import { BranchAudienceRoster } from './BranchAudienceRoster.js';
import type { DraftComposerStackParticipant } from './chatNewChatDraftSupport.js';
import type { ExecutionTargetValue } from './ExecutionTarget.js';
import { AudienceChip } from './AudienceChip.js';

interface ParallelDraftShadowBranchRowProps {
  branchIndex: number;
  target: ExecutionTargetValue;
  audienceParticipants: DraftComposerStackParticipant[];
  allParticipants: DraftComposerStackParticipant[];
  workflowShape: RoomWorkflowShape;
  maxAudienceParticipants: number;
  isSubmittingFirstTurn: boolean;
  canAddCollaborator: boolean;
  accentCollaborateButton: boolean;
  onAddCollaborator?: (branchIndex: number) => void;
  onSetAudienceKeys?: (branchIndex: number, keys: string[]) => void;
  onToggleWorkflowShape?: (branchIndex: number) => void;
  onOpenAudience?: () => void;
  onRemoveParallelTarget?: (branchIndex: number) => void;
  canRemoveParallelTarget: boolean;
  useDangerParallelRemoveHover: boolean;
}

export function ParallelDraftShadowBranchRow({
  branchIndex,
  target,
  audienceParticipants,
  allParticipants,
  workflowShape,
  maxAudienceParticipants,
  isSubmittingFirstTurn,
  canAddCollaborator,
  accentCollaborateButton,
  onAddCollaborator,
  onSetAudienceKeys,
  onToggleWorkflowShape,
  onOpenAudience,
  onRemoveParallelTarget,
  canRemoveParallelTarget,
  useDangerParallelRemoveHover,
}: ParallelDraftShadowBranchRowProps) {
  // Fall back to a target-derived chip when the branch has no
  // audienceKeys yet (legacy parallel-preset bootstraps that haven't
  // been seeded with a temp participant). The chip on the right is
  // never empty so each shadow row always has something to interact
  // with.
  const displayParticipants = audienceParticipants.length > 0
    ? audienceParticipants
    : [buildAudienceParticipantFromExecutionTarget(target, `parallel:${branchIndex}`)];
  return (
    <div className="parallelStubCard">
      <div className="parallelStubBranchRow">
        <div className="parallelStubAudienceControls">
          <BranchAudienceRoster
            audienceParticipants={audienceParticipants}
            isSubmittingFirstTurn={isSubmittingFirstTurn}
            canRemoveParticipant={audienceParticipants.length >= 2}
            useDangerRemoveHover={useDangerParallelRemoveHover}
            onAvatarClick={onOpenAudience}
            onRemoveParticipant={(participant) => {
              if (!onSetAudienceKeys) return;
              const nextKeys = audienceParticipants
                .filter((p) => p.key !== participant.key)
                .map((p) => p.key);
              onSetAudienceKeys(branchIndex, nextKeys);
            }}
          />
          {canAddCollaborator ? (
            <button
              type="button"
              className={`parallelAddButton${accentCollaborateButton ? ' parallelAddButtonAccent' : ''}`}
              disabled={isSubmittingFirstTurn}
              onClick={() => onAddCollaborator?.(branchIndex)}
              aria-label="Add another model to collaborate"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v10" />
                <path d="M3 8h10" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="parallelStubTargetControls">
          <AudienceChip
            audienceParticipants={displayParticipants}
            allParticipants={allParticipants}
            onSetAudienceKeys={onSetAudienceKeys
              ? (keys) => onSetAudienceKeys(branchIndex, keys)
              : undefined}
            onSingleClick={onOpenAudience}
            disabled={isSubmittingFirstTurn}
            maxSelectedParticipants={maxAudienceParticipants}
            workflowShape={workflowShape}
            onToggleWorkflowShape={onToggleWorkflowShape
              ? () => onToggleWorkflowShape(branchIndex)
              : undefined}
          />
          <button
            type="button"
            className={`parallelStubRemove${useDangerParallelRemoveHover ? ' parallelStubRemoveDanger' : ''}`}
            disabled={isSubmittingFirstTurn || !canRemoveParallelTarget}
            onClick={() => onRemoveParallelTarget?.(branchIndex)}
            aria-label="Remove parallel chat"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
