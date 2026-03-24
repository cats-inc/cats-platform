import {
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  createCatActorId,
} from '../../../core/actors.js';
import type { TaskExecutionLocator } from '../../../core/taskExecutionLocator.js';
import type { ChatStore } from './store.js';

export function createChatTaskExecutionLocator(
  chatStore: Pick<ChatStore, 'read'>,
): TaskExecutionLocator {
  return {
    async resolveTaskConversation(core, task) {
      if (!task.conversationId) {
        return null;
      }

      const conversation = core.conversations.find((candidate) => candidate.id === task.conversationId);
      if (!conversation?.sourceChannelId) {
        return null;
      }

      const chat = await chatStore.read();
      const channel = chat.channels.find((candidate) => candidate.id === conversation.sourceChannelId);
      if (!channel) {
        return null;
      }

      return {
        orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
        orchestratorSessionId: channel.orchestratorLease.sessionId,
        participants: channel.catAssignments.map((assignment) => ({
          actorId: createCatActorId(assignment.catId),
          status: assignment.status,
          sessionId: assignment.execution.lease.sessionId,
        })),
      };
    },
  };
}
