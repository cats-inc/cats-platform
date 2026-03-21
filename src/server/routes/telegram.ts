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

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf-8').trim();
  if (!rawBody) {
    throw new Error('Request body is required');
  }

  return JSON.parse(rawBody) as T;
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

export async function handleTelegramWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: TelegramRouteDependencies,
): Promise<void> {
  try {
    const update = await readJsonBody<TelegramWebhookUpdate>(request);
    const context = await readTelegramContext(dependencies.chatStore);
    const receipt = dependencies.telegramRelay.receiveUpdate({ update, context });
    sendJson(response, 202, { receipt });
  } catch (error) {
    sendRestError(
      response,
      400,
      'invalid_telegram_update',
      error instanceof Error ? error.message : 'Invalid Telegram update',
    );
  }
}

