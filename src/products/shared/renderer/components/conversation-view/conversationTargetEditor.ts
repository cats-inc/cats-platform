import type { ChatCat } from '../../../api/workspaceContracts.js';
import {
  resolveParticipantCatId,
  type ResolvedChannelParticipant,
} from '../../../channelParticipants.js';
import type { AudienceTargetEditor, AudienceTargetEditorAction } from '../AudienceChip.js';
import type { ExecutionTargetValue } from '../ExecutionTarget.js';
import type { DraftComposerStackParticipant } from '../newConversationDraftSupport.js';
import { sameExecutionTargetValue } from '../../hooks/useWorkspaceExecutionTargetState.js';

export interface ConversationTargetEditorContext {
  activeRoomParticipants: ResolvedChannelParticipant[];
  defaultRecipientParticipant: ResolvedChannelParticipant | null;
  directLaneCat: ChatCat | null;
  directLaneExecutionTarget: ExecutionTargetValue | null;
  isDirectLane: boolean;
  onDirectLaneExecutionTargetChange?: (catId: string, value: ExecutionTargetValue) => void;
  onUpdateParticipantTarget?: (participantId: string, value: ExecutionTargetValue) => void;
  /** Saves a temporary participant's name or role hint. */
  onUpdateParticipantProfile?: (
    participantId: string,
    update: { name?: string; roleHint?: string | null },
  ) => void;
  /** Opens a cat's own page, where its default model lives. */
  openCatPage: (catId: string) => void;
  /** A room participant's conversation actions: coordinating, removing. */
  resolveParticipantActions?: (participantId: string) => AudienceTargetEditorAction[];
}

/**
 * The composer chip edits the same target the send path uses: the
 * participant's own target. A cat's default model stays on the cat's own
 * page; a temporary participant also edits its name and role hint here.
 */
export function resolveConversationTargetEditor(
  participant: DraftComposerStackParticipant,
  context: ConversationTargetEditorContext,
): AudienceTargetEditor | null {
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
    const onUpdateParticipantProfile = context.onUpdateParticipantProfile;
    const actions = context.resolveParticipantActions?.(roomParticipant.participantId) ?? [];
    return {
      target,
      onChange: (value) => {
        // The picker republishes labels; only a real change is saved.
        if (!sameExecutionTargetValue(target, value)) {
          onUpdateParticipantTarget(roomParticipant.participantId, value);
        }
      },
      onOpenSettings: catId ? () => context.openCatPage(catId) : undefined,
      actions: actions.length > 0 ? actions : undefined,
      profile: catId
        ? undefined
        : {
            name: roomParticipant.name,
            roleHint: roomParticipant.roleHint ?? null,
            onSave: onUpdateParticipantProfile
              ? (update) => onUpdateParticipantProfile(roomParticipant.participantId, update)
              : undefined,
          },
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
