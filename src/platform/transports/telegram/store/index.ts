import path from 'node:path';

import type {
  TelegramConversationBinding,
  TelegramDeliveryReceipt,
  TelegramWebhookReceipt,
} from '../contracts.js';
import {
  readPersistedTelegramRelayState,
  writePersistedTelegramRelayState,
} from './persistence.js';
import type { PersistedTelegramRelayState } from './state.js';

export interface TelegramIngressStatsSnapshot {
  acceptedCount: number;
  ignoredCount: number;
  lastReceipt: TelegramWebhookReceipt | null;
}

export interface TelegramDeliveryStatsSnapshot {
  sentCount: number;
  repliedCount: number;
  editedCount: number;
  deletedCount: number;
  failedCount: number;
  lastReceipt: TelegramDeliveryReceipt | null;
}

export interface TelegramRelayStore {
  getBinding(chatId: string, bindingId?: string | null): TelegramConversationBinding | null;
  getBindingByConversationId(conversationId: string): TelegramConversationBinding | null;
  listBindings(): TelegramConversationBinding[];
  upsertBinding(binding: TelegramConversationBinding): void;
  hasProcessedUpdate(updateId: number): boolean;
  markProcessedUpdate(updateId: number): void;
  getLastProcessedUpdateId(): number | null;
  getProcessedUpdateCount(): number;
  getMaxProcessedUpdates(): number;
  recordIngressReceipt(receipt: TelegramWebhookReceipt): void;
  getIngressStats(): TelegramIngressStatsSnapshot;
  recordDeliveryReceipt(receipt: TelegramDeliveryReceipt): void;
  getDeliveryStats(): TelegramDeliveryStatsSnapshot;
}

function createBindingKey(chatId: string, bindingId?: string | null): string {
  const normalizedBindingId = typeof bindingId === 'string' && bindingId.trim().length > 0
    ? bindingId.trim()
    : 'default';
  return `${normalizedBindingId}:${chatId}`;
}

class BaseTelegramRelayStore implements TelegramRelayStore {
  protected readonly processedUpdateOrder: number[] = [];

  protected readonly bindingsByChatId = new Map<string, TelegramConversationBinding>();

  protected readonly bindingsByConversationId = new Map<string, TelegramConversationBinding>();

  protected readonly processedUpdateIds = new Set<number>();

  protected lastProcessedUpdateId: number | null = null;

  protected ingressAcceptedCount = 0;

  protected ingressIgnoredCount = 0;

  protected lastIngressReceipt: TelegramWebhookReceipt | null = null;

  protected deliverySentCount = 0;

  protected deliveryRepliedCount = 0;

  protected deliveryEditedCount = 0;

  protected deliveryDeletedCount = 0;

  protected deliveryFailedCount = 0;

  protected lastDeliveryReceipt: TelegramDeliveryReceipt | null = null;

  constructor(protected readonly maxProcessedUpdates = 2048) {}

  getBinding(chatId: string, bindingId?: string | null): TelegramConversationBinding | null {
    return this.bindingsByChatId.get(createBindingKey(chatId, bindingId)) ?? null;
  }

  getBindingByConversationId(conversationId: string): TelegramConversationBinding | null {
    return this.bindingsByConversationId.get(conversationId) ?? null;
  }

