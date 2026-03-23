import type { IncomingMessage, ServerResponse } from 'node:http';

import { createCatActorId } from '../../core/model.js';
import type { BotBindingRecord } from '../../core/types.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import {
  bridgeTelegramWebhookToRoom,
  TelegramWebhookBridgeError,
} from '../../platform/transports/telegram/bridge.js';
import type { TelegramRelayContext, TelegramWebhookUpdate } from '../../platform/transports/telegram/contracts.js';
import type { TelegramPollingSupervisor } from '../../platform/transports/telegram/polling.js';
import type { TelegramRelay } from '../../platform/transports/telegram/relay.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import type { ChatState } from '../../shared/app-shell.js';

interface TelegramQueryDependencies {
  chatStore: ChatStore;
  telegramRelay: TelegramRelay;
}

interface TelegramWebhookDependencies extends TelegramQueryDependencies {
  runtimeClient: RuntimeClient;
  now?: () => Date;
}

class TelegramWebhookRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
  });
  response.end(body);
}

function sendRestError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
): void {
  sendJson(response, statusCode, {
    error: { code, message },
  });
}

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return true;
  }

  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return normalized === 'application/json' || normalized.endsWith('+json');
}

async function readTelegramWebhookBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<TelegramWebhookUpdate> {
  if (!isJsonContentType(request.headers['content-type'])) {
    throw new TelegramWebhookRequestError(
      415,
      'telegram_webhook_requires_json',
      'Telegram webhook requests must use application/json.',
    );
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBodyBytes) {
      throw new TelegramWebhookRequestError(
        413,
        'telegram_webhook_too_large',
        `Telegram webhook body exceeds ${maxBodyBytes} bytes.`,
      );
    }
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString('utf-8').trim();
  if (!rawBody) {
    throw new TelegramWebhookRequestError(
      400,
      'invalid_telegram_update',
      'Request body is required',
    );
  }

  try {
    return JSON.parse(rawBody) as TelegramWebhookUpdate;
  } catch {
    throw new TelegramWebhookRequestError(
      400,
      'invalid_telegram_update',
      'Telegram webhook body must be valid JSON.',
    );
  }
}

function resolveBossCatName(chatState: ChatState): string | null {
  if (!chatState.bossCatId) {
    return null;
  }

  return chatState.cats.find((cat) => cat.id === chatState.bossCatId)?.name ?? null;
}

async function readTelegramContext(
  chatStore: ChatStore,
  selectedBindingId?: string,
): Promise<{
  bossCatId: string | null;
  bossCatName: string | null;
  bossCatActorId: string | null;
  botBindings: BotBindingRecord[];
  defaultBotBinding: BotBindingRecord | null;
  selectedBotBinding: BotBindingRecord | null;
}> {
  const [core, chatState] = await Promise.all([
    chatStore.readCore(),
    chatStore.read(),
  ]);
  const bossCatId = chatState.bossCatId;
  const bossCatActorId = bossCatId ? createCatActorId(bossCatId) : null;
  const activeTelegramBindings = core.botBindings.filter((binding) =>
    binding.platform === 'telegram'
    && binding.status === 'active',
  );
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

function validateTelegramWebhookSecret(
  request: IncomingMessage,
  expectedSecret: string | null,
): void {
  if (
    expectedSecret
    && request.headers['x-telegram-bot-api-secret-token'] !== expectedSecret
  ) {
    throw new TelegramWebhookRequestError(
      401,
      'invalid_telegram_webhook_secret',
      'Telegram webhook secret token is invalid.',
    );
  }
}

export async function handleTelegramStatus(
  response: ServerResponse,
  dependencies: TelegramQueryDependencies,
): Promise<void> {
  const context = await readTelegramContext(dependencies.chatStore);
  sendJson(response, 200, {
    telegram: dependencies.telegramRelay.getStatus(context),
  });
}

export async function handleTelegramDiagnostics(
  response: ServerResponse,
  dependencies: TelegramQueryDependencies,
): Promise<void> {
  const context = await readTelegramContext(dependencies.chatStore);
  sendJson(response, 200, {
    telegram: dependencies.telegramRelay.getDiagnostics(context),
  });
}

export async function handleTelegramWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: TelegramWebhookDependencies,
  selectedBindingId?: string,
): Promise<void> {
  try {
    const ingressConfig = dependencies.telegramRelay.getIngressConfig();
    const update = await readTelegramWebhookBody(request, ingressConfig.maxBodyBytes);
    const context = await readTelegramContext(dependencies.chatStore, selectedBindingId);
    if (selectedBindingId && !context.selectedBotBinding) {
      sendRestError(
        response,
        404,
        'telegram_binding_not_found',
        `Telegram bot binding not found: ${selectedBindingId}`,
      );
      return;
    }
    validateTelegramWebhookSecret(
      request,
      context.selectedBotBinding?.webhookSecret
      ?? context.defaultBotBinding?.webhookSecret
      ?? ingressConfig.secretToken,
    );
    let receipt = dependencies.telegramRelay.receiveUpdate({ update, context });
    if (receipt.status === 'accepted') {
      receipt = (await bridgeTelegramWebhookToRoom({
        update,
        receipt,
        context,
        chatStore: dependencies.chatStore,
        runtimeClient: dependencies.runtimeClient,
        telegramRelay: dependencies.telegramRelay,
        now: dependencies.now,
      })).receipt;
    }
    sendJson(response, 202, { receipt });
  } catch (error) {
    if (error instanceof TelegramWebhookRequestError) {
      sendRestError(response, error.statusCode, error.code, error.message);
      return;
    }
    if (error instanceof TelegramWebhookBridgeError) {
      sendRestError(response, 500, error.code, error.message);
      return;
    }

    sendRestError(
      response,
      500,
      'telegram_webhook_processing_failed',
      error instanceof Error ? error.message : 'Telegram webhook processing failed',
    );
  }
}

