import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotBindingRecord } from '../src/core/types.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import { MemoryCoreStore } from '../src/core/store.js';
import {
  SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL,
  createInMemoryToolEvidenceSink,
  createSupervisedToolRegistry,
  createSupervisedTransportDeliveryTools,
  createToolBoundary,
  type SupervisedTransportDeliveryApprovalPolicy,
  type SupervisedTelegramTextDeliveryInput,
  type SupervisedTelegramTextDeliveryResult,
  type SupervisedTransportTarget,
} from '../src/platform/supervision/index.js';
import type { ToolSurfaceGrant } from '../src/platform/supervision/toolRegistry.js';
import type { TelegramDeliveryClient } from '../src/platform/transports/telegram/delivery.js';
import type {
  TelegramDeliveryRequest,
  TelegramRelayContext,
} from '../src/platform/transports/telegram/contracts.js';
import {
  createTelegramRelay,
  type TelegramRelay,
} from '../src/platform/transports/telegram/relay/index.js';

const NOW = '2026-04-29T00:00:00.000Z';

interface RecordedTelegramDelivery extends TelegramDeliveryRequest {
  chatId: string;
}

function createTelegramBinding(id = 'telegram-binding-1'): BotBindingRecord {
  return {
    id,
    platform: 'telegram',
    botName: 'Morning Cat',
    orchestratorActorId: 'actor-orchestrator',
    catActorId: 'actor-cat-morning',
    bossCatActorId: 'actor-cat-boss',
    botToken: 'redacted-token',
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: 'direct_cat_chat',
    status: 'active',
    outboundFanoutEnabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createTelegramContext(binding: BotBindingRecord): TelegramRelayContext {
  return {
    bossCatId: 'boss-cat',
    bossCatName: 'Boss Cat',
    bossCatActorId: binding.bossCatActorId,
    botBindings: [binding],
    defaultBotBinding: binding,
    selectedBotBinding: binding,
  };
}

function createRecordingDeliveryClient(
  deliveries: RecordedTelegramDelivery[],
): TelegramDeliveryClient {
  return {
    async deliver(request) {
      deliveries.push(request);
      return {
        ok: true,
        chatId: request.chatId,
        messageId: String(9000 + deliveries.length),
        description: null,
      };
    },
    async setMyCommands() {
      return { ok: true, description: null };
    },
    async deleteMyCommands() {
      return { ok: true, description: null };
    },
    async setChatMenuButton() {
      return { ok: true, description: null };
    },
  };
}

function seedTelegramConversation(relay: TelegramRelay, binding: BotBindingRecord): void {
  const receipt = relay.receiveUpdate({
    context: createTelegramContext(binding),
    update: {
      update_id: 1,
      message: {
        message_id: 10,
        text: 'hello',
        date: 1,
        chat: {
          id: '4242',
          type: 'private',
        },
        from: {
          id: '100',
          is_bot: false,
          first_name: 'Owner',
        },
      },
    },
  });

  assert.equal(receipt.status, 'accepted');
  assert.equal(receipt.bindingId, binding.id);
}

async function invokeTelegramDeliveryTool(input: {
  binding: BotBindingRecord;
  relay: TelegramRelay;
  allowedTargets?: SupervisedTransportTarget[];
  approval?: SupervisedTransportDeliveryApprovalPolicy;
  grant?: ToolSurfaceGrant;
  toolInput?: Partial<SupervisedTelegramTextDeliveryInput>;
}) {
  const coreStore = new MemoryCoreStore({
    ...createDefaultCoreState(),
    botBindings: [input.binding],
  });
  const tools = createSupervisedTransportDeliveryTools({
    coreStore,
    telegramRelay: input.relay,
    allowedTransportTargets: input.allowedTargets,
    approval: input.approval,
  });
  const registry = createSupervisedToolRegistry();
  tools.register(registry);
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => NOW,
  });

  const result = await boundary.invoke<
    SupervisedTelegramTextDeliveryInput,
    SupervisedTelegramTextDeliveryResult
  >({
    toolName: SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL,
    input: {
      bindingId: input.binding.id,
      text: 'Good morning from Cats.',
      ...input.toolInput,
    },
    actionId: 'action-telegram-send',
    runId: 'run-scheduled-1',
    actorRef: 'actor-cat-morning',
    grant: input.grant ?? {
      parentToolScope: 'broad_write',
      policyToolScope: 'broad_write',
    },
    execute: tools.executors[SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL],
  });

  return {
    result,
    evidence: evidenceSink.read(),
  };
}

