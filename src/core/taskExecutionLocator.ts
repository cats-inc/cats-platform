import type { CatsCoreState, CoreTaskRecord } from './types.js';

export interface TaskExecutionParticipantState {
  actorId: string;
  status: string;
  laneId: string | null;
  sessionId: string | null;
}

export interface TaskExecutionConversationState {
  orchestratorActorId: string | null;
  orchestratorLaneId: string | null;
  orchestratorSessionId: string | null;
  participants: TaskExecutionParticipantState[];
}

export interface TaskExecutionLocator {
  resolveTaskConversation(
    core: CatsCoreState,
    task: CoreTaskRecord,
  ): Promise<TaskExecutionConversationState | null> | TaskExecutionConversationState | null;
}

export function resolveTaskConversationSessionId(
  conversation: TaskExecutionConversationState | null,
  actorId: string,
): string | null {
  return resolveTaskConversationAttachment(conversation, actorId)?.sessionId ?? null;
}

export function resolveTaskConversationAttachment(
  conversation: TaskExecutionConversationState | null,
  actorId: string,
): {
  laneId: string | null;
  sessionId: string | null;
} | null {
  if (!conversation) {
    return null;
  }

  if (actorId === conversation.orchestratorActorId) {
    return {
      laneId: conversation.orchestratorLaneId,
      sessionId: conversation.orchestratorSessionId,
    };
  }

  const participant = conversation.participants.find((candidate) =>
    candidate.status === 'active' && candidate.actorId === actorId);
  return participant
    ? {
        laneId: participant.laneId,
        sessionId: participant.sessionId,
      }
    : null;
}