interface TelegramPollingQueryDependencies {
  pollingSupervisor: TelegramPollingSupervisor;
}

interface TelegramPollingReconnectDependencies {
  bindingId: string;
  chatStore: ChatStore;
  telegramRelay: TelegramRelay;
  runtimeClient: RuntimeClient;
  pollingSupervisor: TelegramPollingSupervisor;
  now?: () => Date;
}

export function handleTelegramPollingStatus(
  response: ServerResponse,
  dependencies: TelegramPollingQueryDependencies,
): void {
  sendJson(response, 200, {
    polling: {
      statuses: dependencies.pollingSupervisor.getAllPollingStatuses(),
    },
  });
}

export async function handleTelegramPollingReconnect(
  response: ServerResponse,
  dependencies: TelegramPollingReconnectDependencies,
): Promise<void> {
  try {
    const core = await dependencies.chatStore.readCore();
    const binding = core.botBindings.find((b) => b.id === dependencies.bindingId);
    if (!binding) {
      sendRestError(response, 404, 'binding_not_found', 'Bot binding not found');
      return;
    }
    if (!binding.botToken) {
      sendRestError(response, 400, 'token_required', 'Bot token is required for polling');
      return;
    }
    if (binding.inboundMode !== 'polling') {
      sendRestError(response, 400, 'not_polling_mode', 'Binding is not in polling mode');
      return;
    }

    const context = await readTelegramContext(dependencies.chatStore);
    await dependencies.pollingSupervisor.reconnect({
      bindingId: dependencies.bindingId,
      botToken: binding.botToken,
      context,
      chatStore: dependencies.chatStore,
      runtimeClient: dependencies.runtimeClient,
      telegramRelay: dependencies.telegramRelay,
    });

    const status = dependencies.pollingSupervisor.getPollingStatus(dependencies.bindingId);
    sendJson(response, 200, { polling: status });
  } catch (error) {
    sendRestError(
      response,
      500,
      'polling_reconnect_failed',
      error instanceof Error ? error.message : 'Polling reconnect failed',
    );
  }
}

export async function readTelegramPollingContext(
  chatStore: ChatStore,
): Promise<{
  bindings: Array<{ bindingId: string; botToken: string; inboundMode: 'polling' | 'webhook' }>;
  context: TelegramRelayContext;
}> {
  const context = await readTelegramContext(chatStore);
  const core = await chatStore.readCore();
  const bindings = core.botBindings
    .filter((b) => b.platform === 'telegram' && b.status === 'active' && b.botToken)
    .map((b) => ({
      bindingId: b.id,
      botToken: b.botToken!,
      inboundMode: b.inboundMode ?? 'polling' as const,
    }));

  return { bindings, context };
}