test('supervised Telegram text delivery uses the declared binding identity', async () => {
  const binding = createTelegramBinding();
  const deliveries: RecordedTelegramDelivery[] = [];
  const relay = createTelegramRelay({
    now: () => new Date(NOW),
    deliveryClient: createRecordingDeliveryClient(deliveries),
  });
  seedTelegramConversation(relay, binding);

  const { result, evidence } = await invokeTelegramDeliveryTool({
    binding,
    relay,
    allowedTargets: [{ platform: 'telegram', bindingId: binding.id }],
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.result.bindingId, binding.id);
  assert.equal(result.result.chatId, '4242');
  assert.equal(result.result.conversationId, `telegram:${binding.id}:4242`);
  assert.deepEqual(result.result.messageIds, ['9001']);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].chatId, '4242');
  assert.equal(deliveries[0].text, 'Good morning from Cats.');

  const diagnostics = relay.getDiagnostics(createTelegramContext(binding));
  assert.equal(diagnostics.delivery.sentCount, 1);
  assert.equal(diagnostics.delivery.lastReceipt?.bindingId, binding.id);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].toolName, SUPERVISED_TELEGRAM_TEXT_DELIVERY_TOOL);
  assert.equal(evidence[0].status, 'applied');
  assert.equal(evidence[0].toolManifest?.sideEffect, 'external_visible');
});

test('supervised Telegram text delivery rejects undeclared bindings', async () => {
  const binding = createTelegramBinding();
  const deliveries: RecordedTelegramDelivery[] = [];
  const relay = createTelegramRelay({
    now: () => new Date(NOW),
    deliveryClient: createRecordingDeliveryClient(deliveries),
  });
  seedTelegramConversation(relay, binding);

  const { result, evidence } = await invokeTelegramDeliveryTool({
    binding,
    relay,
    allowedTargets: [{ platform: 'telegram', bindingId: 'telegram-binding-other' }],
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_NOT_AUTHORIZED');
  assert.equal(deliveries.length, 0);
  assert.equal(evidence[0].status, 'rejected');
});

test('supervised Telegram text delivery pauses when policy requires approval', async () => {
  const binding = createTelegramBinding();
  const deliveries: RecordedTelegramDelivery[] = [];
  const relay = createTelegramRelay({
    now: () => new Date(NOW),
    deliveryClient: createRecordingDeliveryClient(deliveries),
  });
  seedTelegramConversation(relay, binding);

  const { result, evidence } = await invokeTelegramDeliveryTool({
    binding,
    relay,
    allowedTargets: [{ platform: 'telegram', bindingId: binding.id }],
    approval: {
      required: true,
      requestId: 'approval-telegram-delivery-1',
    },
  });

  assert.equal(result.status, 'pending_approval');
  assert.equal(result.requestId, 'approval-telegram-delivery-1');
  assert.equal(deliveries.length, 0);
  assert.equal(evidence[0].status, 'pending_approval');
  assert.equal(evidence[0].approvalRequestId, 'approval-telegram-delivery-1');
});

test('supervised Telegram text delivery requires broad-write tool scope', async () => {
  const binding = createTelegramBinding();
  const deliveries: RecordedTelegramDelivery[] = [];
  const relay = createTelegramRelay({
    now: () => new Date(NOW),
    deliveryClient: createRecordingDeliveryClient(deliveries),
  });
  seedTelegramConversation(relay, binding);

  const { result } = await invokeTelegramDeliveryTool({
    binding,
    relay,
    allowedTargets: [{ platform: 'telegram', bindingId: binding.id }],
    grant: {
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    },
  });

  assert.equal(result.status, 'rejected');
  assert.equal(result.error.code, 'E_TOOL_SCOPE_DENIED');
  assert.equal(deliveries.length, 0);
});
