import type { TelegramConversationBinding } from './contracts.js';

export interface TelegramRelayStore {
  getBinding(chatId: string): TelegramConversationBinding | null;
  getBindingByConversationId(conversationId: string): TelegramConversationBinding | null;
  listBindings(): TelegramConversationBinding[];
  upsertBinding(binding: TelegramConversationBinding): void;
  hasProcessedUpdate(updateId: number): boolean;
  markProcessedUpdate(updateId: number): void;
  getLastProcessedUpdateId(): number | null;
}

export class InMemoryTelegramRelayStore implements TelegramRelayStore {
  private readonly bindingsByChatId = new Map<string, TelegramConversationBinding>();

  private readonly bindingsByConversationId = new Map<string, TelegramConversationBinding>();

  private readonly processedUpdateIds = new Set<number>();

  private lastProcessedUpdateId: number | null = null;

  getBinding(chatId: string): TelegramConversationBinding | null {
    return this.bindingsByChatId.get(chatId) ?? null;
  }

  getBindingByConversationId(conversationId: string): TelegramConversationBinding | null {
    return this.bindingsByConversationId.get(conversationId) ?? null;
  }

  listBindings(): TelegramConversationBinding[] {
    return [...this.bindingsByChatId.values()];
  }

  upsertBinding(binding: TelegramConversationBinding): void {
    const previousBinding = this.bindingsByChatId.get(binding.telegramChatId);
    if (previousBinding && previousBinding.conversationId !== binding.conversationId) {
      this.bindingsByConversationId.delete(previousBinding.conversationId);
    }

    this.bindingsByChatId.set(binding.telegramChatId, binding);
    this.bindingsByConversationId.set(binding.conversationId, binding);
  }

  hasProcessedUpdate(updateId: number): boolean {
    return this.processedUpdateIds.has(updateId);
  }

  markProcessedUpdate(updateId: number): void {
    this.processedUpdateIds.add(updateId);
    this.lastProcessedUpdateId = Math.max(
      this.lastProcessedUpdateId ?? updateId,
      updateId,
    );
  }

  getLastProcessedUpdateId(): number | null {
    return this.lastProcessedUpdateId;
  }
}