  listBindings(): TelegramConversationBinding[] {
    return [...this.bindingsByChatId.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  upsertBinding(binding: TelegramConversationBinding): void {
    this.upsertBindingInMemory(binding);
  }

  hasProcessedUpdate(updateId: number): boolean {
    return this.processedUpdateIds.has(updateId);
  }

  markProcessedUpdate(updateId: number): void {
    this.markProcessedUpdateInMemory(updateId);
  }

  getLastProcessedUpdateId(): number | null {
    return this.lastProcessedUpdateId;
  }

  getProcessedUpdateCount(): number {
    return this.processedUpdateOrder.length;
  }

  getMaxProcessedUpdates(): number {
    return this.maxProcessedUpdates;
  }

  recordIngressReceipt(receipt: TelegramWebhookReceipt): void {
    this.recordIngressReceiptInMemory(receipt);
  }

  getIngressStats(): TelegramIngressStatsSnapshot {
    return {
      acceptedCount: this.ingressAcceptedCount,
      ignoredCount: this.ingressIgnoredCount,
      lastReceipt: this.lastIngressReceipt,
    };
  }

  recordDeliveryReceipt(receipt: TelegramDeliveryReceipt): void {
    this.recordDeliveryReceiptInMemory(receipt);
  }

  getDeliveryStats(): TelegramDeliveryStatsSnapshot {
    return {
      sentCount: this.deliverySentCount,
      repliedCount: this.deliveryRepliedCount,
      editedCount: this.deliveryEditedCount,
      deletedCount: this.deliveryDeletedCount,
      failedCount: this.deliveryFailedCount,
      lastReceipt: this.lastDeliveryReceipt,
    };
  }

  protected upsertBindingInMemory(binding: TelegramConversationBinding): void {
    const bindingKey = createBindingKey(binding.telegramChatId, binding.bindingId);
    const previousBinding = this.bindingsByChatId.get(bindingKey);
    if (previousBinding && previousBinding.conversationId !== binding.conversationId) {
      this.bindingsByConversationId.delete(previousBinding.conversationId);
    }

    this.bindingsByChatId.set(bindingKey, binding);
    this.bindingsByConversationId.set(binding.conversationId, binding);
  }

  protected markProcessedUpdateInMemory(updateId: number): void {
    if (this.processedUpdateIds.has(updateId)) {
      return;
    }

    this.processedUpdateIds.add(updateId);
    this.processedUpdateOrder.push(updateId);
    this.lastProcessedUpdateId = Math.max(this.lastProcessedUpdateId ?? updateId, updateId);

    while (this.processedUpdateOrder.length > this.maxProcessedUpdates) {
      const evictedUpdateId = this.processedUpdateOrder.shift();
      if (evictedUpdateId !== undefined) {
        this.processedUpdateIds.delete(evictedUpdateId);
      }
    }
  }

  protected recordIngressReceiptInMemory(receipt: TelegramWebhookReceipt): void {
    if (receipt.status === 'accepted') {
      this.ingressAcceptedCount += 1;
    } else {
      this.ingressIgnoredCount += 1;
    }
    this.lastIngressReceipt = receipt;
  }

  protected recordDeliveryReceiptInMemory(receipt: TelegramDeliveryReceipt): void {
    if (receipt.status === 'failed') {
      this.deliveryFailedCount += 1;
      this.lastDeliveryReceipt = receipt;
      return;
    }

    if (receipt.operation === 'send' || receipt.operation === 'send_media') {
      this.deliverySentCount += 1;
    } else if (receipt.operation === 'reply') {
      this.deliveryRepliedCount += 1;
    } else if (receipt.operation === 'edit') {
      this.deliveryEditedCount += 1;
    } else if (receipt.operation === 'delete') {
      this.deliveryDeletedCount += 1;
    }

    this.lastDeliveryReceipt = receipt;
  }

  protected serialize(): PersistedTelegramRelayState {
    return {
      version: 2,
      bindings: this.listBindings(),
      processedUpdateIds: [...this.processedUpdateOrder],
      lastProcessedUpdateId: this.lastProcessedUpdateId,
      ingress: this.getIngressStats(),
      delivery: this.getDeliveryStats(),
    };
  }

  protected hydrate(payload: PersistedTelegramRelayState): void {
    for (const binding of payload.bindings) {
      this.upsertBindingInMemory(binding);
    }
    for (const updateId of payload.processedUpdateIds) {
      this.markProcessedUpdateInMemory(updateId);
    }
    this.lastProcessedUpdateId = payload.lastProcessedUpdateId;
    this.ingressAcceptedCount = payload.ingress.acceptedCount;
    this.ingressIgnoredCount = payload.ingress.ignoredCount;
    this.lastIngressReceipt = payload.ingress.lastReceipt;
    this.deliverySentCount = payload.delivery.sentCount;
    this.deliveryRepliedCount = payload.delivery.repliedCount;
    this.deliveryEditedCount = payload.delivery.editedCount;
    this.deliveryDeletedCount = payload.delivery.deletedCount;
    this.deliveryFailedCount = payload.delivery.failedCount;
    this.lastDeliveryReceipt = payload.delivery.lastReceipt;
  }
}

export class InMemoryTelegramRelayStore extends BaseTelegramRelayStore {}

export class FileBackedTelegramRelayStore extends BaseTelegramRelayStore {
  constructor(
    private readonly statePath: string,
    maxProcessedUpdates = 2048,
  ) {
    super(maxProcessedUpdates);
    this.hydrate(this.readPersistedState());
  }

  override upsertBinding(binding: TelegramConversationBinding): void {
    this.upsertBindingInMemory(binding);
    this.persist();
  }

  override markProcessedUpdate(updateId: number): void {
    const alreadyProcessed = this.processedUpdateIds.has(updateId);
    this.markProcessedUpdateInMemory(updateId);
    if (!alreadyProcessed) {
      this.persist();
    }
  }

  override recordIngressReceipt(receipt: TelegramWebhookReceipt): void {
    this.recordIngressReceiptInMemory(receipt);
    this.persist();
  }

  override recordDeliveryReceipt(receipt: TelegramDeliveryReceipt): void {
    this.recordDeliveryReceiptInMemory(receipt);
    this.persist();
  }

  private readPersistedState(): PersistedTelegramRelayState {
    return readPersistedTelegramRelayState(this.statePath, this.maxProcessedUpdates);
  }

  private persist(): void {
    writePersistedTelegramRelayState(this.statePath, this.serialize());
  }
}

export function resolveTelegramRelayStatePath(chatStatePath: string): string {
  const parsed = path.parse(chatStatePath);
  const extension = parsed.ext || '.json';
  return path.join(parsed.dir, `${parsed.name}.telegram-relay${extension}`);
}

export function createFileBackedTelegramRelayStore(
  chatStatePath: string,
  maxProcessedUpdates = 2048,
): TelegramRelayStore {
  return new FileBackedTelegramRelayStore(
    resolveTelegramRelayStatePath(chatStatePath),
    maxProcessedUpdates,
  );
}
