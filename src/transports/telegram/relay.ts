import type {
  TelegramMessagePayload,
  TelegramRelayContext,
  TelegramRelayStatus,
  TelegramWebhookReceipt,
  TelegramWebhookUpdate,
} from './contracts.js';
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
        mappedConversationCount: store.listBindings().length,
        lastProcessedUpdateId: store.getLastProcessedUpdateId(),
        webhookPath,
        relayMode: 'boss-cat-ingress',
        note: !context.bossCatId
          ? 'No Boss Cat is configured for Telegram ingress.'
          : boundToBossCat
            ? 'Telegram ingress is wired to Boss Cat. Outbound delivery remains pending.'
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
          reason: 'duplicate_update',
        };
      }

      let mappedConversationId: string | null = null;
      if (chatId) {
        const existingBinding = store.getBinding(chatId);
        mappedConversationId = existingBinding?.conversationId ?? `telegram:${chatId}`;
        store.upsertBinding({
          telegramChatId: chatId,
          conversationId: mappedConversationId,
          createdAt: existingBinding?.createdAt ?? acceptedAt,
          updatedAt: acceptedAt,
        });
      }

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
        mappedConversationId,
      };
    },
  };
}
