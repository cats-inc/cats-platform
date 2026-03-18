import type { TelegramConversationBinding } from './contracts.js';

export interface TelegramRelayStore {
  getBinding(chatId: string): TelegramConversationBinding | null;
  listBindings(): TelegramConversationBinding[];
  upsertBinding(binding: TelegramConversationBinding): void;
  getLastProcessedUpdateId(): number | null;
  setLastProcessedUpdateId(updateId: number): void;
}

export class InMemoryTelegramRelayStore implements TelegramRelayStore {
  private readonly bindings = new Map<string, TelegramConversationBinding>();

  private lastProcessedUpdateId: number | null = null;

  getBinding(chatId: string): TelegramConversationBinding | null {
    return this.bindings.get(chatId) ?? null;
  }

  listBindings(): TelegramConversationBinding[] {
    return [...this.bindings.values()];
  }

  upsertBinding(binding: TelegramConversationBinding): void {
    this.bindings.set(binding.telegramChatId, binding);
  }

  getLastProcessedUpdateId(): number | null {
    return this.lastProcessedUpdateId;
  }

  setLastProcessedUpdateId(updateId: number): void {
    this.lastProcessedUpdateId = updateId;
  }
}
