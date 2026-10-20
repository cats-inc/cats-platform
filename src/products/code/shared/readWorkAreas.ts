import { isWorkspaceIdentity } from '../../../runtime/workspaceActivity.js';
import type { CodeConversationWorkAreas } from './workAreas.js';

const object = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 256): value is string => typeof value === 'string'
  && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/u.test(value);
const nullable = (value: unknown, max = 256) => value === null || text(value, max);
const choice = (value: unknown, options: string[]) => typeof value === 'string' && options.includes(value);
const timestamp = (value: unknown) => text(value, 32) && Number.isFinite(Date.parse(value));
const list = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));

/** Validate the bounded product projection before it becomes renderer state. No filesystem work. */
export function readCodeWorkAreas(value: unknown, conversationId: string): CodeConversationWorkAreas | null {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024) return null;
    if (!object(value) || !keys(value, ['schemaVersion', 'conversationId', 'channelId', 'codespace', 'participants', 'truncated'])
      || value.schemaVersion !== 1 || value.conversationId !== conversationId || !text(value.channelId, 512)
      || typeof value.truncated !== 'boolean' || !object(value.codespace) || !keys(value.codespace, ['path'])
      || !nullable(value.codespace.path, 4096) || !list(value.participants, 32)) return null;
    const participants = new Set<string>();
    for (const participant of value.participants) {
      if (!object(participant) || !keys(participant, ['participantId', 'canonicalParticipantId', 'name', 'sourceKind',
        'sourceRefId', 'coordinator', 'executions', 'repositories']) || !text(participant.participantId)
        || !text(participant.canonicalParticipantId, 512) || typeof participant.name !== 'string' || participant.name.length > 200
        || !text(participant.sourceKind, 128) || !nullable(participant.sourceRefId) || typeof participant.coordinator !== 'boolean'
        || !list(participant.executions, 4) || !list(participant.repositories, 32) || participants.has(participant.participantId)) return null;
      participants.add(participant.participantId);
      const sessions = new Set<string>();
      for (const execution of participant.executions) {
        if (!object(execution) || !keys(execution, ['sessionId', 'current', 'continuity', 'coverage', 'observationEpoch',
          'revision', 'observedAt', 'startupCwd', 'runtimeCwd']) || !text(execution.sessionId) || sessions.has(execution.sessionId)
          || typeof execution.current !== 'boolean' || !choice(execution.continuity, ['current', 'last_known', 'interrupted', 'not_reported'])
          || !object(execution.coverage) || !keys(execution.coverage, ['status', 'reason'])
          || !choice(execution.coverage.status, ['available', 'partial', 'unsupported', 'unavailable'])
          || execution.coverage.reason !== undefined && !text(execution.coverage.reason, 128)
          || !nullable(execution.observationEpoch) || !(execution.revision === null || Number.isSafeInteger(execution.revision)
            && Number(execution.revision) > 0) || !(execution.observedAt === null || timestamp(execution.observedAt))
          || !nullable(execution.startupCwd, 4096) || !nullable(execution.runtimeCwd, 4096)) return null;
        sessions.add(execution.sessionId);
      }
      const checkouts = new Set<string>();
      for (const repository of participant.repositories) {
        if (!object(repository) || !keys(repository, ['id', 'label', 'executionLocationId', 'checkouts'])
          || !text(repository.id, 512) || !nullable(repository.label) || !text(repository.executionLocationId)
          || !list(repository.checkouts, 32)) return null;
        for (const checkout of repository.checkouts) {
          if (!object(checkout) || !keys(checkout, ['checkoutId', 'executionLocationId', 'path', 'repository', 'kind', 'branch',
            'detachedCommit', 'management', 'verification', 'identityObservedAt', 'association', 'operations'])
            || !isWorkspaceIdentity(checkout) || checkout.executionLocationId !== repository.executionLocationId
            || checkouts.has(checkout.checkoutId) || !timestamp(checkout.identityObservedAt)
            || !choice(checkout.association, ['session_binding', 'observed_operation']) || !list(checkout.operations, 16)) return null;
          checkouts.add(checkout.checkoutId);
          if (checkouts.size > 32) return null;
          if (checkout.association === 'session_binding' && checkout.operations.length > 0) return null;
          const operations = new Set<string>();
          for (const operation of checkout.operations) {
            if (!object(operation) || !keys(operation, ['id', 'toolId', 'executionId', 'kind', 'state', 'evidence', 'startedAt',
              'endedAt', 'sessionId', 'turnId', 'laneId', 'runId', 'active', 'displayState'])
              || !text(operation.id) || !text(operation.executionId) || operation.toolId !== undefined && !text(operation.toolId)
              || !text(operation.sessionId) || !sessions.has(operation.sessionId) || !text(operation.turnId) || !text(operation.laneId)
              || !text(operation.runId, 512) || !choice(operation.kind, ['read', 'write', 'test', 'git', 'shell', 'other'])
              || !choice(operation.state, ['running', 'succeeded', 'failed', 'cancelled', 'unknown'])
              || !choice(operation.evidence, ['runtime_tool', 'provider_structured']) || !timestamp(operation.startedAt)
              || !(operation.state === 'running' ? operation.endedAt === undefined : timestamp(operation.endedAt))
              || typeof operation.active !== 'boolean' || operation.active && operation.state !== 'running'
              || operation.active && !participant.executions.some(execution => object(execution)
                && execution.sessionId === operation.sessionId && execution.current && execution.continuity === 'current')
              || operation.displayState !== (operation.state === 'running' && !operation.active ? 'unknown' : operation.state)) return null;
            const id = `${operation.sessionId}:${operation.id}`;
            if (operations.has(id)) return null;
            operations.add(id);
          }
        }
      }
    }
    return value as unknown as CodeConversationWorkAreas;
  } catch { return null; }
}
