import { randomUUID } from 'node:crypto';

import {
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
  createCatActorId,
} from '../../../core/actors.js';
import type { BotBindingRecord, CatsCoreState } from '../../../core/types.js';
import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../shared/platformSurfaces.js';
import { resolveEffectiveBotBindingRoomMode } from '../state/botBindings.js';
import { requireCat } from '../state/model/index.js';
import type {
  CreateBotBindingInput,
  UpdateBotBindingInput,
} from './contracts.js';
import {
  handleRestError,
  nowFrom,
  reconcileTelegramTransportAfterBindingMutation,
  type ChatApiRouteContext,
} from './routeSupport.js';

function trimNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function summarizeBinding(
  binding: BotBindingRecord,
  context: Awaited<ReturnType<ChatApiRouteContext['dependencies']['chatStore']['read']>>,
) {
  const cat = context.cats.find((candidate) =>
    createCatActorId(candidate.id) === (binding.catActorId ?? binding.bossCatActorId),
  ) ?? null;

  return {
    id: binding.id,
    platform: binding.platform,
    botName: binding.botName,
    catId: cat?.id ?? null,
    catName: cat?.name ?? null,
    inboundMode: binding.inboundMode,
    roomMode: resolveEffectiveBotBindingRoomMode(binding),
    outboundFanoutEnabled: binding.outboundFanoutEnabled !== false,
    isBossBinding: Boolean(context.bossCatId && cat?.id === context.bossCatId),
    status: binding.status,
    updatedAt: binding.updatedAt,
    webhookPath: `/api/transports/telegram/webhook/${binding.id}`,
    hasBotToken: Boolean(binding.botToken),
    hasWebhookSecret: Boolean(binding.webhookSecret),
  };
}

function requireBindableCat(
  chat: Awaited<ReturnType<ChatApiRouteContext['dependencies']['chatStore']['read']>>,
  catId: string,
) {
  const cat = requireCat(chat, catId);
  if (cat.status !== 'active') {
    throw new Error(`Cat is not active: ${catId}`);
  }
  if (!hasPlatformSurface(cat.products, 'chat', { fallback: defaultCatProducts() })) {
    throw new Error(`Cat is not available in Cats Chat: ${catId}`);
  }
  return cat;
}

