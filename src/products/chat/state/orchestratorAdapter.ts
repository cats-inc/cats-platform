import type {
  OrchestratorChannelRouter,
  OrchestratorPlannerSurface,
} from '../../../platform/orchestration/contracts.js';
import { buildApprovalQueue } from '../../../core/model/index.js';
import type { CompanionBoxStore } from './companion-box/index.js';
import type { ChatState } from '../api/contracts.js';
import type { ChatStore } from './store.js';
import { buildChannelView, resolveOrchestratorDisplayName } from './model/index.js';
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
