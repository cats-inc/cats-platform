import type { TelegramRoomBridge } from '../../../platform/transports/telegram/bridge.js';
import { refreshDerivedMemoryLayers } from './memoryLayers.js';
import { appendMessage, createChannel, requireChannel } from './model.js';
import { routeChannelMessage } from './runtimeActions.js';
import type { CompanionBoxStore } from './companionBoxStore.js';
import type { ChatStore } from './store.js';

export function createChatTelegramRoomBridge(input: {
  chatStore: ChatStore;
  companionStore: CompanionBoxStore;
}): TelegramRoomBridge {
  return {
    readState() {
      return input.chatStore.read();
    },
    writeState(state) {
      return input.chatStore.write(state);
    },
    createRoom(state, room, timestamp) {
      const nextState = createChannel(
        state,
        {
          title: room.title,
          topic: room.topic,
          roomMode: room.roomMode,
          leadParticipantId: room.leadParticipantId,
          participantCatIds: room.participantCatIds,
          skipBossCatGreeting: true,
        },
        timestamp,
      );
      const roomId = nextState.selectedChannelId;
      if (!roomId) {
        throw new Error('Telegram room creation did not select a room.');
      }
      return { state: nextState, roomId };
    },
    readRoom(state, roomId) {
      const channel = requireChannel(state, roomId);
      return {
        id: channel.id,
        title: channel.title,
        messages: channel.messages.map((message) => ({
          senderKind: message.senderKind,
          senderName: message.senderName ?? null,
          body: message.body,
        })),
      };
    },
    routeRoomMessage({
      state,
      roomId,
      body,
      senderName,
      runtimeClient,
      memoryService,
      timestamp,
    }) {
      return routeChannelMessage(
        state,
        roomId,
        {
          body,
          senderName,
        },
        runtimeClient,
        timestamp,
        {
          transport: 'telegram',
          companionStore: input.companionStore,
          memoryService,
          chatStore: input.chatStore,
        },
      );
    },
    buildRecoveryState({
      state,
      roomId,
      senderName,
      inboundBody,
      occurredAt,
      errorMessage,
      includeInboundMessage,
    }) {
      let recoveryState = state;

      if (includeInboundMessage) {
        recoveryState = appendMessage(
          recoveryState,
          roomId,
          {
            senderKind: 'user',
            senderName,
            body: inboundBody,
          },
          occurredAt,
        ).state;
      }

      recoveryState = appendMessage(
        recoveryState,
        roomId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Telegram relay accepted the message, but Cats Chat could not process the room turn: ${errorMessage}`,
        },
        occurredAt,
        {
          metadata: {
            event: 'runtime_error',
            transport: 'telegram',
          },
          incrementUnread: false,
        },
      ).state;

      return refreshDerivedMemoryLayers(recoveryState, roomId, occurredAt);
    },
  };
}
