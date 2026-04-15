import {
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  createCatActorId,
} from '../../../core/actors.js';
import type { TaskExecutionLocator } from '../../../core/taskExecutionLocator.js';
import {
  resolveOrchestratorLeaseAttachment,
  resolveParticipantLeaseAttachment,
} from '../shared/channelParticipants.js';
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

      const orchestratorAttachment = resolveOrchestratorLeaseAttachment(channel);
      return {
        orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
        orchestratorLaneId: orchestratorAttachment?.laneId ?? null,
        orchestratorSessionId: orchestratorAttachment?.sessionId ?? null,
        participants: channel.catAssignments.map((assignment) => {
          const attachment = resolveParticipantLeaseAttachment(channel, assignment.participantId);
          return {
            actorId: createCatActorId(assignment.catId),
            status: assignment.status,
            laneId: attachment?.laneId ?? null,
            sessionId: attachment?.sessionId ?? null,
          };
        }),
      };
    },
  };
}
