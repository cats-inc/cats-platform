import type { TelegramRoomBridge } from '../../../platform/transports/telegram/bridge.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../shared/runtimeRecovery.js';
import type { ChatNaturalProductIntentMode } from '../shared/naturalProductIntentMode.js';
import {
  buildTelegramBotTransportBindingId,
} from '../../../shared/chatCoreIds.js';
import type { ChatState } from '../api/contracts.js';
import type { AsyncKeyedGate } from '../shared/asyncControl.js';
import { refreshDerivedMemoryLayers } from './memoryLayers.js';
import {
  appendMessage,
  createChannel,
  requireChannel,
  resolveChannelCanonicalIdentity,
} from './model/index.js';
import { routeChannelMessage } from './runtimeActions.js';
import type { CompanionBoxStore } from './companion-box/index.js';
import type { ChatStore } from './store.js';

export function createChatTelegramRoomBridge(input: {
  chatStore: ChatStore;
  companionStore: CompanionBoxStore;
  mutationGate?: AsyncKeyedGate;
  runtimeRecovery?: Partial<RuntimeDispatchRecoveryPolicy>;
  chatStatePath?: string;
  runtimeDataDir?: string;
  naturalProductIntentMode?: ChatNaturalProductIntentMode;
}): TelegramRoomBridge<ChatState> {
  return {
    readState() {
      return input.chatStore.read();
    },
    writeState(state) {
      return input.chatStore.write(state);
    },
    runExclusive(key, operation) {
      return input.mutationGate ? input.mutationGate.run(key, operation) : operation();
    },
    findReusableRoomId(state, room) {
      if (room.roomMode !== 'direct_message') {
        return null;
      }

      const defaultRecipientCatId = room.defaultRecipientId
        ?? (room.participantCatIds.length === 1 ? room.participantCatIds[0] : null);
      if (!defaultRecipientCatId) {
        return null;
      }

      return state.channels.find((channel) =>
        channel.roomRouting?.mode === 'direct_message'
        && channel.roomRouting.defaultRecipientId === defaultRecipientCatId,
      )?.id ?? null;
    },
    createRoom(state, room, timestamp) {
      const nextState = createChannel(
        state,
        {
          title: room.title,
          topic: room.topic,
          // Telegram inbound room creation always terminates inside Cats Chat.
          originSurface: 'chat',
          roomMode: room.roomMode,
          defaultRecipientId: room.defaultRecipientId,
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
          id: message.id,
          senderKind: message.senderKind,
          senderName: message.senderName ?? null,
          body: message.body,
          choices: message.choices,
          metadata: message.metadata ?? {},
        })),
      };
    },
    async routeRoomMessage({
      state,
      roomId,
      body,
      senderName,
      choiceResponse,
      bindingId,
      transportLocale,
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
          choiceResponse,
        },
        runtimeClient,
        timestamp,
        {
          transport: 'telegram',
          transportLocale,
          transportBindingId: bindingId
            ? buildTelegramBotTransportBindingId(bindingId)
            : null,
          companionStore: input.companionStore,
          memoryService,
          chatStore: input.chatStore,
          runtimeRecovery: input.runtimeRecovery,
          chatStatePath: input.chatStatePath,
          runtimeDataDir: input.runtimeDataDir,
          naturalProductIntentMode: input.naturalProductIntentMode,
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
      bindingId,
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
          {
            metadata: {
              transport: 'telegram',
              transportBindingId: bindingId
                ? buildTelegramBotTransportBindingId(bindingId)
                : null,
            },
            origin: 'telegram',
            sourceTransportBindingId: bindingId
              ? buildTelegramBotTransportBindingId(bindingId)
              : null,
          },
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
            ...resolveChannelCanonicalIdentity(recoveryState, roomId),
          },
          incrementUnread: false,
        },
      ).state;

      return refreshDerivedMemoryLayers(recoveryState, roomId, occurredAt);
    },
  };
}
