import type { IncomingMessage, ServerResponse } from 'node:http';

import { createCatActorId } from '../../core/model.js';
import type { BotBindingRecord } from '../../core/types.js';
import type { TelegramWebhookUpdate } from '../../platform/transports/telegram/contracts.js';
import type { TelegramRelay } from '../../platform/transports/telegram/relay.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import type { ChatState } from '../../shared/app-shell.js';

interface TelegramRouteDependencies {
  chatStore: ChatStore;
  telegramRelay: TelegramRelay;
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
  dependencies: TelegramRouteDependencies,
): Promise<TelegramWebhookUpdate> {
  const ingressConfig = dependencies.telegramRelay.getIngressConfig();
  if (!isJsonContentType(request.headers['content-type'])) {
    throw new TelegramWebhookRequestError(
      415,
      'telegram_webhook_requires_json',
      'Telegram webhook requests must use application/json.',
    );
  }

  if (
    ingressConfig.secretToken
    && request.headers['x-telegram-bot-api-secret-token'] !== ingressConfig.secretToken
  ) {
    throw new TelegramWebhookRequestError(
      401,
      'invalid_telegram_webhook_secret',
      'Telegram webhook secret token is invalid.',
    );
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    totalBytes += buffer.byteLength;
    if (totalBytes > ingressConfig.maxBodyBytes) {
      throw new TelegramWebhookRequestError(
        413,
        'telegram_webhook_too_large',
        `Telegram webhook body exceeds ${ingressConfig.maxBodyBytes} bytes.`,
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
): Promise<{
  bossCatId: string | null;
  bossCatName: string | null;
  bossCatActorId: string | null;
  botBinding: BotBindingRecord | null;
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
  const botBinding = bossCatActorId
    ? activeTelegramBindings.find((binding) => binding.bossCatActorId === bossCatActorId) ?? null
    : null;

  return {
    bossCatId,
    bossCatName: resolveBossCatName(chatState),
    bossCatActorId,
    botBinding,
  };
}

export async function handleTelegramStatus(
  response: ServerResponse,
  dependencies: TelegramRouteDependencies,
): Promise<void> {
  const context = await readTelegramContext(dependencies.chatStore);
  sendJson(response, 200, {
    telegram: dependencies.telegramRelay.getStatus(context),
  });
}

export async function handleTelegramDiagnostics(
  response: ServerResponse,
  dependencies: TelegramRouteDependencies,
): Promise<void> {
  const context = await readTelegramContext(dependencies.chatStore);
  sendJson(response, 200, {
    telegram: dependencies.telegramRelay.getDiagnostics(context),
  });
}

export async function handleTelegramWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: TelegramRouteDependencies,
): Promise<void> {
  try {
    const update = await readTelegramWebhookBody(request, dependencies);
    const context = await readTelegramContext(dependencies.chatStore);
    const receipt = dependencies.telegramRelay.receiveUpdate({ update, context });
    sendJson(response, 202, { receipt });
  } catch (error) {
    if (error instanceof TelegramWebhookRequestError) {
      sendRestError(response, error.statusCode, error.code, error.message);
      return;
    }

    sendRestError(
      response,
      400,
      'invalid_telegram_update',
      error instanceof Error ? error.message : 'Invalid Telegram update',
    );
  }
}
