import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type {
  TelegramAttachmentKind,
  TelegramConversationBinding,
  TelegramDeliveryReceipt,
  TelegramWebhookReceipt,
} from './contracts.js';

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

interface PersistedTelegramRelayState {
  version: 2;
  bindings: TelegramConversationBinding[];
  processedUpdateIds: number[];
  lastProcessedUpdateId: number | null;
  ingress: TelegramIngressStatsSnapshot;
  delivery: TelegramDeliveryStatsSnapshot;
}

const ATTACHMENT_KINDS = new Set<string>([
  'photo',
  'document',
  'audio',
  'voice',
  'video',
  'video_note',
  'animation',
  'sticker',
  'location',
  'contact',
]);

const WEBHOOK_REASONS = new Set<NonNullable<TelegramWebhookReceipt['reason']>>([
  'telegram_not_bound_to_boss_cat',
  'duplicate_update',
  'unsupported_update',
  'unsupported_chat_type',
  'message_from_bot',
]);

const DELIVERY_OPERATIONS = new Set<TelegramDeliveryReceipt['operation']>([
  'send',
  'reply',
  'edit',
  'delete',
]);
const DELIVERY_STATUSES = new Set<TelegramDeliveryReceipt['status']>([
  'sent',
  'edited',
  'deleted',
  'failed',
]);
const DELIVERY_REASONS = new Set<NonNullable<TelegramDeliveryReceipt['reason']>>([
  'telegram_not_bound_to_boss_cat',
  'delivery_client_not_configured',
  'conversation_not_mapped',
  'chat_id_required',
  'message_id_required',
  'text_required',
  'telegram_api_error',
]);

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

    if (receipt.operation === 'send') {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readAttachmentKinds(value: unknown): TelegramAttachmentKind[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is TelegramAttachmentKind => typeof item === 'string' && ATTACHMENT_KINDS.has(item),
  );
}

function readRoomRoutingStatus(
  value: unknown,
): TelegramConversationBinding['roomRoutingStatus'] | null {
  return value === 'linked_room' || value === 'placeholder'
    ? value
    : null;
}

function toRoomRouting(rawValue: unknown): TelegramWebhookReceipt['roomRouting'] | null {
  const record = asRecord(rawValue);
  if (!record) {
    return null;
  }

  const transportConversationMode = record.transportConversationMode;
  const roomRoutingStatus = readRoomRoutingStatus(record.roomRoutingStatus);
  const linkedRoomId = record.linkedRoomId;
  const note = readString(record.note);

  if (
    transportConversationMode !== 'transport_inbox'
    || !roomRoutingStatus
    || !(typeof linkedRoomId === 'string' || linkedRoomId === null)
    || !note
  ) {
    return null;
  }

  return {
    transportConversationMode,
    roomRoutingStatus,
    linkedRoomId: typeof linkedRoomId === 'string' ? linkedRoomId : null,
    note,
  };
}

function toMessageSummary(
  rawValue: unknown,
): TelegramWebhookReceipt['messageSummary'] {
  if (rawValue == null) {
    return null;
  }

  const record = asRecord(rawValue);
  if (!record) {
    return null;
  }

  const attachmentKinds = readAttachmentKinds(record.attachmentKinds);
  const attachmentCount = readNumber(record.attachmentCount);
  const isEdited = typeof record.isEdited === 'boolean' ? record.isEdited : null;

  if (attachmentCount === null || isEdited === null) {
    return null;
  }

  return {
    isEdited,
    senderId: readString(record.senderId),
    senderDisplayName: readString(record.senderDisplayName),
    senderUsername: readString(record.senderUsername),
    textPreview: readString(record.textPreview),
    attachmentCount,
    attachmentKinds,
    replyToMessageId: readString(record.replyToMessageId),
  };
}

