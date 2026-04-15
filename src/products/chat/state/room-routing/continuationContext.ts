import type { CoreRecordMetadata } from '../../../../core/types.js';
import type {
  RoomRoutingParticipantRef,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import {
  readMetadataRecord,
  readMetadataString,
  readMetadataStringArray,
  readParticipantRefs,
} from '../core-projection/entityMetadata.js';

export interface WorkflowContinuationContext {
  event: RoomWorkflowTurn['events'][number];
  metadata: CoreRecordMetadata;
  targets: WorkflowContinuationContextTarget[];
}

export interface WorkflowContinuationContextTarget extends RoomRoutingParticipantRef {
  laneId: string | null;
  sessionId: string | null;
}

export function hasWorkflowContinuationContextMetadata(
  metadata: CoreRecordMetadata | null | undefined,
): boolean {
  return (
    readMetadataString(metadata, 'continuationSource') !== null
    || readMetadataRecord(metadata?.workflowRecommendation) !== null
    || readMetadataStringArray(metadata, 'unresolvedTargets').length > 0
    || readMetadataStringArray(metadata, 'mentionNames').length > 0
    || readMetadataString(metadata, 'branchStrategy') !== null
  );
}

function readWorkflowContinuationTargetIdentities(
  metadata: CoreRecordMetadata | null | undefined,
): Array<{
  participantKind: RoomRoutingParticipantRef['participantKind'];
  participantId: string;
  laneId: string | null;
  sessionId: string | null;
}> {
  const rawTargetIdentities = metadata?.targetIdentities;
  if (!Array.isArray(rawTargetIdentities)) {
    return [];
  }

  return rawTargetIdentities.flatMap((value) => {
    const record = readMetadataRecord(value);
    if (!record) {
      return [];
    }
    const participantKind = record.participantKind === 'orchestrator' || record.participantKind === 'cat'
      ? record.participantKind
      : null;
    const participantId = readMetadataString(record, 'participantId');
    if (!participantKind || !participantId) {
      return [];
    }

    return [{
      participantKind,
      participantId,
      laneId: readMetadataString(record, 'laneId'),
      sessionId: readMetadataString(record, 'sessionId'),
    }];
  });
}

export function mergeWorkflowContinuationTargets(
  targets: ReadonlyArray<RoomRoutingParticipantRef>,
  metadata: CoreRecordMetadata | null | undefined,
): WorkflowContinuationContextTarget[] {
  const targetIdentities = readWorkflowContinuationTargetIdentities(metadata);
  return targets.map((target, targetIndex) => {
    const indexedIdentity = targetIdentities[targetIndex] ?? null;
    const matchingIdentity = (
      indexedIdentity?.participantKind === target.participantKind
      && indexedIdentity.participantId === target.participantId
    )
      ? indexedIdentity
      : targetIdentities.find((candidate) =>
        candidate.participantKind === target.participantKind
        && candidate.participantId === target.participantId)
        ?? null;
    return {
      participantKind: target.participantKind,
      participantId: target.participantId,
      participantName: target.participantName,
      laneId: matchingIdentity?.laneId ?? null,
      sessionId: matchingIdentity?.sessionId ?? null,
    };
  });
}

export function readLatestWorkflowContinuationContext(
  turn: RoomWorkflowTurn | null,
  options: {
    excludeEventId?: string | null;
  } = {},
): WorkflowContinuationContext | null {
  if (!turn) {
    return null;
  }

  for (const event of [...turn.events].reverse()) {
    if (options.excludeEventId && event.id === options.excludeEventId) {
      continue;
    }

    const metadata = readMetadataRecord(event.metadata);
    if (!metadata || !hasWorkflowContinuationContextMetadata(metadata)) {
      continue;
    }

    return {
      event,
      metadata,
      targets: mergeWorkflowContinuationTargets(readParticipantRefs(event.targets), metadata),
    };
  }

  return null;
}
