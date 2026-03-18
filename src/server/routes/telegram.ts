import type { IncomingMessage, ServerResponse } from 'node:http';

import { createPalActorId } from '../../core/model.js';
import type { WorkspaceState } from '../../shared/app-shell.js';
import type { BotBindingRecord } from '../../shared/core.js';
import type { WorkspaceStore } from '../../workspace/store.js';
import type { TelegramRelay } from '../../transports/telegram/relay.js';
import type { TelegramWebhookUpdate } from '../../transports/telegram/contracts.js';

interface TelegramRouteDependencies {
  workspaceStore: WorkspaceStore;
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

function resolveBossCatName(workspace: WorkspaceState): string | null {
  if (!workspace.bossCatId) {
    return null;
  }

  return workspace.pals.find((pal) => pal.id === workspace.bossCatId)?.name ?? null;
}

async function readTelegramContext(
  workspaceStore: WorkspaceStore,
): Promise<{
  bossCatId: string | null;
  bossCatName: string | null;
  bossCatActorId: string | null;
  botBinding: BotBindingRecord | null;
}> {
  const core = await workspaceStore.readCore();
  const bossCatId = core.workspace.bossCatId;
  const bossCatActorId = bossCatId ? createPalActorId(bossCatId) : null;

  return {
    bossCatId,
    bossCatName: resolveBossCatName(core.workspace),
    bossCatActorId,
    botBinding: bossCatActorId
      ? core.botBindings.find((binding) =>
        binding.platform === 'telegram'
        && binding.status === 'active'
        && binding.bossCatActorId === bossCatActorId,
      ) ?? null
      : null,
  };
}

export async function handleTelegramStatus(
  response: ServerResponse,
  dependencies: TelegramRouteDependencies,
): Promise<void> {
  const context = await readTelegramContext(dependencies.workspaceStore);
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
    const context = await readTelegramContext(dependencies.workspaceStore);
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
