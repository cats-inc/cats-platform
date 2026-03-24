import type {
  OrchestratorChannelRouter,
  OrchestratorPlannerSurface,
} from '../../../platform/orchestration/contracts.js';
import { buildApprovalQueue } from '../../../core/model.js';
import type { CompanionBoxStore } from './companionBoxStore.js';
import type { ChatState } from '../api/contracts.js';
import type { ChatStore } from './store.js';
import { buildChannelView, resolveOrchestratorDisplayName } from './model.js';
import { resolveMentionRoute } from './mentionRouter.js';
import { resolveRoomRoutingState } from './roomRouting.js';
import { routeChannelMessage } from './runtimeActions.js';
import {
  buildChatOperatorView,
  buildRunInspectorView,
  resolveChatConversationId,
} from '../shared/operatorLoop.js';

export const chatOrchestratorChannelRouter: OrchestratorChannelRouter<CompanionBoxStore, ChatState> = {
  buildChannelView,
  async routeChannelMessage(input) {
    return routeChannelMessage(
      input.state,
      input.channelId,
      {
        body: input.body,
        senderName: input.senderName,
      },
      input.runtimeClient,
      input.now,
      {
        transport: input.transport,
        companionStore: input.companionStore,
        memoryService: input.memoryService,
        chatStore: input.chatStore as ChatStore,
      },
    );
  },
};

export const chatOrchestratorPlannerSurface: OrchestratorPlannerSurface<ChatState> = {
  buildChannelView,
  resolveMentionRoute,
  resolveRoomRoutingState,
  resolveOrchestratorDisplayName,
  buildOperatorView(core, channelId) {
    return buildChatOperatorView(
      {
        core,
        approvals: buildApprovalQueue(core),
      },
      channelId,
    );
  },
  buildRunInspectorView,
  resolveConversationId: resolveChatConversationId,
};
