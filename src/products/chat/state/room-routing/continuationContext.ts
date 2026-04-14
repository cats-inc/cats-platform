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
  targets: RoomRoutingParticipantRef[];
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
      targets: readParticipantRefs(event.targets),
    };
  }

  return null;
}
