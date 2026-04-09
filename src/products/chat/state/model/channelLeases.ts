import type {
  ParticipantExecutionLease,
  ChatState,
} from '../../api/contracts.js';
import type { ParticipantSessionStatus } from '../../../../shared/roomRouting.js';

import {
  cloneState,
  isoAt,
  requireChannel,
  updateExecutionLease,
} from './shared.js';
import { resolveParticipantExecutionAssignments } from '../../shared/channelParticipants.js';

export function setChannelOrchestratorLease(
  state: ChatState,
  channelId: string,
  leaseUpdate: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  channel.orchestratorLease = updateExecutionLease(channel.orchestratorLease, leaseUpdate);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelCatLease(
  state: ChatState,
  channelId: string,
  catId: string,
  leaseUpdate: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const assignment = channel.catAssignments.find((candidate) => candidate.catId === catId);

  if (!assignment) {
    throw new Error(`Channel cat assignment not found: ${catId}`);
  }

  assignment.execution.lease = updateExecutionLease(assignment.execution.lease, leaseUpdate);
  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelParticipantLease(
  state: ChatState,
  channelId: string,
  participantId: string,
  leaseUpdate: Partial<ParticipantExecutionLease> & { status?: ParticipantSessionStatus },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const { participantAssignment, catAssignment } = resolveParticipantExecutionAssignments(
    channel,
    participantId,
  );

  if (!participantAssignment && !catAssignment) {
    throw new Error(`Channel participant assignment not found: ${participantId}`);
  }

  if (participantAssignment) {
    participantAssignment.execution.lease = updateExecutionLease(
      participantAssignment.execution.lease,
      leaseUpdate,
    );
  }
  if (catAssignment) {
    catAssignment.execution.lease = updateExecutionLease(
      catAssignment.execution.lease,
      leaseUpdate,
    );
  }

  channel.updatedAt = isoAt(now);
  return nextState;
}
