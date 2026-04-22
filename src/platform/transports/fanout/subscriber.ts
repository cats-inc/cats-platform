import { createCatActorId } from '../../../core/actors.js';
import type { BotBindingRecord, CatsCoreState } from '../../../core/types.js';
import {
  buildTelegramBotTransportBindingId,
} from '../../../shared/chatCoreIds.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../shared/platformSurfaces.js';
import type {
  ChatChannelState,
  ChatMessage,
  ChatState,
  MessageOrigin,
} from '../../../products/chat/api/contracts.js';
import type { ChatEvent, ChatEventHub } from '../../../products/chat/api/chatEventHub.js';
import { normalizeEffectiveBotBinding } from '../../../products/chat/state/botBindings.js';
import { requireChannel } from '../../../products/chat/state/model/index.js';
import type { ChatStore } from '../../../products/chat/state/store.js';
import type { TelegramRelayContext } from '../telegram/contracts.js';
import type { TelegramRelay } from '../telegram/relay/index.js';
import { createTelegramFanoutDeliverer } from '../telegram/fanout.js';
import { TransportDelivererRegistry } from './registry.js';

const MESSAGE_ORIGINS = new Set<MessageOrigin>([
  'web',
  'telegram',
  'browser',
  'email',
  'runtime',
  'system',
  'unknown',
]);

const MAX_PROCESSED_FANOUT_PAIRS = 10000;

