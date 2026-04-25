import type { EvidenceEvent } from '../../core/types.js';
import {
  appendEvidenceEvent,
} from '../persistence/evidence.js';
import type {
  ToolBoundaryEvidenceEvent,
  ToolBoundaryEvidenceSink,
} from './toolBoundary.js';

export interface DurableToolEvidenceSinkOptions {
  dataDir: string;
  conversationId: string;
  sessionId?: string | null;
}

export function createDurableToolEvidenceSink(
  options: DurableToolEvidenceSinkOptions,
): ToolBoundaryEvidenceSink {
  const events: ToolBoundaryEvidenceEvent[] = [];

  return {
    append(event) {
      events.push(event);
      appendEvidenceEvent(
        options.dataDir,
        options.conversationId,
        toEvidenceEvent(event, options),
      );
    },
    read() {
      return [...events];
    },
  };
}

export function toEvidenceEvent(
  event: ToolBoundaryEvidenceEvent,
  options: DurableToolEvidenceSinkOptions,
): EvidenceEvent {
  return {
    id: event.eventId,
    conversationId: options.conversationId,
    sessionId: options.sessionId ?? null,
    layer: 'evidence',
    actorId: event.actorRef,
    kind: 'system_event',
    timestamp: event.occurredAt,
    payload: {
      source: 'supervision_tool_boundary',
      actionId: event.actionId,
      runId: event.runId,
      toolName: event.toolName,
      status: event.status,
      ...(event.toolManifest ? { toolManifest: event.toolManifest } : {}),
      ...(event.policySnapshotRef ? { policySnapshotRef: event.policySnapshotRef } : {}),
      ...(event.rejectionCode ? { rejectionCode: event.rejectionCode } : {}),
      ...(event.approvalRequestId ? { approvalRequestId: event.approvalRequestId } : {}),
      ...(event.cancellationContext
        ? { cancellationContext: event.cancellationContext }
        : {}),
      ...(event.summary ? { summary: event.summary } : {}),
    },
  };
}
