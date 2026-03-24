import type { BotBindingRecord } from '../../../core/types.js';
import type { RuntimeClient } from '../../runtime/client.js';
import type { CatsMemoryService } from '../../memory/index.js';
import {
  bridgeTelegramWebhookToRoom,
  type TelegramRoomBridge,
} from './bridge.js';
import type {
  TelegramPollingHealth,
  TelegramPollingStatus,
  TelegramRelayContext,
  TelegramWebhookUpdate,
} from './contracts.js';
import type { TelegramRelay } from './relay.js';

export interface TelegramPollingSupervisor {
  startPolling(input: StartPollingInput): Promise<void>;
  stopPolling(bindingId: string): void;
  stopAll(): void;
  reconnect(input: StartPollingInput): Promise<void>;
  reconcilePolling(input: ReconcilePollingInput): Promise<void>;
  getPollingStatus(bindingId: string): TelegramPollingStatus | null;
  getAllPollingStatuses(): TelegramPollingStatus[];
}

export interface StartPollingInput {
  bindingId: string;
  botToken: string;
  context: TelegramRelayContext;
  refreshContext?: () => Promise<TelegramRelayContext>;
  roomBridge: TelegramRoomBridge;
  memoryService: CatsMemoryService;
  runtimeClient: RuntimeClient;
  telegramRelay: TelegramRelay;
}

export interface ReconcilePollingInput {
  bindings: Array<{ bindingId: string; botToken: string; inboundMode: 'polling' | 'webhook' }>;
  context: TelegramRelayContext;
  refreshContext?: () => Promise<TelegramRelayContext>;
  roomBridge: TelegramRoomBridge;
  memoryService: CatsMemoryService;
  runtimeClient: RuntimeClient;
  telegramRelay: TelegramRelay;
}

interface PollingConsumer {
  bindingId: string;
  botToken: string;
  abortController: AbortController;
  health: TelegramPollingHealth;
  offset: number | null;
  lastPollTime: string | null;
  lastSuccessAt: string | null;
  lastPollError: string | null;
  consecutiveFailures: number;
  processedUpdateCount: number;
  lastProcessedUpdateId: number | null;
}

function maskToken(token: string): string {
  if (token.length <= 4) {
    return 'bot:***';
  }
  return `bot:***${token.slice(-4)}`;
}

function resolvePollingHealth(consecutiveFailures: number): TelegramPollingHealth {
  if (consecutiveFailures < 3) {
    return 'healthy';
  }
  if (consecutiveFailures < 10) {
    return 'degraded';
  }
  return 'failed';
}

