import type { BotBindingRecord } from '../../../core/types.js';
import type { RuntimeClient } from '../../runtime/client.js';
import type { CatsMemoryService } from '../../memory/index.js';
import { telegramIpv4Fetch, type TelegramFetch } from './http.js';
import {
  createTelegramIngressDispatcher,
  type TelegramIngressDispatcher,
} from './ingressDispatch.js';
import type { TransportWorkGoldenPathPort } from '../work-delivery/port.js';
import type { TelegramCommandPort } from './commandPort.js';
import {
  bridgeTelegramWebhookToRoom,
  type TelegramRoomBridge,
  type TelegramWebhookBridgeResult,
} from './bridge.js';
import type {
  TelegramPollingHealth,
  TelegramPollingStatus,
  TelegramRelayContext,
  TelegramWebhookUpdate,
} from './contracts.js';
import type { TelegramRelay } from './relay/index.js';

export interface TelegramPollingSupervisor {
  /**
   * Waits for bridge work dispatched by the poll loops to settle.
   *
   * Drains the dispatcher this supervisor uses, which the host shares with
   * webhook ingress. See `ingressDispatch.ts` for why this is not part of
   * shutdown.
   */
  drain(): Promise<void>;
  startPolling(input: StartPollingInput): Promise<void>;
  stopPolling(bindingId: string): void;
  stopAll(): void;
  reconnect(input: StartPollingInput): Promise<void>;
  reconcilePolling(input: ReconcilePollingInput): Promise<void>;
  getPollingStatus(bindingId: string): TelegramPollingStatus | null;
  getAllPollingStatuses(): TelegramPollingStatus[];
}

export type TelegramPollingBridgeResultHandler = (result: TelegramWebhookBridgeResult) => void;

export interface StartPollingInput {
  bindingId: string;
  botToken: string;
  context: TelegramRelayContext;
  refreshContext?: () => Promise<TelegramRelayContext>;
  roomBridge: TelegramRoomBridge;
  memoryService: CatsMemoryService;
  runtimeClient: RuntimeClient;
  telegramRelay: TelegramRelay;
  /** SPEC-114 golden path. Absent means `/work` falls through to chat. */
  goldenPath?: TransportWorkGoldenPathPort | null;
  /** Transport-owned slash commands, shared with webhook ingress. */
  commands?: TelegramCommandPort | null;
  onBridgeResult?: TelegramPollingBridgeResultHandler;
}

export interface ReconcilePollingInput {
  bindings: Array<{ bindingId: string; botToken: string; inboundMode: 'polling' | 'webhook' }>;
  context: TelegramRelayContext;
  refreshContext?: () => Promise<TelegramRelayContext>;
  roomBridge: TelegramRoomBridge;
  memoryService: CatsMemoryService;
  runtimeClient: RuntimeClient;
  telegramRelay: TelegramRelay;
  goldenPath?: TransportWorkGoldenPathPort | null;
  commands?: TelegramCommandPort | null;
  onBridgeResult?: TelegramPollingBridgeResultHandler;
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
  fetchImpl: TelegramFetch = telegramIpv4Fetch,
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

/**
 * Update kinds this transport can process.
 *
 * `callback_query` is required by SPEC-114 FR-11: inline proposal actions
 * (`Start work` / `Adjust` / `Cancel`) arrive as callback queries, and Telegram
 * silently withholds any kind absent from `allowed_updates`. Webhook
 * registration must send the same list so both ingress modes stay at parity.
 */
export const TELEGRAM_ALLOWED_UPDATE_KINDS = [
  'message',
  'edited_message',
  'callback_query',
] as const;

export async function telegramGetUpdates(
  botToken: string,
  offset: number | null,
  timeout: number,
  signal: AbortSignal,
  fetchImpl: TelegramFetch = telegramIpv4Fetch,
): Promise<TelegramWebhookUpdate[]> {
  const params: Record<string, string> = {
    timeout: String(timeout),
    allowed_updates: JSON.stringify([...TELEGRAM_ALLOWED_UPDATE_KINDS]),
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
  fetchImpl?: TelegramFetch;
  pollingTimeout?: number;
  /**
   * Shared with webhook ingress by the host, so a binding's in-flight ceiling
   * covers both ways an update can arrive. Left unset, the supervisor keeps its
   * own — which is what stand-alone tests want.
   */
  ingressDispatcher?: TelegramIngressDispatcher;
  /** Ceiling for a dispatcher the supervisor creates itself. */
  maxInFlightPerBinding?: number;
}

export function createTelegramPollingSupervisor(
  options: TelegramPollingSupervisorOptions = {},
): TelegramPollingSupervisor {
  const consumers = new Map<string, PollingConsumer>();
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? telegramIpv4Fetch;
  const pollingTimeout = options.pollingTimeout ?? 30;
  const dispatcher = options.ingressDispatcher
    ?? createTelegramIngressDispatcher({ maxInFlightPerKey: options.maxInFlightPerBinding });

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
            // Backpressure before dispatching, never between two dispatches for
            // the same room: the room lock is entered synchronously inside the
            // bridge, so call order is processing order.
            await dispatcher.waitForSlot(bindingId);

            dispatcher.dispatch(bindingId, async () => {
              try {
                const bridgeResult = await bridgeTelegramWebhookToRoom({
                  update,
                  receipt,
                  context: scopedContext,
                  roomBridge,
                  memoryService: input.memoryService,
                  runtimeClient,
                  telegramRelay,
                  goldenPath: input.goldenPath ?? null,
                  commands: input.commands ?? null,
                  now: options.now,
                });
                try {
                  input.onBridgeResult?.(bridgeResult);
                } catch {
                  // Delivery already succeeded; UI/event hooks stay best-effort.
                }
              } catch {
                // Bridge errors are already handled inside bridgeTelegramWebhookToRoom
              }
            });
          }

          // The offset advances on dispatch, not on completion (FR-14). A long
          // assistant turn must not stop this binding — or any other — from
          // receiving the next update.
          //
          // The cost is a wider crash window: an update whose bridge is still
          // running when the next poll confirms the offset is not redelivered by
          // Telegram after a host restart. That trade is deliberate. Holding the
          // offset across a multi-minute provider turn would make one slow room
          // silence the whole binding, and the work that matters — an admitted
          // golden-path Run — survives in Core and is re-driven by the startup
          // resume sweep. An update lost before admission is not recoverable
          // here, and must not be papered over as if it were.
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
    drain(): Promise<void> {
      return dispatcher.drain();
    },

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
            goldenPath: input.goldenPath,
            commands: input.commands,
            onBridgeResult: input.onBridgeResult,
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
