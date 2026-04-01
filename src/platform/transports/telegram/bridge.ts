import { createCatActorId } from '../../../core/actors.js';
import type { BotBindingRecord } from '../../../core/types.js';
import type { RoomRoutingMode } from '../../../shared/roomRouting.js';
import type { RuntimeClient } from '../../runtime/client.js';
import type { CatsMemoryService } from '../../memory/index.js';
import type {
  TelegramDeliveryReceipt,
  TelegramMessagePayload,
  TelegramRelayContext,
  TelegramWebhookReceipt,
  TelegramWebhookUpdate,
} from './contracts.js';
import { describeTelegramRoomRouting } from './mapping.js';
import { normalizeTelegramAttachments } from './normalization.js';
import type { TelegramRelay } from './relay/index.js';
import {
  pickTelegramMessage,
  readTelegramString,
  resolveActiveTelegramBinding,
} from './utils.js';
import { chunkTelegramReply } from './chunking.js';

const TELEGRAM_REPLY_LIMIT = 4000;

export interface TelegramRoomBridgeMessage {
  senderKind: string;
  senderName: string | null;
  body: string;
}

export interface TelegramRoomBridgeView {
  id: string;
  title: string;
  messages: TelegramRoomBridgeMessage[];
}

export interface TelegramRoomBridgeCreateRoomInput {
  title: string;
  topic: string;
  roomMode: RoomRoutingMode;
  leadParticipantId?: string;
  participantCatIds: string[];
}

export interface TelegramRoomBridgeReusableRoomLookupInput {
  roomMode: RoomRoutingMode;
  leadParticipantId?: string;
  participantCatIds: string[];
}

export interface TelegramRoomBridgeState {
  selectedChannelId: string;
  channels: Array<{ id: string }>;
  cats: Array<{ id: string; name: string }>;
}

export interface TelegramRoomBridgeRecoveryInput<TState extends TelegramRoomBridgeState = TelegramRoomBridgeState> {
  state: TState;
  roomId: string;
  senderName: string;
  inboundBody: string;
  occurredAt: Date;
  errorMessage: string;
  includeInboundMessage: boolean;
}

export interface TelegramRoomBridge<TState extends TelegramRoomBridgeState = TelegramRoomBridgeState> {
  readState(): Promise<TState>;
  writeState(state: TState): Promise<TState>;
  runExclusive?<T>(key: string, operation: () => Promise<T>): Promise<T>;
  findReusableRoomId(
    state: TState,
    input: TelegramRoomBridgeReusableRoomLookupInput,
  ): string | null;
  createRoom(
    state: TState,
    input: TelegramRoomBridgeCreateRoomInput,
    timestamp: Date,
  ): { state: TState; roomId: string };
  readRoom(state: TState, roomId: string): TelegramRoomBridgeView;
  routeRoomMessage(input: {
    state: TState;
    roomId: string;
    body: string;
    senderName: string;
    runtimeClient: RuntimeClient;
    memoryService: CatsMemoryService;
    timestamp: Date;
  }): Promise<{ state: TState }>;
  buildRecoveryState(input: TelegramRoomBridgeRecoveryInput<TState>): TState;
}

function collapseWhitespace(value: string | null | undefined): string | null {
  return readTelegramString(value)?.replace(/\s+/gu, ' ') ?? null;
}

function extractMessageText(message: TelegramMessagePayload | null): string | null {
  return collapseWhitespace(message?.text ?? message?.caption);
}

function stripNewRoomPrefix(body: string): string {
  return body.replace(/^\/new(?:\s+|$)/u, '').replace(/^(?:new room|new topic):\s*/iu, '').trim();
}

function shouldCreateNewRoom(
  message: TelegramMessagePayload | null,
  linkedRoomId: string | null,
): boolean {
  if (!linkedRoomId) {
    return true;
  }

  const body = extractMessageText(message)?.toLowerCase() ?? '';
  return body === '/new'
    || body.startsWith('/new ')
    || body.startsWith('new room:')
    || body.startsWith('new topic:');
}

