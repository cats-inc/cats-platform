import type { IncomingMessage, ServerResponse } from 'node:http';

import { createCatActorId } from '../../core/actors.js';
import type { BotBindingRecord } from '../../core/types.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import type { CatsMemoryService } from '../../platform/memory/index.js';
import {
  bridgeTelegramWebhookToRoom,
  type TelegramRoomBridge,
  TelegramWebhookBridgeError,
} from '../../platform/transports/telegram/bridge.js';
import type { TelegramRelayContext, TelegramWebhookUpdate } from '../../platform/transports/telegram/contracts.js';
import type { TelegramPollingSupervisor } from '../../platform/transports/telegram/polling.js';
import type { TelegramRelay } from '../../platform/transports/telegram/relay/index.js';
import { defaultCatProducts, hasPlatformSurface } from '../../shared/platformSurfaces.js';
import type { ChatState } from '../../products/chat/api/contracts.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import { normalizeEffectiveBotBinding } from '../../products/chat/state/botBindings.js';
import type { ChatEventHub } from '../../products/chat/api/chatEventHub.js';
import { updateCatSkillProfile } from '../../products/chat/state/model/index.js';
import {
  publishRoomMutation,
  publishTransportIngress,
} from '../../products/chat/api/transportEventPublisher.js';
import {
  createTelegramCommandRouter,
  type TelegramInteractionMode,
} from '../../platform/transports/telegram/commandRouter.js';
import { createDefaultCommands } from '../../platform/transports/telegram/commands/index.js';

const commandRouter = createTelegramCommandRouter();
commandRouter.registerAll(createDefaultCommands());

interface TelegramQueryDependencies {
  chatStore: ChatStore;
  telegramRelay: TelegramRelay;
}

interface TelegramWebhookDependencies extends TelegramQueryDependencies {
  telegramRoomBridge: TelegramRoomBridge<ChatState>;
  memoryService: CatsMemoryService;
  runtimeClient: RuntimeClient;
  eventHub?: ChatEventHub;
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

function findBindingChatCat(chatState: ChatState, binding: BotBindingRecord) {
  return chatState.cats.find((cat) =>
    createCatActorId(cat.id) === (binding.catActorId ?? binding.bossCatActorId),
  ) ?? null;
}

function resolveTelegramInteractionMode(
  skillProfile: string | null | undefined,
): TelegramInteractionMode {
  return skillProfile === 'companion' ? 'companion' : 'agent';
}

function resolveSkillProfileForInteractionMode(
  mode: TelegramInteractionMode,
): string {
  return mode === 'companion' ? 'companion' : 'chat-default';
}

async function setTelegramInteractionMode(
  chatStore: ChatStore,
  catId: string,
  mode: TelegramInteractionMode,
): Promise<TelegramInteractionMode> {
  const state = await chatStore.read();
  const nextState = updateCatSkillProfile(
    state,
    catId,
    resolveSkillProfileForInteractionMode(mode),
  );
  const persisted = await chatStore.write(nextState);
  const cat = persisted.cats.find((candidate) => candidate.id === catId);
  return resolveTelegramInteractionMode(cat?.skillProfile ?? null);
}

function isActiveChatBinding(chatState: ChatState, binding: BotBindingRecord): boolean {
  if (binding.status !== 'active') {
    return false;
  }
  const cat = findBindingChatCat(chatState, binding);
  return Boolean(
    cat
    && cat.status === 'active'
    && hasPlatformSurface(cat.products, 'chat', { fallback: defaultCatProducts() }),
  );
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
  const activeTelegramBindings = core.botBindings
    .filter((binding) =>
      binding.platform === 'telegram'
      && isActiveChatBinding(chatState, binding),
    )
    .map((binding) => normalizeEffectiveBotBinding(binding));
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

export async function readTelegramActiveBindings(
  chatStore: ChatStore,
): Promise<BotBindingRecord[]> {
  return (await readTelegramContext(chatStore)).botBindings;
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
      // Check for slash commands before bridging to room
      const messageText = update.message?.text?.trim() ?? '';
      if (commandRouter.isCommand(messageText)) {
        const binding = context.selectedBotBinding ?? context.defaultBotBinding;
        const chatState = await dependencies.chatStore.read();
        const cat = binding ? findBindingChatCat(chatState, binding) : null;
        const commandResult = await commandRouter.dispatch(messageText, {
          chatId: String(update.message?.chat?.id ?? ''),
          senderName: update.message?.from?.first_name ?? 'User',
          botName: binding?.botName ?? 'CatsBot',
          catName: cat?.name ?? null,
          catId: cat?.id ?? null,
          currentMode: cat ? resolveTelegramInteractionMode(cat.skillProfile) : null,
          inboundMode: binding?.inboundMode ?? null,
          setMode: cat?.id
            ? async (mode) => setTelegramInteractionMode(
              dependencies.chatStore,
              cat.id,
              mode,
            )
            : undefined,
        });
        if (commandResult?.handled) {
          await dependencies.telegramRelay.deliver({
            request: {
              operation: update.message?.message_id ? 'reply' : 'send',
              conversationId: receipt.mappedConversationId,
              chatId: receipt.chatId,
              replyToMessageId: update.message?.message_id
                ? String(update.message.message_id)
                : undefined,
              text: commandResult.replyText,
              disableLinkPreview: true,
            },
            context,
          });
          sendJson(response, 202, { receipt: { ...receipt, commandHandled: true } });
          return;
        }
      }
      const bridgeResult = await bridgeTelegramWebhookToRoom({
        update,
        receipt,
        context,
        roomBridge: dependencies.telegramRoomBridge,
        memoryService: dependencies.memoryService,
        runtimeClient: dependencies.runtimeClient,
        telegramRelay: dependencies.telegramRelay,
        now: dependencies.now,
      });
      receipt = bridgeResult.receipt;
      const roomId = receipt.mappedConversationId ?? null;
      if (roomId) {
        publishTransportIngress(dependencies.eventHub, roomId);
        publishRoomMutation(dependencies.eventHub, roomId, 'message_added');
      }
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
  telegramRoomBridge: TelegramRoomBridge<ChatState>;
  memoryService: CatsMemoryService;
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
      refreshContext: async () => (
        await readTelegramPollingContext(dependencies.chatStore)
      ).context,
      roomBridge: dependencies.telegramRoomBridge,
      memoryService: dependencies.memoryService,
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
  const bindings = context.botBindings
    .filter((binding) => binding.botToken)
    .map((binding) => ({
      bindingId: binding.id,
      botToken: binding.botToken!,
      inboundMode: binding.inboundMode ?? 'polling' as const,
    }));

  return { bindings, context };
}