export interface TransportFanoutOptions {
  eventHub: ChatEventHub;
  chatStore: ChatStore;
  telegramRelay: TelegramRelay;
  now?: () => Date;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readMessageOrigin(value: unknown): MessageOrigin | null {
  const candidate = readString(value);
  return candidate && MESSAGE_ORIGINS.has(candidate as MessageOrigin)
    ? candidate as MessageOrigin
    : null;
}

function readEventDetailString(event: ChatEvent, key: string): string | null {
  return event.detail ? readString(event.detail[key]) : null;
}

function readEventOrigin(event: ChatEvent): MessageOrigin | null {
  return event.detail ? readMessageOrigin(event.detail.origin) : null;
}

function readMessageMetadataString(message: ChatMessage, key: string): string | null {
  return readString((message.metadata ?? {})[key]);
}

function readMessageMetadataOrigin(message: ChatMessage): MessageOrigin | null {
  return readMessageOrigin((message.metadata ?? {}).origin);
}

function isMessageAddedEvent(event: ChatEvent): boolean {
  return event.kind === 'room_updated'
    && readString(event.channelId) !== null
    && event.detail?.mutation === 'message_added';
}

function findBindingChatCat(chatState: ChatState, binding: BotBindingRecord) {
  const actorId = binding.catActorId ?? binding.bossCatActorId;
  if (!actorId) {
    return null;
  }

  return chatState.cats.find((cat) => createCatActorId(cat.id) === actorId) ?? null;
}

function isActiveChatBinding(chatState: ChatState, binding: BotBindingRecord): boolean {
  if (binding.status !== 'active') {
    return false;
  }

  const cat = findBindingChatCat(chatState, binding);
  return Boolean(
    cat
    && cat.status === 'active'
    && hasPlatformSurface(cat.products, 'chat', { fallback: defaultCatProducts() }),
  );
}

function resolveBossCatName(chatState: ChatState): string | null {
  return chatState.cats.find((cat) => cat.id === chatState.bossCatId)?.name ?? null;
}

function buildTelegramRelayContext(
  chatState: ChatState,
  coreState: CatsCoreState,
  selectedBindingId?: string | null,
): TelegramRelayContext {
  const bossCatId = chatState.bossCatId;
  const bossCatActorId = bossCatId ? createCatActorId(bossCatId) : null;
  const activeTelegramBindings = coreState.botBindings
    .filter((binding) =>
      binding.platform === 'telegram'
      && isActiveChatBinding(chatState, binding),
    )
    .map((binding) => normalizeEffectiveBotBinding(binding));
  const defaultBotBinding = bossCatActorId
    ? activeTelegramBindings.find((binding) =>
      binding.catActorId === bossCatActorId || binding.bossCatActorId === bossCatActorId,
    ) ?? activeTelegramBindings[0] ?? null
    : activeTelegramBindings[0] ?? null;
  const selectedBotBinding = selectedBindingId
    ? activeTelegramBindings.find((binding) => binding.id === selectedBindingId) ?? null
    : null;

  return {
    bossCatId,
    bossCatName: resolveBossCatName(chatState),
    bossCatActorId,
    botBindings: activeTelegramBindings,
    defaultBotBinding,
    selectedBotBinding,
  };
}

function collectChannelActorIds(channel: ChatChannelState): Set<string> {
  return new Set(channel.catAssignments.map((assignment) => createCatActorId(assignment.catId)));
}

function bindingTargetsChannel(binding: BotBindingRecord, channel: ChatChannelState): boolean {
  const actorIds = collectChannelActorIds(channel);
  return Boolean(
    (binding.catActorId && actorIds.has(binding.catActorId))
    || (binding.bossCatActorId && actorIds.has(binding.bossCatActorId)),
  );
}

function sourceMatchesBinding(sourceTransportBindingId: string | null, binding: BotBindingRecord): boolean {
  if (!sourceTransportBindingId) {
    return false;
  }

  return sourceTransportBindingId === binding.id
    || sourceTransportBindingId === buildTelegramBotTransportBindingId(binding.id);
}

function resolveCandidateMessage(
  event: ChatEvent,
  channel: ChatChannelState,
): ChatMessage | null {
  const messageId = readEventDetailString(event, 'messageId');
  if (messageId) {
    return channel.messages.find((message) => message.id === messageId) ?? null;
  }

  return channel.messages.at(-1) ?? null;
}

function shouldSkipByOrigin(origin: MessageOrigin, binding: BotBindingRecord): boolean {
  // First-slice loop safety intentionally suppresses same-platform fanout.
  // A later multi-binding Telegram design can relax this once cross-bot
  // attribution and duplicate rules are explicit.
  return origin === 'unknown'
    || origin === 'system'
    || binding.platform === origin;
}

function reportFanoutError(error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-platform-transport-fanout] ${message}\n`);
}

export class TransportFanout {
  private readonly registry = new TransportDelivererRegistry();

  private readonly processedPairs = new Map<string, true>();

  constructor(private readonly options: TransportFanoutOptions) {
    this.registry.register(createTelegramFanoutDeliverer({
      telegramRelay: options.telegramRelay,
      resolveContext: async (bindingId) => {
        const [chatState, coreState] = await Promise.all([
          this.options.chatStore.read(),
          this.options.chatStore.readCore(),
        ]);
        return buildTelegramRelayContext(chatState, coreState, bindingId);
      },
    }));
  }

  handle(event: ChatEvent): void {
    if (!isMessageAddedEvent(event)) {
      return;
    }

    void this.process(event).catch(reportFanoutError);
  }

  private async process(event: ChatEvent): Promise<void> {
    const channelId = readString(event.channelId);
    if (!channelId) {
      return;
    }

    const [chatState, coreState] = await Promise.all([
      this.options.chatStore.read(),
      this.options.chatStore.readCore(),
    ]);
    const channel = requireChannel(chatState, channelId);
    const message = resolveCandidateMessage(event, channel);
    if (!message) {
      return;
    }

    const origin = readEventOrigin(event) ?? readMessageMetadataOrigin(message) ?? 'unknown';
    const sourceTransportBindingId = readEventDetailString(event, 'sourceTransportBindingId')
      ?? readMessageMetadataString(message, 'sourceTransportBindingId');
    const eligibleBindings = coreState.botBindings
      .filter((binding) =>
        binding.status === 'active'
        && binding.outboundFanoutEnabled !== false
        && isActiveChatBinding(chatState, binding)
        && bindingTargetsChannel(binding, channel),
      );

    for (const binding of eligibleBindings) {
      if (shouldSkipByOrigin(origin, binding) || sourceMatchesBinding(sourceTransportBindingId, binding)) {
        continue;
      }

      const deliverer = this.registry.get(binding.platform);
      if (!deliverer) {
        continue;
      }

      const pairKey = `${message.id}:${binding.id}`;
      if (!this.rememberProcessedPair(pairKey)) {
        continue;
      }

      try {
        await deliverer.deliver({
          channelId,
          binding,
          message,
          origin,
          sourceTransportBindingId,
        });
      } catch (error) {
        this.processedPairs.delete(pairKey);
        reportFanoutError(error);
      }
    }
  }

  private rememberProcessedPair(pairKey: string): boolean {
    if (this.processedPairs.has(pairKey)) {
      return false;
    }

    this.processedPairs.set(pairKey, true);
    if (this.processedPairs.size > MAX_PROCESSED_FANOUT_PAIRS) {
      const oldestPair = this.processedPairs.keys().next().value as string | undefined;
      if (oldestPair) {
        this.processedPairs.delete(oldestPair);
      }
    }

    return true;
  }
}

export function startTransportFanout(options: TransportFanoutOptions): () => void {
  const fanout = new TransportFanout(options);
  return options.eventHub.subscribe((event) => fanout.handle(event));
}