function toWebhookReceipt(rawValue: unknown): TelegramWebhookReceipt | null {
  const record = asRecord(rawValue);
  if (!record) {
    return null;
  }

  const roomRouting = toRoomRouting(record.roomRouting);
  const acceptedAt = readString(record.acceptedAt);
  const status = record.status === 'accepted' || record.status === 'ignored'
    ? record.status
    : null;

  if (
    record.platform !== 'telegram'
    || !status
    || !acceptedAt
    || !roomRouting
  ) {
    return null;
  }

  const reason = typeof record.reason === 'string'
    && WEBHOOK_REASONS.has(record.reason as NonNullable<TelegramWebhookReceipt['reason']>)
    ? record.reason as NonNullable<TelegramWebhookReceipt['reason']>
    : undefined;

  return {
    platform: 'telegram',
    status,
    acceptedAt,
    updateId: readNumber(record.updateId),
    chatId: readString(record.chatId),
    messageId: readString(record.messageId),
    bindingId: readString(record.bindingId),
    botName: readString(record.botName),
    bossCatId: readString(record.bossCatId),
    bossCatName: readString(record.bossCatName),
    mappedConversationId: readString(record.mappedConversationId),
    messageSummary: toMessageSummary(record.messageSummary),
    roomRouting,
    reason,
  };
}

function toDeliveryReceipt(rawValue: unknown): TelegramDeliveryReceipt | null {
  const record = asRecord(rawValue);
  if (!record) {
    return null;
  }

  const operation = typeof record.operation === 'string'
    && DELIVERY_OPERATIONS.has(record.operation as TelegramDeliveryReceipt['operation'])
    ? record.operation as TelegramDeliveryReceipt['operation']
    : null;
  const status = typeof record.status === 'string'
    && DELIVERY_STATUSES.has(record.status as TelegramDeliveryReceipt['status'])
    ? record.status as TelegramDeliveryReceipt['status']
    : null;
  const deliveredAt = readString(record.deliveredAt);
  const deliveryId = readString(record.deliveryId);

  if (
    record.platform !== 'telegram'
    || !operation
    || !status
    || !deliveredAt
    || !deliveryId
  ) {
    return null;
  }

  const reason = typeof record.reason === 'string'
    && DELIVERY_REASONS.has(record.reason as NonNullable<TelegramDeliveryReceipt['reason']>)
    ? record.reason as NonNullable<TelegramDeliveryReceipt['reason']>
    : undefined;

  return {
    platform: 'telegram',
    operation,
    status,
    deliveredAt,
    deliveryId,
    chatId: readString(record.chatId),
    conversationId: readString(record.conversationId),
    messageId: readString(record.messageId),
    replyToMessageId: readString(record.replyToMessageId),
    bindingId: readString(record.bindingId),
    botName: readString(record.botName),
    bossCatId: readString(record.bossCatId),
    bossCatName: readString(record.bossCatName),
    textPreview: readString(record.textPreview),
    reason,
    errorMessage: readString(record.errorMessage),
  };
}

function toBinding(rawBinding: unknown): TelegramConversationBinding | null {
  if (!rawBinding || typeof rawBinding !== 'object' || Array.isArray(rawBinding)) {
    return null;
  }

  const binding = rawBinding as Record<string, unknown>;
  const telegramChatId = readString(binding.telegramChatId);
  const conversationId = readString(binding.conversationId);
  const transportConversationMode = binding.transportConversationMode;
  const roomRoutingStatus = readRoomRoutingStatus(binding.roomRoutingStatus);
  const linkedRoomId = binding.linkedRoomId;
  const createdAt = readString(binding.createdAt);
  const updatedAt = readString(binding.updatedAt);

  if (
    !telegramChatId
    || !conversationId
    || transportConversationMode !== 'transport_inbox'
    || !roomRoutingStatus
    || !(typeof linkedRoomId === 'string' || linkedRoomId === null || linkedRoomId === undefined)
    || !createdAt
    || !updatedAt
  ) {
    return null;
  }

  return {
    telegramChatId,
    conversationId,
    bindingId: readString(binding.bindingId),
    botName: readString(binding.botName),
    transportConversationMode,
    roomRoutingStatus,
    linkedRoomId: typeof linkedRoomId === 'string' && linkedRoomId.trim().length > 0
      ? linkedRoomId
      : null,
    telegramChatType: readString(binding.telegramChatType) ?? 'private',
    telegramChatTitle: readString(binding.telegramChatTitle),
    telegramChatUsername: readString(binding.telegramChatUsername),
    lastInboundMessageId: readString(binding.lastInboundMessageId),
    lastInboundAt: readString(binding.lastInboundAt),
    lastInboundTextPreview: readString(binding.lastInboundTextPreview),
    lastInboundAttachmentKinds: readAttachmentKinds(binding.lastInboundAttachmentKinds),
    lastOutboundMessageId: readString(binding.lastOutboundMessageId),
    lastOutboundAt: readString(binding.lastOutboundAt),
    createdAt,
    updatedAt,
  };
}

