import type {
  ChannelCatAssignment,
  ChannelParticipantAssignment,
  ChatChannelCat,
  ChatChannelParticipant,
  ChatChannelState,
  ChatChannelView,
  ParticipantExecutionLease,
} from '../api/contracts.js';

export type ResolvedChannelParticipant = ChatChannelParticipant | ChatChannelCat;

export interface ParticipantLeaseAttachment {
  participantId: string;
  sessionId: string | null;
  laneId: string | null;
  status: ParticipantExecutionLease['status'];
  cwd: string | null;
  startedAt: string | null;
  lastError: string | null;
}

export interface OrchestratorLeaseAttachment {
  participantId: 'orchestrator';
  sessionId: string | null;
  laneId: string | null;
  status: ParticipantExecutionLease['status'];
  cwd: string | null;
  startedAt: string | null;
  lastError: string | null;
}

export type ChannelLeaseAttachment = ParticipantLeaseAttachment | OrchestratorLeaseAttachment;

function pushUniqueNonEmpty(target: Set<string>, value: string | null | undefined): void {
  const normalized = value?.trim();
  if (normalized) {
    target.add(normalized);
  }
}

function mapCatAssignmentToParticipantAssignment(
  assignment: ChannelCatAssignment,
): ChannelParticipantAssignment {
  return {
    participantId: assignment.participantId,
    sourceKind: assignment.sourceKind,
    sourceRefId: assignment.sourceRefId,
    name: assignment.name,
    status: assignment.status,
    roles: structuredClone(assignment.roles),
    roleHint: assignment.roleHint,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    execution: structuredClone(assignment.execution),
  };
}

function mergeParticipantAssignments(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
): ChannelParticipantAssignment[] {
  const catParticipants = channel.catAssignments.map(mapCatAssignmentToParticipantAssignment);
  const adhocParticipants = Array.isArray(channel.participantAssignments)
    ? channel.participantAssignments.filter((assignment) => assignment.sourceKind !== 'cat')
    : [];

  return [
    ...catParticipants,
    ...adhocParticipants,
  ];
}

export function resolveChannelParticipantAssignments(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  options: { clone?: boolean } = {},
): ChannelParticipantAssignment[] {
  const assignments = mergeParticipantAssignments(channel);
  return options.clone ? structuredClone(assignments) : assignments;
}

export function resolveAssignedParticipants(
  channel: Pick<ChatChannelView, 'assignedParticipants' | 'assignedCats'>,
): ResolvedChannelParticipant[] {
  return channel.assignedParticipants && channel.assignedParticipants.length > 0
    ? channel.assignedParticipants
    : channel.assignedCats;
}

export function activeAssignedParticipants(
  channel: Pick<ChatChannelView, 'assignedParticipants' | 'assignedCats'>,
): ResolvedChannelParticipant[] {
  return resolveAssignedParticipants(channel).filter((participant) => participant.status === 'active');
}

export function findAssignedParticipant(
  channel: Pick<ChatChannelView, 'assignedParticipants' | 'assignedCats'>,
  participantId: string,
): ResolvedChannelParticipant | null {
  return resolveAssignedParticipants(channel).find(
    (participant) => participant.participantId === participantId,
  ) ?? null;
}

export function resolveParticipantCatId(
  participant: Pick<ChatChannelParticipant, 'sourceKind' | 'sourceRefId'>
    & Partial<Pick<ChatChannelCat, 'catId'>>,
): string | null {
  if ('catId' in participant && typeof participant.catId === 'string' && participant.catId.length > 0) {
    return participant.catId;
  }

  return participant.sourceKind === 'cat'
    ? participant.sourceRefId
    : null;
}

export function resolveParticipantExecutionAssignments(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  participantId: string,
): {
  participantAssignment: ChannelParticipantAssignment | null;
  catAssignment: ChannelCatAssignment | null;
} {
  const participantAssignment = resolveChannelParticipantAssignments(channel).find(
    (candidate) => candidate.participantId === participantId,
  ) ?? null;
  const catRef = participantAssignment ? resolveParticipantCatId(participantAssignment) : null;
  const catAssignment = channel.catAssignments.find((candidate) =>
    candidate.participantId === participantId
    || candidate.catId === participantId
    || (catRef != null && candidate.catId === catRef)
  ) ?? null;

  return { participantAssignment, catAssignment };
}

export function resolvePrimaryParticipantExecutionAssignment(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  participantId: string,
): ChannelParticipantAssignment | ChannelCatAssignment | null {
  const { participantAssignment, catAssignment } = resolveParticipantExecutionAssignments(
    channel,
    participantId,
  );
  if (participantAssignment?.sourceKind === 'cat' && catAssignment) {
    return catAssignment;
  }
  return participantAssignment ?? catAssignment;
}

export function resolveParticipantExecutionLease(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  participantId: string,
): ParticipantExecutionLease | null {
  return resolvePrimaryParticipantExecutionAssignment(
    channel,
    participantId,
  )?.execution.lease ?? null;
}

export function resolveOrchestratorExecutionLease(
  channel: Pick<ChatChannelState, 'orchestratorLease'>,
): ParticipantExecutionLease {
  return channel.orchestratorLease;
}

