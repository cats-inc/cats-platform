import type { TelegramRoomBridge } from '../../../platform/transports/telegram/bridge.js';
import type {
  ProviderCapabilityBootstrapConfig,
  ProviderCapabilityBootstrapDiagnosticSink,
} from '../../../platform/supervision/index.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../shared/runtimeRecovery.js';
import type { ChatNaturalProductIntentMode } from '../shared/naturalProductIntentMode.js';
import {
  buildTelegramBotTransportBindingId,
} from '../../../shared/chatCoreIds.js';
import type { ChatState } from '../api/contracts.js';
import type { ExternalIssueImportFetchOptions } from '../../work/integrations/externalIssueImportFetcher.js';
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
import { updateChatState } from './store.js';
import { createLockedDispatchChatStore, mergeCompletedDispatchState } from './runtime-dispatch/merge.js';
import type { ProviderAgentDecisionRequester } from './runtime-dispatch/routing.js';

export function createChatTelegramRoomBridge(input: {
  chatStore: ChatStore;
  companionStore: CompanionBoxStore;
  mutationGate?: AsyncKeyedGate;
  runtimeRecovery?: Partial<RuntimeDispatchRecoveryPolicy>;
  chatStatePath?: string;
  runtimeDataDir?: string;
  providerAgentDecisionRequester?: ProviderAgentDecisionRequester;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
  naturalProductIntentMode?: ChatNaturalProductIntentMode;
  externalIssueImport?: ExternalIssueImportFetchOptions;
}): TelegramRoomBridge<ChatState> {
  // Transport selection restoration shallow-copies the state, retaining this identity.
  // Track only outputs owned by this adapter, without changing the shared bridge contract.
  const pendingWrites = new WeakMap<ChatState['channels'], { baseline: ChatState; roomId: string; now: Date }>();
  const recordWrite = (state: ChatState, baseline: ChatState, roomId: string, now: Date): ChatState => {
    pendingWrites.set(state.channels, { baseline: structuredClone(baseline), roomId, now });
    return state;
  };
  return {
    readState() {
      return input.chatStore.read();
    },
    async writeState(state) {
      const pending = pendingWrites.get(state.channels);
      if (!pending) throw new Error('Telegram state write requires an adapter-owned room mutation.');
      const { baseline, roomId, now } = pending;
      const persisted = await updateChatState(input.chatStore, (latest) => {
        const existed = baseline.channels.some((channel) => channel.id === roomId);
        const exists = latest.channels.some((channel) => channel.id === roomId);
        if (existed) return exists ? mergeCompletedDispatchState(latest, baseline, state, roomId, now) : latest;
        if (!exists) latest.channels.push(structuredClone(requireChannel(state, roomId)));
        return latest;
      });
      recordWrite(state, state, roomId, now);
      return recordWrite(persisted, persisted, roomId, now);
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
      return { state: recordWrite(nextState, state, roomId, timestamp), roomId };
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
      const writer = createLockedDispatchChatStore(input.chatStore, roomId, state, () => timestamp);
      let lastPersisted = structuredClone(state);
      const routed = await routeChannelMessage(
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
          chatStore: { ...writer, write: async (next) => {
            const persisted = await writer.write(next);
            lastPersisted = structuredClone(persisted);
            return persisted;
          } },
          runtimeRecovery: input.runtimeRecovery,
          chatStatePath: input.chatStatePath,
          runtimeDataDir: input.runtimeDataDir,
          providerAgentDecisionRequester: input.providerAgentDecisionRequester,
          providerCapabilityBootstrapConfig: input.providerCapabilityBootstrapConfig,
          providerCapabilityBootstrapDiagnosticSink: input.providerCapabilityBootstrapDiagnosticSink,
          naturalProductIntentMode: input.naturalProductIntentMode,
          externalIssueImport: input.externalIssueImport,
        },
      );
      return { ...routed, state: recordWrite(routed.state, lastPersisted, roomId, timestamp) };
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

      return recordWrite(refreshDerivedMemoryLayers(recoveryState, roomId, occurredAt), state, roomId, occurredAt);
    },
  };
}