function emptyPersistedState(): PersistedTelegramRelayState {
  return {
    version: 2,
    bindings: [],
    processedUpdateIds: [],
    lastProcessedUpdateId: null,
    ingress: {
      acceptedCount: 0,
      ignoredCount: 0,
      lastReceipt: null,
    },
    delivery: {
      sentCount: 0,
      repliedCount: 0,
      editedCount: 0,
      deletedCount: 0,
      failedCount: 0,
      lastReceipt: null,
    },
  };
}

function asPersistedState(
  payload: unknown,
  maxProcessedUpdates: number,
): PersistedTelegramRelayState {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return emptyPersistedState();
  }

  const record = payload as Record<string, unknown>;
  const fallback = emptyPersistedState();
  const bindings = Array.isArray(record.bindings)
    ? record.bindings
        .map((rawBinding) => toBinding(rawBinding))
        .filter((binding): binding is TelegramConversationBinding => binding !== null)
    : [];
  const processedUpdateIds = Array.isArray(record.processedUpdateIds)
    ? record.processedUpdateIds
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .slice(-maxProcessedUpdates)
    : [];
  const ingressRecord = asRecord(record.ingress);
  const deliveryRecord = asRecord(record.delivery);

  return {
    version: 2,
    bindings,
    processedUpdateIds,
    lastProcessedUpdateId:
      typeof record.lastProcessedUpdateId === 'number'
      && Number.isFinite(record.lastProcessedUpdateId)
        ? record.lastProcessedUpdateId
        : null,
    ingress: {
      acceptedCount: readNumber(ingressRecord?.acceptedCount) ?? fallback.ingress.acceptedCount,
      ignoredCount: readNumber(ingressRecord?.ignoredCount) ?? fallback.ingress.ignoredCount,
      lastReceipt: toWebhookReceipt(ingressRecord?.lastReceipt),
    },
    delivery: {
      sentCount: readNumber(deliveryRecord?.sentCount) ?? fallback.delivery.sentCount,
      repliedCount: readNumber(deliveryRecord?.repliedCount) ?? fallback.delivery.repliedCount,
      editedCount: readNumber(deliveryRecord?.editedCount) ?? fallback.delivery.editedCount,
      deletedCount: readNumber(deliveryRecord?.deletedCount) ?? fallback.delivery.deletedCount,
      failedCount: readNumber(deliveryRecord?.failedCount) ?? fallback.delivery.failedCount,
      lastReceipt: toDeliveryReceipt(deliveryRecord?.lastReceipt),
    },
  };
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
    if (!existsSync(this.statePath)) {
      return emptyPersistedState();
    }

    try {
      return asPersistedState(
        JSON.parse(readFileSync(this.statePath, 'utf8')),
        this.maxProcessedUpdates,
      );
    } catch {
      return emptyPersistedState();
    }
  }

  private persist(): void {
    const directory = path.dirname(this.statePath);
    mkdirSync(directory, { recursive: true });

    const nextBody = JSON.stringify(this.serialize(), null, 2);
    const tempPath = path.join(
      directory,
      `.${path.basename(this.statePath)}.${process.pid}.${randomUUID()}.tmp`,
    );

    try {
      writeFileSync(tempPath, nextBody, 'utf8');
      renameSync(tempPath, this.statePath);
    } finally {
      if (existsSync(tempPath)) {
        rmSync(tempPath, { force: true });
      }
    }
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
