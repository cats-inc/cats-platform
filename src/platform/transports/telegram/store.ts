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

interface PersistedTelegramRelayState {
  version: 1;
  bindings: TelegramConversationBinding[];
  processedUpdateIds: number[];
  lastProcessedUpdateId: number | null;
}

class BaseTelegramRelayStore implements TelegramRelayStore {
  protected readonly processedUpdateOrder: number[] = [];

  protected readonly bindingsByChatId = new Map<string, TelegramConversationBinding>();

  protected readonly bindingsByConversationId = new Map<string, TelegramConversationBinding>();

  protected readonly processedUpdateIds = new Set<number>();

  protected lastProcessedUpdateId: number | null = null;

  constructor(protected readonly maxProcessedUpdates = 2048) {}

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

  protected upsertBindingInMemory(binding: TelegramConversationBinding): void {
    const previousBinding = this.bindingsByChatId.get(binding.telegramChatId);
    if (previousBinding && previousBinding.conversationId !== binding.conversationId) {
      this.bindingsByConversationId.delete(previousBinding.conversationId);
    }

    this.bindingsByChatId.set(binding.telegramChatId, binding);
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

  protected serialize(): PersistedTelegramRelayState {
    return {
      version: 1,
      bindings: this.listBindings(),
      processedUpdateIds: [...this.processedUpdateOrder],
      lastProcessedUpdateId: this.lastProcessedUpdateId,
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
  }
}

function toBinding(rawBinding: unknown): TelegramConversationBinding | null {
  if (!rawBinding || typeof rawBinding !== 'object' || Array.isArray(rawBinding)) {
    return null;
  }

  const binding = rawBinding as Record<string, unknown>;
  const telegramChatId = typeof binding.telegramChatId === 'string'
    ? binding.telegramChatId.trim()
    : '';
  const conversationId = typeof binding.conversationId === 'string'
    ? binding.conversationId.trim()
    : '';
  const transportConversationMode = binding.transportConversationMode;
  const roomRoutingStatus = binding.roomRoutingStatus;
  const linkedRoomId = binding.linkedRoomId;
  const createdAt = binding.createdAt;
  const updatedAt = binding.updatedAt;

  if (
    !telegramChatId
    || !conversationId
    || transportConversationMode !== 'transport_inbox'
    || roomRoutingStatus !== 'placeholder'
    || !(typeof linkedRoomId === 'string' || linkedRoomId === null)
    || typeof createdAt !== 'string'
    || typeof updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    telegramChatId,
    conversationId,
    transportConversationMode,
    roomRoutingStatus,
    linkedRoomId: typeof linkedRoomId === 'string' && linkedRoomId.trim().length > 0
      ? linkedRoomId
      : null,
    createdAt,
    updatedAt,
  };
}

function emptyPersistedState(): PersistedTelegramRelayState {
  return {
    version: 1,
    bindings: [],
    processedUpdateIds: [],
    lastProcessedUpdateId: null,
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

  return {
    version: 1,
    bindings,
    processedUpdateIds,
    lastProcessedUpdateId:
      typeof record.lastProcessedUpdateId === 'number'
      && Number.isFinite(record.lastProcessedUpdateId)
        ? record.lastProcessedUpdateId
        : null,
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
