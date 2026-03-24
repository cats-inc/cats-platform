import type { MemoryChatSurface } from '../../../platform/memory/contracts.js';
import { requireChannel } from './model/index.js';
import type { ChatStore } from './store.js';

export function createChatMemorySurface(chatStore: ChatStore): MemoryChatSurface {
  return {
    readCore() {
      return chatStore.readCore();
    },
    async readChannel(channelId) {
      const state = await chatStore.read();
      const channel = requireChannel(state, channelId);
      return {
        id: channel.id,
        title: channel.title,
        topic: channel.topic,
        workingMemory: channel.workingMemory,
        roomRouting: channel.roomRouting,
      };
    },
    async findCat(catId) {
      const state = await chatStore.read();
      const cat = state.cats.find((candidate) => candidate.id === catId) ?? null;
      return cat ? { id: cat.id } : null;
    },
  };
}