function computeBackoff(consecutiveFailures: number): number {
  const baseMs = 1000;
  const maxMs = 30000;
  return Math.min(baseMs * Math.pow(2, Math.min(consecutiveFailures, 15)), maxMs);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function telegramDeleteWebhook(
  botToken: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${botToken}/deleteWebhook`,
      { method: 'POST' },
    );
    if (!response.ok) {
      return false;
    }
    const data = await response.json() as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function telegramGetUpdates(
  botToken: string,
  offset: number | null,
  timeout: number,
  signal: AbortSignal,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<TelegramWebhookUpdate[]> {
  const params: Record<string, string> = {
    timeout: String(timeout),
    allowed_updates: JSON.stringify(['message', 'edited_message']),
  };
  if (offset !== null) {
    params.offset = String(offset);
  }
  const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Telegram getUpdates returned ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = await response.json() as { ok?: boolean; result?: TelegramWebhookUpdate[] };
  if (!data.ok || !Array.isArray(data.result)) {
    throw new Error('Telegram getUpdates response missing ok/result');
  }
  return data.result;
}

export interface TelegramPollingSupervisorOptions {
  now?: () => Date;
  fetchImpl?: typeof globalThis.fetch;
  pollingTimeout?: number;
}

export function createTelegramPollingSupervisor(
  options: TelegramPollingSupervisorOptions = {},
): TelegramPollingSupervisor {
  const consumers = new Map<string, PollingConsumer>();
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const pollingTimeout = options.pollingTimeout ?? 30;

  function toStatus(consumer: PollingConsumer): TelegramPollingStatus {
    return {
      bindingId: consumer.bindingId,
      health: consumer.health,
      lastPollTime: consumer.lastPollTime,
      lastSuccessAt: consumer.lastSuccessAt,
      lastPollError: consumer.lastPollError,
      consecutiveFailures: consumer.consecutiveFailures,
      processedUpdateCount: consumer.processedUpdateCount,
      lastProcessedUpdateId: consumer.lastProcessedUpdateId,
    };
  }

  function buildScopedContext(
    baseContext: TelegramRelayContext,
    bindingId: string,
  ): TelegramRelayContext {
    const selectedBotBinding = baseContext.botBindings.find((b) => b.id === bindingId) ?? null;
    return {
      ...baseContext,
      selectedBotBinding,
    };
  }

  async function runPollingLoop(
    consumer: PollingConsumer,
    input: StartPollingInput,
  ): Promise<void> {
    const { bindingId, botToken, roomBridge, runtimeClient, telegramRelay } = input;
    const signal = consumer.abortController.signal;

    try {
      await telegramDeleteWebhook(botToken, fetchImpl);
    } catch {
      // Best-effort; continue to polling even if deleteWebhook fails
    }

    while (!signal.aborted) {
      try {
        const updates = await telegramGetUpdates(
          botToken,
          consumer.offset,
          pollingTimeout,
          signal,
          fetchImpl,
        );

        const pollTime = now().toISOString();
        consumer.lastPollTime = pollTime;

        // Re-read context each poll cycle so binding/boss changes are picked up
        const freshContext = input.refreshContext
          ? await input.refreshContext()
          : input.context;
        const scopedContext = buildScopedContext(freshContext, bindingId);

        for (const update of updates) {
          if (signal.aborted) {
            break;
          }

          const updateId = typeof update.update_id === 'number' ? update.update_id : null;

          const receipt = telegramRelay.receiveUpdate({ update, context: scopedContext });

          if (receipt.status === 'accepted') {
            try {
              await bridgeTelegramWebhookToRoom({
                update,
                receipt,
                context: scopedContext,
                roomBridge,
                memoryService: input.memoryService,
                runtimeClient,
                telegramRelay,
                now: options.now,
              });
            } catch {
              // Bridge errors are already handled inside bridgeTelegramWebhookToRoom
            }
          }

          if (updateId !== null) {
            consumer.offset = updateId + 1;
            consumer.lastProcessedUpdateId = updateId;
          }
          consumer.processedUpdateCount += 1;
        }

        consumer.consecutiveFailures = 0;
        consumer.health = 'healthy';
        if (updates.length > 0) {
          consumer.lastSuccessAt = pollTime;
        }

        // Yield to the event loop between polls to prevent CPU spin when
        // pollingTimeout is 0 (tests) or Telegram returns immediately
        if (pollingTimeout === 0 || updates.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      } catch (error) {
        if (signal.aborted) {
          break;
        }
        consumer.consecutiveFailures += 1;
        consumer.health = resolvePollingHealth(consumer.consecutiveFailures);
        consumer.lastPollError = error instanceof Error
          ? error.message.replace(botToken, maskToken(botToken))
          : `Polling error for ${maskToken(botToken)}`;
        consumer.lastPollTime = now().toISOString();

        const backoff = computeBackoff(consumer.consecutiveFailures);
        try {
          await sleep(backoff, signal);
        } catch {
          break;
        }
      }
    }

    consumer.health = 'stopped';
  }

  return {
    async startPolling(input: StartPollingInput): Promise<void> {
      const existing = consumers.get(input.bindingId);
      if (existing && existing.health !== 'stopped') {
        existing.abortController.abort();
      }

      const lastUpdateId = input.telegramRelay
        .resolveBinding({ bindingId: input.bindingId })
        ? null
        : null;

      const consumer: PollingConsumer = {
        bindingId: input.bindingId,
        botToken: input.botToken,
        abortController: new AbortController(),
        health: 'healthy',
        offset: lastUpdateId,
        lastPollTime: null,
        lastSuccessAt: null,
        lastPollError: null,
        consecutiveFailures: 0,
        processedUpdateCount: 0,
        lastProcessedUpdateId: null,
      };
      consumers.set(input.bindingId, consumer);

      // Fire and forget the polling loop
      void runPollingLoop(consumer, input);
    },

    stopPolling(bindingId: string): void {
      const consumer = consumers.get(bindingId);
      if (consumer) {
        consumer.abortController.abort();
        consumer.health = 'stopped';
      }
    },

    stopAll(): void {
      for (const consumer of consumers.values()) {
        consumer.abortController.abort();
        consumer.health = 'stopped';
      }
    },

    async reconnect(input: StartPollingInput): Promise<void> {
      this.stopPolling(input.bindingId);
      await sleep(1000, new AbortController().signal).catch(() => {});
      await this.startPolling(input);
    },

    async reconcilePolling(input: ReconcilePollingInput): Promise<void> {
      const pollingBindings = input.bindings.filter((b) => b.inboundMode === 'polling' && b.botToken);
      const activeBindingIds = new Set(pollingBindings.map((b) => b.bindingId));

      // Stop consumers that are no longer active polling bindings
      for (const [bindingId, consumer] of consumers) {
        if (!activeBindingIds.has(bindingId) && consumer.health !== 'stopped') {
          consumer.abortController.abort();
          consumer.health = 'stopped';
        }
      }

      // Start consumers that should be polling but aren't
      for (const binding of pollingBindings) {
        const existing = consumers.get(binding.bindingId);
        if (!existing || existing.health === 'stopped' || existing.botToken !== binding.botToken) {
          await this.startPolling({
            bindingId: binding.bindingId,
            botToken: binding.botToken,
            context: input.context,
            refreshContext: input.refreshContext,
            roomBridge: input.roomBridge,
            memoryService: input.memoryService,
            runtimeClient: input.runtimeClient,
            telegramRelay: input.telegramRelay,
          });
        }
      }
    },

    getPollingStatus(bindingId: string): TelegramPollingStatus | null {
      const consumer = consumers.get(bindingId);
      return consumer ? toStatus(consumer) : null;
    },

    getAllPollingStatuses(): TelegramPollingStatus[] {
      return [...consumers.values()].map(toStatus);
    },
  };
}