function buildInboundBody(message: TelegramMessagePayload | null): string {
  const rawText = extractMessageText(message);
  const strippedText = rawText ? stripNewRoomPrefix(rawText) : null;
  const attachments = message ? normalizeTelegramAttachments(message) : [];
  const attachmentLabel = attachments.length > 0
    ? `Attachments: ${attachments.map((attachment) => attachment.kind).join(', ')}`
    : null;

  if (strippedText && attachmentLabel) {
    return `${strippedText}\n\n${attachmentLabel}`;
  }
  if (strippedText) {
    return strippedText;
  }
  if (attachmentLabel) {
    return attachmentLabel;
  }

  return 'Telegram message received.';
}

function resolveSenderName(
  message: TelegramMessagePayload | null,
  receipt: TelegramWebhookReceipt,
): string {
  const firstName = readTelegramString(message?.from?.first_name);
  const lastName = readTelegramString(message?.from?.last_name);
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (displayName) {
    return displayName;
  }
  if (receipt.messageSummary?.senderUsername) {
    return `@${receipt.messageSummary.senderUsername}`;
  }
  return 'Telegram';
}

function truncateLabel(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(1, limit - 1))}…`;
}

function resolveInternalRoomMode(binding: BotBindingRecord | null): RoomRoutingMode {
  return binding?.roomMode === 'direct_cat_chat' ? 'direct_cat_chat' : 'boss_chat';
}

function resolveBoundCat(
  state: TelegramRoomBridgeState,
  binding: BotBindingRecord | null,
  context: TelegramRelayContext,
): { catId: string | null; catName: string | null } {
  const actorId = binding?.catActorId ?? binding?.bossCatActorId ?? context.bossCatActorId ?? null;
  if (!actorId) {
    return { catId: null, catName: context.bossCatName };
  }

  const cat = state.cats.find((candidate) => createCatActorId(candidate.id) === actorId) ?? null;
  return {
    catId: cat?.id ?? null,
    catName: cat?.name ?? context.bossCatName,
  };
}

function buildRoomTitle(
  message: TelegramMessagePayload | null,
  fallbackCatName: string | null,
): string {
  const preview = extractMessageText(message);
  if (preview) {
    return truncateLabel(`Telegram · ${preview}`, 72);
  }

  return fallbackCatName
    ? `Telegram · ${fallbackCatName}`
    : 'Telegram inbox';
}

function buildRoomTopic(
  binding: BotBindingRecord | null,
  senderName: string,
  chatId: string | null,
): string {
  const viaBot = binding?.botName ? `via @${binding.botName}` : 'via Telegram';
  const sender = senderName || chatId || 'Telegram';
  return `Telegram inbox ${viaBot} from ${sender}`;
}

function roomExists<TState extends TelegramRoomBridgeState>(
  state: TState,
  roomId: string | null,
): roomId is string {
  return typeof roomId === 'string'
    && roomId.length > 0
    && state.channels.some((channel) => channel.id === roomId);
}

function restoreSelection<TState extends TelegramRoomBridgeState>(
  state: TState,
  selectedChannelId: string,
): TState {
  if (!selectedChannelId || state.selectedChannelId === selectedChannelId) {
    return state;
  }

  if (!state.channels.some((channel) => channel.id === selectedChannelId)) {
    return state;
  }

  return {
    ...state,
    selectedChannelId,
  };
}

function buildTelegramReplyText<TState extends TelegramRoomBridgeState>(input: {
  roomBridge: TelegramRoomBridge<TState>;
  state: TState;
  roomId: string;
  roomCreated: boolean;
  messageCountBeforeDispatch: number;
}): string {
  const channel = input.roomBridge.readRoom(input.state, input.roomId);
  const newMessages = channel.messages.slice(input.messageCountBeforeDispatch);
  const replyMessage = [...newMessages].reverse().find((message) =>
    message.senderKind === 'orchestrator' || message.senderKind === 'agent',
  ) ?? [...newMessages].reverse().find((message) => message.senderKind === 'system') ?? null;
  const roomNote = input.roomCreated
    ? `Opened room "${channel.title}" in Cats Chat.`
    : `Continuing room "${channel.title}" in Cats Chat.`;
  const detail = replyMessage?.body?.trim() || 'The inbox has been routed into Cats Chat.';
  const combined = `${roomNote}\n\n${detail}`;

  return combined.length <= TELEGRAM_REPLY_LIMIT
    ? combined
    : `${combined.slice(0, TELEGRAM_REPLY_LIMIT - 1)}…`;
}

function roomHasInboundMessage<TState extends TelegramRoomBridgeState>(input: {
  roomBridge: TelegramRoomBridge<TState>;
  state: TState;
  roomId: string;
  senderName: string;
  inboundBody: string;
  messageCountBeforeDispatch?: number | null;
}): boolean {
  const channel = input.roomBridge.readRoom(input.state, input.roomId);
  const messageStartIndex = input.messageCountBeforeDispatch == null
    ? 0
    : Math.max(0, input.messageCountBeforeDispatch);

  return channel.messages
    .slice(messageStartIndex)
    .some((message) =>
      message.senderKind === 'user'
      && message.senderName === input.senderName
      && message.body === input.inboundBody);
}

function describeBridgeFailure(error: unknown): string {
  if (error instanceof Error) {
    return readTelegramString(error.message) ?? 'Unexpected internal Telegram bridge error.';
  }
  return 'Unexpected internal Telegram bridge error.';
}

export class TelegramWebhookBridgeError extends Error {
  constructor(
    readonly code: 'telegram_room_dispatch_failed',
    message: string,
    readonly roomId: string | null,
  ) {
    super(message);
  }
}

export interface TelegramWebhookBridgeResult {
  receipt: TelegramWebhookReceipt;
  roomId: string | null;
  roomCreated: boolean;
  deliveryReceipt: TelegramDeliveryReceipt | null;
}

export async function bridgeTelegramWebhookToRoom<TState extends TelegramRoomBridgeState>(input: {
  update: TelegramWebhookUpdate;
  receipt: TelegramWebhookReceipt;
  context: TelegramRelayContext;
  roomBridge: TelegramRoomBridge<TState>;
  memoryService: CatsMemoryService;
  runtimeClient: RuntimeClient;
  telegramRelay: TelegramRelay;
  now?: () => Date;
}): Promise<TelegramWebhookBridgeResult> {
  if (
    input.receipt.status !== 'accepted'
    || !input.receipt.mappedConversationId
  ) {
    return {
      receipt: input.receipt,
      roomId: null,
      roomCreated: false,
      deliveryReceipt: null,
    };
  }

  const existingBinding = input.telegramRelay.resolveBinding({
    conversationId: input.receipt.mappedConversationId,
    chatId: input.receipt.chatId,
    bindingId: input.receipt.bindingId,
  });
  const lockKey = existingBinding?.linkedRoomId
    ?? `telegram:${input.receipt.bindingId ?? 'default'}:${input.receipt.mappedConversationId}`;
  const runExclusive = input.roomBridge.runExclusive
    ? <T>(operation: () => Promise<T>) => input.roomBridge.runExclusive!(lockKey, operation)
    : <T>(operation: () => Promise<T>) => operation();

  return runExclusive(async () => {
    const now = input.now ?? (() => new Date());
    const timestamp = now();
    const { message } = pickTelegramMessage(input.update);
    const senderName = resolveSenderName(message, input.receipt);
    const activeBinding = resolveActiveTelegramBinding(input.context, input.receipt.bindingId);
    const currentState = await input.roomBridge.readState();
    const boundCat = resolveBoundCat(currentState, activeBinding, input.context);
    let roomId = existingBinding?.linkedRoomId ?? null;
    let nextState = currentState;
    let roomCreated = false;
    let dispatchedState: TState | null = null;
    let messageCountBeforeDispatch: number | null = null;
    const inboundBody = buildInboundBody(message);
    const roomMode = resolveInternalRoomMode(activeBinding);
    const createRoomInput: TelegramRoomBridgeCreateRoomInput = {
      title: roomMode === 'direct_cat_chat' ? '' : buildRoomTitle(message, boundCat.catName),
      topic: buildRoomTopic(activeBinding, senderName, input.receipt.chatId),
      roomMode,
      leadParticipantId: roomMode === 'direct_cat_chat' ? boundCat.catId ?? undefined : undefined,
      participantCatIds: roomMode === 'direct_cat_chat' && boundCat.catId ? [boundCat.catId] : [],
    };

    try {
      if (roomMode === 'direct_cat_chat') {
        roomId = input.roomBridge.findReusableRoomId(nextState, createRoomInput);
      }

      if (
        !roomExists(nextState, roomId)
        || (
          roomMode !== 'direct_cat_chat'
          && shouldCreateNewRoom(message, roomId)
        )
      ) {
        const previousSelection = nextState.selectedChannelId;
        const nextRoomState = input.roomBridge.createRoom(
          nextState,
          createRoomInput,
          timestamp,
        );
        roomId = nextRoomState.roomId;
        nextState = restoreSelection(nextRoomState.state, previousSelection);
        nextState = await input.roomBridge.writeState(nextState);
        roomCreated = true;
      }

      if (!roomId) {
        return {
          receipt: input.receipt,
          roomId: null,
          roomCreated: false,
          deliveryReceipt: null,
        };
      }

      const linkedBinding = input.telegramRelay.linkRoom({
        conversationId: input.receipt.mappedConversationId,
        chatId: input.receipt.chatId,
        bindingId: input.receipt.bindingId,
        roomId,
        linkedAt: timestamp.toISOString(),
      });
      const channelBeforeDispatch = input.roomBridge.readRoom(nextState, roomId);
      messageCountBeforeDispatch = channelBeforeDispatch.messages.length;
      const dispatch = await input.roomBridge.routeRoomMessage({
        state: nextState,
        roomId,
        body: inboundBody,
        senderName,
        runtimeClient: input.runtimeClient,
        memoryService: input.memoryService,
        timestamp,
      });
      dispatchedState = dispatch.state;
      const persistedState = await input.roomBridge.writeState(
        restoreSelection(dispatch.state, currentState.selectedChannelId),
      );
      nextState = persistedState;

      const replyText = buildTelegramReplyText({
        roomBridge: input.roomBridge,
        state: persistedState,
        roomId,
        roomCreated,
        messageCountBeforeDispatch,
      });
      const chunks = chunkTelegramReply(replyText, TELEGRAM_REPLY_LIMIT);
      let deliveryReceipt: TelegramDeliveryReceipt | null = null;
      for (const chunk of chunks) {
        deliveryReceipt = await input.telegramRelay.deliver({
          request: {
            operation: input.receipt.messageId && !deliveryReceipt ? 'reply' : 'send',
            conversationId: input.receipt.mappedConversationId,
            chatId: input.receipt.chatId,
            replyToMessageId: !deliveryReceipt ? input.receipt.messageId : undefined,
            text: chunk,
            disableLinkPreview: true,
          },
          context: input.context,
        });
      }

      return {
        receipt: {
          ...input.receipt,
          roomRouting: describeTelegramRoomRouting(linkedBinding),
        },
        roomId,
        roomCreated,
        deliveryReceipt,
      };
    } catch (error) {
      const errorMessage = describeBridgeFailure(error);
      let surfacedErrorMessage = errorMessage;
      if (roomId) {
        const recoverySourceState = dispatchedState ?? nextState;
        try {
          nextState = await input.roomBridge.writeState(
            restoreSelection(
              input.roomBridge.buildRecoveryState({
                state: recoverySourceState,
                roomId,
                senderName,
                inboundBody,
                occurredAt: timestamp,
                errorMessage,
                includeInboundMessage: !roomHasInboundMessage({
                  roomBridge: input.roomBridge,
                  state: recoverySourceState,
                  roomId,
                  senderName,
                  inboundBody,
                  messageCountBeforeDispatch,
                }),
              }),
              currentState.selectedChannelId,
            ),
          );
          input.telegramRelay.linkRoom({
            conversationId: input.receipt.mappedConversationId,
            chatId: input.receipt.chatId,
            bindingId: input.receipt.bindingId,
            roomId,
            linkedAt: timestamp.toISOString(),
          });
        } catch (recoveryError) {
          surfacedErrorMessage =
            `${errorMessage} Recovery write also failed: ${describeBridgeFailure(recoveryError)}`;
        }
      }

      input.telegramRelay.recordBridgeDispatchFailure({
        receipt: input.receipt,
        context: input.context,
        binding: activeBinding,
        deliveredAt: timestamp.toISOString(),
        errorMessage: surfacedErrorMessage,
      });

      throw new TelegramWebhookBridgeError(
        'telegram_room_dispatch_failed',
        `Telegram webhook was accepted, but Cats Chat could not process the room turn: ${surfacedErrorMessage}`,
        roomId,
      );
    }
  });
}
