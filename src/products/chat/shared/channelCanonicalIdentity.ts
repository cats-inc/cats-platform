import type { ChatState } from '../api/contracts.js';
import {
  buildChatConversationId,
  resolveChatChannelContainerId,
} from '../../../shared/chatCoreIds.js';

export function resolveChannelCanonicalIdentity(
  state: Pick<ChatState, 'parallelChatGroups'> | null | undefined,
  channelId: string,
): {
  containerId: string;
  conversationId: string;
} {
  return {
    containerId: resolveChatChannelContainerId({
      channelId,
      parallelChatGroups: state?.parallelChatGroups ?? null,
    }),
    conversationId: buildChatConversationId(channelId),
  };
}
