import type { ChatCat } from '../../../api/workspaceContracts.js';
import {
  resolveParticipantCatId,
  type ResolvedChannelParticipant,
} from '../../../channelParticipants.js';
import type { AudienceTargetEditor } from '../AudienceChip.js';
import type { ExecutionTargetValue } from '../ExecutionTarget.js';
import type { DraftComposerStackParticipant } from '../newConversationDraftSupport.js';
import { sameExecutionTargetValue } from '../../hooks/useWorkspaceExecutionTargetState.js';

export interface ConversationTargetEditorContext {
  activeRoomParticipants: ResolvedChannelParticipant[];
  defaultRecipientParticipant: ResolvedChannelParticipant | null;
  directLaneCat: ChatCat | null;
  directLaneExecutionTarget: ExecutionTargetValue | null;
  isDirectLane: boolean;
  selectedExecutionTarget?: ExecutionTargetValue;
  onExecutionTargetChange?: (value: ExecutionTargetValue) => void;
  onDirectLaneExecutionTargetChange?: (catId: string, value: ExecutionTargetValue) => void;
  onUpdateParticipantTarget?: (participantId: string, value: ExecutionTargetValue) => void;
  /** The default chat's start-fresh action, shown under its picker. */
  startFresh?: AudienceTargetEditor['action'];
  openCatPage: (catId: string) => void;
}

/**
 * The composer chip edits the same target the send path uses: the
 * conversation's own participant target, or the default chat's target. A
 * cat's default model stays on the cat's own page.
 */
export function resolveConversationTargetEditor(
  participant: DraftComposerStackParticipant,
  context: ConversationTargetEditorContext,
): AudienceTargetEditor | null {
  if (participant.key === 'implicit:execution_target') {
    return context.selectedExecutionTarget && context.onExecutionTargetChange
      ? {
          target: context.selectedExecutionTarget,
          onChange: context.onExecutionTargetChange,
          action: context.startFresh,
        }
      : null;
  }
  const matches = (candidate: ResolvedChannelParticipant) => (
    participant.participantId
      ? candidate.participantId === participant.participantId
      : participant.catId != null && resolveParticipantCatId(candidate) === participant.catId
  );
  const roomParticipant = context.activeRoomParticipants.find(matches)
    ?? (context.defaultRecipientParticipant && matches(context.defaultRecipientParticipant)
      ? context.defaultRecipientParticipant
      : null);
  const onUpdateParticipantTarget = context.onUpdateParticipantTarget;
  if (roomParticipant && onUpdateParticipantTarget) {
    const target: ExecutionTargetValue = {
      provider: roomParticipant.execution.target.provider,
      instance: roomParticipant.execution.target.instance ?? null,
      model: roomParticipant.execution.target.model ?? null,
      modelSelection: roomParticipant.execution.modelSelection ?? null,
    };
    const catId = resolveParticipantCatId(roomParticipant);
    return {
      target,
      onChange: (value) => {
        // The picker republishes labels; only a real change is saved.
        if (!sameExecutionTargetValue(target, value)) {
          onUpdateParticipantTarget(roomParticipant.participantId, value);
        }
      },
      onOpenSettings: catId ? () => context.openCatPage(catId) : undefined,
    };
  }
  const { directLaneCat, directLaneExecutionTarget, onDirectLaneExecutionTargetChange } = context;
  if (
    context.isDirectLane
    && directLaneCat
    && participant.catId === directLaneCat.id
    && directLaneExecutionTarget
    && onDirectLaneExecutionTargetChange
  ) {
    // A direct lane that has no participant yet still seeds from the cat.
    return {
      target: directLaneExecutionTarget,
      onChange: (value) => onDirectLaneExecutionTargetChange(directLaneCat.id, value),
      onOpenSettings: () => context.openCatPage(directLaneCat.id),
    };
  }
  return null;
}
