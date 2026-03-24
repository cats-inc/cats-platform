import type { OrchestratorChannelRouter } from '../../../platform/orchestration/contracts.js';
import type { CompanionBoxStore } from './companionBoxStore.js';
import type { ChatStore } from './store.js';
import { buildChannelView } from './model.js';
import { routeChannelMessage } from './runtimeActions.js';

export const chatOrchestratorChannelRouter: OrchestratorChannelRouter<CompanionBoxStore> = {
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
