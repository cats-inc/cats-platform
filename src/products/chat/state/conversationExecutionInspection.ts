import type { ChatStore } from './store.js';
import type { ConversationExecutionInspector, ConversationExecutionBinding,
  ConversationExecutionParticipant } from '../../../shared/conversationExecutionInspection.js';
import { buildChatAssignedParticipantId, buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { buildRoomWorkflowRunId, buildRoomWorkflowMissionId } from '../../../platform/orchestration/runIds.js';
import { ownerEntry } from '../../../core/ownerLifecycle.js';
import { resolveChannelParticipantAssignments, resolveParticipantLeaseAttachment } from '../shared/channelParticipants.js';

/** The shared conversation engine supplies provenance without starting/resuming or writing anything. */
export function createConversationExecutionInspector(store: ChatStore): ConversationExecutionInspector {
  return {
    subscribe: listener => store.subscribeCore?.(() => listener()) ?? (() => {}),
    async read(conversationId) {
      const [chat, core] = await Promise.all([store.read(), store.readCore()]);
      const channel = chat.channels.find(entry => buildChatConversationId(entry.id) === conversationId);
      if (!channel || !core.conversations.some(entry => entry.id === conversationId
        && entry.sourceChannelId === channel.id)) return null;
      const assignments = resolveChannelParticipantAssignments(channel).filter(entry => entry.status === 'active');
      let truncated = assignments.length > 32;
      const workflow = channel.roomRouting?.workflow;
      const turns = [...(workflow?.turnHistory ?? []), ...(workflow?.activeTurn ? [workflow.activeTurn] : [])];
      const participants: ConversationExecutionParticipant[] = assignments.slice(0, 32).map(assignment => {
        const canonicalParticipantId = buildChatAssignedParticipantId(channel.id, assignment.participantId);
        const lease = resolveParticipantLeaseAttachment(channel, assignment.participantId);
        const bindings: ConversationExecutionBinding[] = [];
        for (const turn of turns) {
          const runId = buildRoomWorkflowRunId(channel.id, turn.id);
          const intent = ownerEntry(core, 'run', runId);
          if (intent?.deleted || intent?.logsClearedAt) continue;
          for (const target of turn.targetStatuses) {
            if (target.participant.participantId !== assignment.participantId || !target.laneId) continue;
            const mission = ownerEntry(core, 'mission', buildRoomWorkflowMissionId(channel.id, turn.id, target.id));
            if (mission?.deleted || mission?.logsClearedAt) continue;
            const sessionId = target.sessionId
              || (lease?.laneId === target.laneId ? lease.sessionId : null);
            if (sessionId) bindings.push({ sessionId, turnId: turn.id, laneId: target.laneId,
              runId, targetStateId: target.id });
          }
        }
        // Canonical retained sessions may outlive the engine's bounded turn history.
        for (const session of core.sessions) {
          if (session.conversationId !== conversationId || session.participantId !== canonicalParticipantId
            || !session.turnId || !session.laneId) continue;
          const lane = core.lanes.find(entry => entry.id === session.laneId
            && entry.conversationId === conversationId && entry.participantId === canonicalParticipantId
            && entry.turnId === session.turnId);
          if (!lane) continue;
          const runId = buildRoomWorkflowRunId(channel.id, session.turnId);
          const intent = ownerEntry(core, 'run', runId);
          const targetStateId = typeof lane.metadata.targetStateId === 'string' ? lane.metadata.targetStateId : null;
          const mission = targetStateId ? ownerEntry(core, 'mission',
            buildRoomWorkflowMissionId(channel.id, session.turnId, targetStateId)) : undefined;
          if (intent?.deleted || intent?.logsClearedAt || mission?.deleted || mission?.logsClearedAt) continue;
          if (!bindings.some(entry => entry.sessionId === session.id && entry.turnId === session.turnId
            && entry.laneId === session.laneId)) bindings.push({ sessionId: session.id, turnId: session.turnId,
              laneId: session.laneId, runId, targetStateId });
        }
        const activeBindings = bindings.filter(binding => binding.turnId === workflow?.activeTurn?.id
          && ['pending', 'running', 'waiting_for_converge'].includes(workflow.activeTurn.status)
          && workflow.activeTurn.targetStatuses.some(target => target.id === binding.targetStateId
            && target.laneId === binding.laneId && ['pending', 'running'].includes(target.status)));
        const currentIds = new Set([...(lease?.sessionId ? [lease.sessionId] : []),
          ...activeBindings.map(binding => binding.sessionId)]);
        const historical = [...new Set(bindings.map(entry => entry.sessionId))].reverse()
          .filter(id => !currentIds.has(id));
        const allIds = [...currentIds, ...historical];
        if (allIds.length > 4) truncated = true;
        const sessionIds = allIds.slice(0, 4);
        return { participantId: assignment.participantId, canonicalParticipantId,
          sourceKind: assignment.sourceKind, sourceRefId: assignment.sourceRefId, name: assignment.name,
          coordinator: channel.coordinatorParticipantId === assignment.participantId,
          attempts: sessionIds.map(sessionId => {
            const allowed = bindings.filter(entry => entry.sessionId === sessionId);
            if (allowed.length > 32) truncated = true;
            const active = activeBindings.filter(binding => binding.sessionId === sessionId);
            return { sessionId, current: currentIds.has(sessionId),
              attached: channel.status !== 'archived' && (active.length > 0 || sessionId === lease?.sessionId
                && (lease.status === 'ready' || lease.status === 'initializing')),
              startedAt: sessionId === lease?.sessionId ? lease.startedAt
                : core.sessions.find(entry => entry.id === sessionId)?.startedAt ?? null,
              bindings: allowed.slice(-32), activeBindings: active.slice(-32) };
          }) };
      });
      // A session cannot simultaneously authorize two participant identities.
      const owners = new Map<string, string>();
      const ambiguous = new Set<string>();
      for (const participant of participants) for (const attempt of participant.attempts) {
        const prior = owners.get(attempt.sessionId);
        if (prior && prior !== participant.participantId) ambiguous.add(attempt.sessionId);
        owners.set(attempt.sessionId, participant.participantId);
      }
      for (const participant of participants) participant.attempts = participant.attempts
        .filter(attempt => !ambiguous.has(attempt.sessionId));
      truncated ||= ambiguous.size > 0;
      const context = { conversationId, channelId: channel.id, origin: channel.originSurface ?? '',
        owned: channel.ownerActorId === core.ownerProfile.actorId, rootPath: channel.repoPath,
        participants, truncated };
      return { ...context, bindingKey: JSON.stringify(context) };
    },
  };
}
