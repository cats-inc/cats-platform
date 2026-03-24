import type { CatsCoreState, CoreTaskRecord } from './types.js';

export interface TaskExecutionParticipantState {
  actorId: string;
  status: string;
  sessionId: string | null;
}

export interface TaskExecutionConversationState {
  orchestratorActorId: string | null;
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
  if (!conversation) {
    return null;
  }

  if (actorId === conversation.orchestratorActorId) {
    return conversation.orchestratorSessionId;
  }

  const participant = conversation.participants.find((candidate) =>
    candidate.status === 'active' && candidate.actorId === actorId);
  return participant?.sessionId ?? null;
}