function createBindingRecord(
  chat: Awaited<ReturnType<ChatApiRouteContext['dependencies']['chatStore']['read']>>,
  input: CreateBotBindingInput,
  nowIso: string,
): BotBindingRecord {
  const cat = requireBindableCat(chat, input.catId);
  const catActorId = createCatActorId(cat.id);
  const isBossBinding = chat.bossCatId === cat.id;

  const inboundMode = input.inboundMode === 'webhook' ? 'webhook' : 'polling';

  return {
    id: randomUUID(),
    platform: input.platform,
    botName: input.botName.trim(),
    orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    catActorId,
    bossCatActorId: isBossBinding ? catActorId : null,
    botToken: trimNullableString(input.botToken),
    webhookSecret: trimNullableString(input.webhookSecret),
    inboundMode,
    roomMode: input.roomMode === 'boss_chat' ? 'direct_cat_chat' : input.roomMode ?? 'direct_cat_chat',
    status: 'active',
    outboundFanoutEnabled: input.outboundFanoutEnabled !== false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function updateCoreBindings(
  core: CatsCoreState,
  update: (bindings: BotBindingRecord[]) => BotBindingRecord[],
  nowIso: string,
): CatsCoreState {
  return {
    ...core,
    updatedAt: nowIso,
    botBindings: update(core.botBindings.map((binding) => structuredClone(binding))),
  };
}

async function handleListBotBindings(context: ChatApiRouteContext): Promise<void> {
  const [chat, core] = await Promise.all([
    context.dependencies.chatStore.read(),
    context.dependencies.chatStore.readCore(),
  ]);

  sendJson(context.response, 200, {
    botBindings: core.botBindings.map((binding) => summarizeBinding(binding, chat)),
  });
}

function validateTokenUniqueness(
  botToken: string | null | undefined,
  existingBindings: BotBindingRecord[],
  excludeBindingId?: string,
): void {
  if (!botToken || typeof botToken !== 'string') {
    return;
  }
  const trimmed = botToken.trim();
  if (!trimmed) {
    return;
  }
  const duplicate = existingBindings.find((binding) =>
    binding.id !== excludeBindingId
    && binding.botToken
    && binding.botToken.trim() === trimmed,
  );
  if (duplicate) {
    throw new Error('Bot token is already used by another binding');
  }
}

async function handleCreateBotBinding(context: ChatApiRouteContext): Promise<void> {
  const body = await readJsonBody<CreateBotBindingInput>(context.request);
  const nowIso = nowFrom(context.dependencies).toISOString();
  const [chat, core] = await Promise.all([
    context.dependencies.chatStore.read(),
    context.dependencies.chatStore.readCore(),
  ]);

  validateTokenUniqueness(body.botToken, core.botBindings);
  const binding = createBindingRecord(chat, body, nowIso);
  const nextCore = updateCoreBindings(core, (bindings) => [...bindings, binding], nowIso);
  const persisted = await context.dependencies.chatStore.writeCore(nextCore);

  sendJson(context.response, 201, {
    botBinding: summarizeBinding(
      persisted.botBindings.find((candidate) => candidate.id === binding.id) ?? binding,
      chat,
    ),
  });
  void reconcileTelegramTransportAfterBindingMutation(context);
}

async function handleUpdateBotBinding(
  context: ChatApiRouteContext,
  bindingId: string,
): Promise<void> {
  const body = await readJsonBody<UpdateBotBindingInput>(context.request);
  const nowIso = nowFrom(context.dependencies).toISOString();
  const [chat, core] = await Promise.all([
    context.dependencies.chatStore.read(),
    context.dependencies.chatStore.readCore(),
  ]);
  const existing = core.botBindings.find((binding) => binding.id === bindingId);
  if (!existing) {
    throw new Error(`Bot binding not found: ${bindingId}`);
  }

  if (body.botToken !== undefined) {
    validateTokenUniqueness(body.botToken, core.botBindings, bindingId);
  }

  let catActorId = existing.catActorId ?? existing.bossCatActorId;
  let bossCatActorId = existing.bossCatActorId;
  let roomMode = body.roomMode === 'boss_chat'
    ? 'direct_cat_chat'
    : body.roomMode ?? resolveEffectiveBotBindingRoomMode(existing);

  if (body.catId !== undefined) {
    const cat = requireBindableCat(chat, body.catId);
    catActorId = createCatActorId(cat.id);
    bossCatActorId = chat.bossCatId === cat.id ? catActorId : null;
    if (body.roomMode === undefined) {
      roomMode = 'direct_cat_chat';
    }
  }

  const inboundMode = body.inboundMode === 'polling' || body.inboundMode === 'webhook'
    ? body.inboundMode
    : existing.inboundMode;

  const nextCore = updateCoreBindings(core, (bindings) =>
    bindings.map((binding) =>
      binding.id === bindingId
        ? {
            ...binding,
            botName: body.botName?.trim() || binding.botName,
            catActorId,
            bossCatActorId,
            botToken: body.botToken === undefined
              ? binding.botToken
              : trimNullableString(body.botToken),
            webhookSecret: body.webhookSecret === undefined
              ? binding.webhookSecret
              : trimNullableString(body.webhookSecret),
            inboundMode,
            roomMode,
            status: body.status ?? binding.status,
            outboundFanoutEnabled: body.outboundFanoutEnabled === undefined
              ? binding.outboundFanoutEnabled
              : body.outboundFanoutEnabled,
            updatedAt: nowIso,
          }
        : binding,
    ), nowIso);
  const persisted = await context.dependencies.chatStore.writeCore(nextCore);
  const updated = persisted.botBindings.find((binding) => binding.id === bindingId);

  sendJson(context.response, 200, {
    botBinding: summarizeBinding(updated ?? existing, chat),
  });
  void reconcileTelegramTransportAfterBindingMutation(context, {
    staleBotTokens: [existing.botToken],
  });
}

async function handleDeleteBotBinding(
  context: ChatApiRouteContext,
  bindingId: string,
): Promise<void> {
  const nowIso = nowFrom(context.dependencies).toISOString();
  const core = await context.dependencies.chatStore.readCore();
  const existing = core.botBindings.find((binding) => binding.id === bindingId);
  if (!existing) {
    throw new Error(`Bot binding not found: ${bindingId}`);
  }

  const nextCore = updateCoreBindings(
    core,
    (bindings) => bindings.filter((binding) => binding.id !== bindingId),
    nowIso,
  );
  await context.dependencies.chatStore.writeCore(nextCore);
  sendJson(context.response, 200, { deleted: true, bindingId });
  void reconcileTelegramTransportAfterBindingMutation(context, {
    staleBotTokens: [existing.botToken],
  });
}

export async function routeBotBindingApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/bot-bindings') {
    if (context.method === 'GET') {
      await handleListBotBindings(context);
      return true;
    }
    if (context.method === 'POST') {
      try {
        await handleCreateBotBinding(context);
      } catch (error) {
        handleRestError(context, error);
      }
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const bindingMatch = matchRoute(context.url.pathname, /^\/api\/bot-bindings\/([^/]+)$/u);
  if (!bindingMatch) {
    return false;
  }

  const bindingId = bindingMatch[0]!;
  try {
    if (context.method === 'PATCH') {
      await handleUpdateBotBinding(context, bindingId);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleDeleteBotBinding(context, bindingId);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PATCH', 'DELETE']);
    return true;
  } catch (error) {
    handleRestError(context, error);
    return true;
  }
}
