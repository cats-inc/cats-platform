import type {
  TelegramMessagePayload,
  TelegramRelayContext,
  TelegramRelayStatus,
  TelegramWebhookReceipt,
  TelegramWebhookUpdate,
} from './contracts.js';
import {
  createTelegramConversationMapper,
  type TelegramConversationMapper,
} from './mapping.js';
import { InMemoryTelegramRelayStore, type TelegramRelayStore } from './store.js';

export interface TelegramRelay {
  getStatus(context: TelegramRelayContext): TelegramRelayStatus;
  receiveUpdate(input: {
    update: TelegramWebhookUpdate;
    context: TelegramRelayContext;
  }): TelegramWebhookReceipt;
}

interface TelegramRelayOptions {
  now?: () => Date;
  store?: TelegramRelayStore;
  webhookPath?: string;
  conversationMapper?: TelegramConversationMapper;
}

function pickMessage(update: TelegramWebhookUpdate): TelegramMessagePayload | null {
  return update.message ?? update.edited_message ?? null;
}

function hasActiveBossCatBinding(context: TelegramRelayContext): boolean {
  return Boolean(
    context.bossCatId
    && context.bossCatActorId
    && context.botBinding
    && context.botBinding.status === 'active'
    && context.botBinding.bossCatActorId === context.bossCatActorId,
  );
}

export function createTelegramRelay(options: TelegramRelayOptions = {}): TelegramRelay {
  const now = options.now ?? (() => new Date());
  const store = options.store ?? new InMemoryTelegramRelayStore();
  const conversationMapper = options.conversationMapper ?? createTelegramConversationMapper(store);
  const webhookPath = options.webhookPath ?? '/api/transports/telegram/webhook';

  return {
    getStatus(context: TelegramRelayContext): TelegramRelayStatus {
      const boundToBossCat = hasActiveBossCatBinding(context);

      return {
        platform: 'telegram',
        status: boundToBossCat ? 'bound' : 'unbound',
        bossCatId: context.bossCatId,
        bossCatName: context.bossCatName,
        botBinding: boundToBossCat && context.botBinding
          ? {
              id: context.botBinding.id,
              platform: 'telegram',
              botName: context.botBinding.botName,
            }
          : null,
        mappedConversationCount: conversationMapper.getBindingCount(),
        lastProcessedUpdateId: store.getLastProcessedUpdateId(),
        webhookPath,
        relayMode: 'boss-cat-ingress',
        roomRouting: conversationMapper.describeRoomRouting(),
        note: !context.bossCatId
          ? 'No Boss Cat is configured for Telegram ingress.'
          : boundToBossCat
            ? 'Telegram ingress is wired to Boss Cat. '
              + 'Outbound delivery and room routing policy remain pending.'
            : 'No Telegram bot binding is configured for the current Boss Cat.',
      };
    },

    receiveUpdate({
      update,
      context,
    }: {
      update: TelegramWebhookUpdate;
      context: TelegramRelayContext;
    }): TelegramWebhookReceipt {
      const acceptedAt = now().toISOString();
      const updateId = typeof update.update_id === 'number' ? update.update_id : null;
      const message = pickMessage(update);
      const chatId = message?.chat?.id != null ? String(message.chat.id) : null;
      const messageId = typeof message?.message_id === 'number' ? String(message.message_id) : null;

      if (!hasActiveBossCatBinding(context)) {
        return {
          platform: 'telegram',
          status: 'ignored',
          acceptedAt,
          updateId,
          chatId,
          messageId,
          bossCatId: context.bossCatId,
          bossCatName: context.bossCatName,
          mappedConversationId: null,
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'telegram_not_bound_to_boss_cat',
        };
      }

      if (updateId !== null && store.hasProcessedUpdate(updateId)) {
        return {
          platform: 'telegram',
          status: 'ignored',
          acceptedAt,
          updateId,
          chatId,
          messageId,
          bossCatId: context.bossCatId,
          bossCatName: context.bossCatName,
          mappedConversationId: chatId ? store.getBinding(chatId)?.conversationId ?? null : null,
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'duplicate_update',
        };
      }

      if (!message || !chatId) {
        // Unsupported updates stay outside the durable dedupe window so the
        // relay only retains ids for accepted Boss Cat inbox traffic.
        return {
          platform: 'telegram',
          status: 'ignored',
          acceptedAt,
          updateId,
          chatId,
          messageId,
          bossCatId: context.bossCatId,
          bossCatName: context.bossCatName,
          mappedConversationId: null,
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'unsupported_update',
        };
      }

      if (message.chat?.type !== 'private') {
        // Unsupported chat types also stay outside the durable dedupe window
        // so only accepted Boss Cat inbox traffic consumes retained ids.
        return {
          platform: 'telegram',
          status: 'ignored',
          acceptedAt,
          updateId,
          chatId,
          messageId,
          bossCatId: context.bossCatId,
          bossCatName: context.bossCatName,
          mappedConversationId: null,
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'unsupported_chat_type',
        };
      }

      const mapping = conversationMapper.resolveChatConversation({
        chatId,
        acceptedAt,
      });

      if (updateId !== null) {
        store.markProcessedUpdate(updateId);
      }

      return {
        platform: 'telegram',
        status: 'accepted',
        acceptedAt,
        updateId,
        chatId,
        messageId,
        bossCatId: context.bossCatId,
        bossCatName: context.bossCatName,
        mappedConversationId: mapping.binding.conversationId,
        roomRouting: mapping.roomRouting,
      };
    },
  };
}
