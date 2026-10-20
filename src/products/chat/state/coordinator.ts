import type { ChatState } from '../api/contracts.js';
import { isAdminCatId } from '../../shared/catGroups.js';
import { resolveChannelParticipantAssignments } from '../shared/channelParticipants.js';
import { requireChannel } from './model/index.js';

/** Whether this participant is bound to the conversation's orchestrator. */
export function isConversationCoordinator(
  state: ChatState,
  channelId: string,
  participantId: string | null | undefined,
): boolean {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  return Boolean(participantId) && channel?.coordinatorParticipantId === participantId;
}

/**
 * Only the coordinator routes turns on; any other participant answers and
 * stops. The legacy default chat's orchestrator still routes until it goes.
 */
export function targetRoutesOn(
  state: ChatState,
  channelId: string,
  target: { participantKind: 'orchestrator' | 'cat'; participantId: string },
): boolean {
  return target.participantKind === 'orchestrator'
    || isConversationCoordinator(state, channelId, target.participantId);
}

/** The provider-agent actor ref a participant acts under. */
export function participantActorRef(participantId: string): string {
  return `cat:${participantId}`;
}

/** Whether an actor ref is the conversation's coordinator. */
export function isCoordinatorActorRef(
  state: ChatState,
  channelId: string,
  actorRef: string,
): boolean {
  return actorRef.startsWith('cat:')
    && isConversationCoordinator(state, channelId, actorRef.slice('cat:'.length));
}

/** Whether an actor ref is the conversation's coordinator and a Boss Cat. */
export function isAdminCoordinatorActorRef(
  state: ChatState,
  channelId: string,
  actorRef: string,
): boolean {
  return actorRef.startsWith('cat:')
    && isAdminCoordinator(state, channelId, actorRef.slice('cat:'.length));
}

/** The coordinator's participant record, while it is still active. */
export function resolveCoordinatorParticipant(state: ChatState, channelId: string) {
  const channel = requireChannel(state, channelId);
  return resolveChannelParticipantAssignments(channel).find((assignment) =>
    assignment.status === 'active' && assignment.participantId === channel.coordinatorParticipantId) ?? null;
}

/**
 * Actions beyond the conversation need its coordinator to be a Boss Cat
 * (an admin cat): coordinator × admin, never the role or the group alone.
 */
export function isAdminCoordinator(
  state: ChatState,
  channelId: string,
  participantId: string | null | undefined,
): boolean {
  if (!isConversationCoordinator(state, channelId, participantId)) {
    return false;
  }
  const participant = resolveChannelParticipantAssignments(requireChannel(state, channelId))
    .find((assignment) => assignment.participantId === participantId && assignment.status === 'active');
  return participant?.sourceKind === 'cat'
    && isAdminCatId(state.cats, participant.sourceRefId ?? participant.participantId);
}