export function resolveParticipantLeaseAttachment(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  participantId: string,
  options: {
    laneId?: string | null;
    statuses?: ReadonlyArray<ParticipantExecutionLease['status']>;
  } = {},
): ParticipantLeaseAttachment | null {
  const lease = resolveParticipantExecutionLease(channel, participantId);
  if (!lease) {
    return null;
  }
  const expectedLaneId = options.laneId?.trim() || null;
  if (options.statuses && !options.statuses.includes(lease.status)) {
    return null;
  }
  const laneId = lease.laneId?.trim() || null;
  if (expectedLaneId && laneId !== expectedLaneId) {
    return null;
  }
  return {
    participantId,
    sessionId: lease.sessionId?.trim() || null,
    laneId,
    status: lease.status,
    cwd: lease.cwd?.trim() || null,
    startedAt: lease.startedAt ?? null,
    lastError: lease.lastError ?? null,
  };
}

export function resolveParticipantSessionId(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  participantId: string,
  options: {
    laneId?: string | null;
    statuses?: ReadonlyArray<ParticipantExecutionLease['status']>;
  } = {},
): string | null {
  return resolveParticipantLeaseAttachment(channel, participantId, options)?.sessionId ?? null;
}

export function resolveOrchestratorLeaseAttachment(
  channel: Pick<ChatChannelState, 'orchestratorLease'>,
  options: {
    laneId?: string | null;
    statuses?: ReadonlyArray<ParticipantExecutionLease['status']>;
  } = {},
): OrchestratorLeaseAttachment | null {
  const lease = channel.orchestratorLease;
  const expectedLaneId = options.laneId?.trim() || null;
  if (options.statuses && !options.statuses.includes(lease.status)) {
    return null;
  }
  const laneId = lease.laneId?.trim() || null;
  if (expectedLaneId && laneId !== expectedLaneId) {
    return null;
  }
  return {
    participantId: 'orchestrator',
    sessionId: lease.sessionId?.trim() || null,
    laneId,
    status: lease.status,
    cwd: lease.cwd?.trim() || null,
    startedAt: lease.startedAt ?? null,
    lastError: lease.lastError ?? null,
  };
}

export function collectParticipantLeaseAttachments(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  options: {
    includeRemoved?: boolean;
    laneId?: string | null;
    statuses?: ReadonlyArray<ParticipantExecutionLease['status']>;
  } = {},
): ParticipantLeaseAttachment[] {
  const attachments: ParticipantLeaseAttachment[] = [];
  for (const assignment of resolveChannelParticipantAssignments(channel)) {
    if (!options.includeRemoved && assignment.status === 'removed') {
      continue;
    }
    const attachment = resolveParticipantLeaseAttachment(channel, assignment.participantId, {
      laneId: options.laneId,
      statuses: options.statuses,
    });
    if (!attachment) {
      continue;
    }
    attachments.push(attachment);
  }
  return attachments;
}

export function collectParticipantSessionIds(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  options: {
    includeRemoved?: boolean;
    laneId?: string | null;
    statuses?: ReadonlyArray<ParticipantExecutionLease['status']>;
  } = {},
): string[] {
  const sessionIds = new Set<string>();
  for (const attachment of collectParticipantLeaseAttachments(channel, options)) {
    pushUniqueNonEmpty(sessionIds, attachment.sessionId);
  }
  return [...sessionIds];
}

export function collectChannelLeaseAttachments(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments' | 'orchestratorLease'>,
  options: {
    includeOrchestrator?: boolean;
    includeRemoved?: boolean;
    laneId?: string | null;
    statuses?: ReadonlyArray<ParticipantExecutionLease['status']>;
  } = {},
): ChannelLeaseAttachment[] {
  const attachments: ChannelLeaseAttachment[] = collectParticipantLeaseAttachments(channel, options);
  if (options.includeOrchestrator === false) {
    return attachments;
  }
  const orchestratorAttachment = resolveOrchestratorLeaseAttachment(channel, {
    laneId: options.laneId,
    statuses: options.statuses,
  });
  if (orchestratorAttachment) {
    attachments.push(orchestratorAttachment);
  }
  return attachments;
}

export function collectChannelSessionIds(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments' | 'orchestratorLease'>,
  options: {
    includeOrchestrator?: boolean;
    includeRemoved?: boolean;
    laneId?: string | null;
    statuses?: ReadonlyArray<ParticipantExecutionLease['status']>;
  } = {},
): string[] {
  const sessionIds = new Set<string>();
  for (const attachment of collectChannelLeaseAttachments(channel, options)) {
    pushUniqueNonEmpty(sessionIds, attachment.sessionId);
  }
  return [...sessionIds];
}

export function collectParticipantLeaseCwds(
  channel: Pick<ChatChannelState, 'participantAssignments' | 'catAssignments'>,
  options: {
    includeRemoved?: boolean;
  } = {},
): string[] {
  const cwds = new Set<string>();
  for (const assignment of resolveChannelParticipantAssignments(channel)) {
    if (!options.includeRemoved && assignment.status === 'removed') {
      continue;
    }
    const effectiveAssignment = resolvePrimaryParticipantExecutionAssignment(
      channel,
      assignment.participantId,
    );
    if (!effectiveAssignment) {
      continue;
    }
    pushUniqueNonEmpty(cwds, effectiveAssignment.execution.lease.cwd);
  }
  return [...cwds];
}
