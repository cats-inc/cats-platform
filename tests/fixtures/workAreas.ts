import { readFileSync } from 'node:fs';
import type { ConversationExecutionInspection, ConversationExecutionBinding } from '../../src/shared/conversationExecutionInspection.ts';
import type { RuntimeWorkspaceActivitySnapshot } from '../../src/runtime/workspaceActivity.ts';

export function workAreaContext(): ConversationExecutionInspection {
  const binding: ConversationExecutionBinding = { sessionId: 'session-a', turnId: 'turn-a', laneId: 'lane-a',
    runId: 'product-run-a', targetStateId: 'target-a' };
  return { conversationId: 'conversation-a', channelId: 'channel-a', origin: 'code', owned: true,
    rootPath: '/fixture/cats-inc', bindingKey: 'initial', truncated: false, participants: [{
      participantId: 'participant-a', canonicalParticipantId: 'canonical-a', sourceKind: 'provider_model',
      sourceRefId: null, name: 'Coder', coordinator: true,
      attempts: [{ sessionId: 'session-a', current: true, attached: true, startedAt: '2026-10-20T00:00:00.000Z',
        bindings: [binding], activeBindings: [binding] }],
    }] };
}

/** Copied from Runtime 57b449e3's redacted live Windows Claude snapshot. */
export function runtimeSnapshot(sessionId = 'session-a', executionId = 'runtime-run-a', running = false): RuntimeWorkspaceActivitySnapshot {
  const snapshot = JSON.parse(readFileSync(new URL('./runtime-workspace-activity.json', import.meta.url), 'utf8')) as RuntimeWorkspaceActivitySnapshot;
  snapshot.sessionId = sessionId;
  for (const row of snapshot.workspaces) for (const operation of row.recentOperations) operation.executionId = executionId;
  if (running) {
    const row = snapshot.workspaces[0];
    const operation = row.recentOperations.shift()!;
    operation.state = 'running'; delete operation.endedAt;
    row.runningOperations.push(operation);
  }
  return snapshot;
}

export function runtimeInspection(context: ConversationExecutionInspection,
  snapshot = runtimeSnapshot(), binding = context.participants[0].attempts[0].bindings[0]) {
  const participant = context.participants.find(entry => entry.attempts.some(attempt => attempt.sessionId === snapshot.sessionId))!;
  const executionId = [...snapshot.workspaces[0].runningOperations, ...snapshot.workspaces[0].recentOperations][0].executionId;
  return { session: { id: snapshot.sessionId, inspection: { workspaceActivity: snapshot,
    currentRun: { id: executionId, wake: { metadata: { conversationId: context.conversationId,
      channelId: context.channelId, targetId: participant.participantId, turnId: binding.turnId,
      laneId: binding.laneId, targetStateId: binding.targetStateId } } } } } };
}
