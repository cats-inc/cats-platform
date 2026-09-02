/**
 * Binding rotation and removal (SPEC-114 FR-43, PLAN-105 Phase 5).
 *
 * Work outlives the binding it arrived on. An operator can rotate a bot token
 * or delete a binding entirely while a run is mid-flight, and the tempting
 * behaviour — deliver to whichever binding is available now — is exactly the
 * one FR-43 forbids: the result would land in a stranger's chat.
 *
 * So the rules under test are: delivery targets the *recorded* binding or
 * fails; a failure caused by a missing binding is named rather than retried
 * forever; and Desktop says why nothing is arriving.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import type { BotBindingRecord } from '../src/core/types.js';
import { createTelegramRelay } from '../src/platform/transports/telegram/relay/index.js';
import type {
  TelegramDeliveryClient,
  TelegramDeliveryClientResult,
} from '../src/platform/transports/telegram/delivery.js';
import type { TelegramRelayContext } from '../src/platform/transports/telegram/contracts.js';
import { createTransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import type { TransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import { buildWorkGoldenPathDetailProjectionForTask } from '../src/products/work/api/goldenPathProjection.js';
import {
  createWorkGoldenPathService,
  type WorkGoldenPathService,
} from '../src/products/work/state/workGoldenPathService.js';
import { createTelegramGoldenPathOutboxSender } from '../src/products/work/state/workGoldenPathTelegramPort.js';
import { createWorkGoldenPathRunner } from '../src/products/work/state/workGoldenPathRunner.js';

const BINDING_ID = 'binding-rotation-test';
const OTHER_BINDING_ID = 'binding-someone-else';
const CHAT_REF = '5150';
const CRITERION = 'CHANGELOG.md contains a 0.1.21 section';
const COMMIT = {
  commitId: 'a1b2c3d4e5f6',
  changeSummary: 'Added the entry',
  validation: { command: 'runtime repo status: worktree clean at the new HEAD', passed: true },
};

const READINESS = evaluateTransportWorkReadiness({
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude:opus',
  capabilityProfileResolved: true,
  workspacePath: '/tmp/rotation-workspace',
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'commit_only',
  deliveryGates: [],
  backgroundServiceAvailable: true,
});

function botBinding(overrides: Partial<BotBindingRecord> = {}): BotBindingRecord {
  return {
    id: BINDING_ID,
    platform: 'telegram',
    botName: 'rotation_bot',
    orchestratorActorId: 'actor-orchestrator',
    catActorId: 'actor-cat',
    bossCatActorId: 'actor-cat',
    botToken: 'token-v1',
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: 'direct_message',
    status: 'active',
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...overrides,
  };
}

interface SentMessage {
  chatId: string;
  token: string;
}

interface Harness {
  coreStore: MemoryCoreStore;
  outbox: TransportWorkOutbox;
  service: WorkGoldenPathService;
  sent: SentMessage[];
  /** Mutable so a test can rotate or remove the binding mid-flight. */
  bindings: BotBindingRecord[];
}

/**
 * Builds the real relay over a fake Telegram API, so binding resolution is the
 * production code path rather than a stub's opinion of it.
 */
function createHarness(): Harness {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const sent: SentMessage[] = [];
  const bindings: BotBindingRecord[] = [botBinding()];

  const relay = createTelegramRelay({
    resolveDeliveryClient: (binding) => {
      if (binding === null) {
        return null;
      }
      const token = binding.botToken ?? '';
      return {
        deliver: async (request): Promise<TelegramDeliveryClientResult> => {
          sent.push({ chatId: request.chatId, token });
          return { ok: true, chatId: request.chatId, messageId: `tg-${sent.length}` };
        },
        setMyCommands: async () => ({ ok: true }),
        deleteMyCommands: async () => ({ ok: true }),
        setChatMenuButton: async () => ({ ok: true }),
      } satisfies TelegramDeliveryClient;
    },
  });

  const resolveRelayContext = (): TelegramRelayContext => {
    const active = bindings.find((binding) => binding.status === 'active') ?? null;
    return {
      bossCatId: 'cat-1',
      bossCatName: 'Rotation Cat',
      bossCatActorId: 'actor-cat',
      botBindings: bindings,
      defaultBotBinding: active,
      selectedBotBinding: active,
    };
  };

  const outbox = createTransportWorkOutbox({
    send: createTelegramGoldenPathOutboxSender({
      telegramRelay: relay,
      resolveRelayContext,
    }),
  });

  return {
    coreStore,
    outbox,
    sent,
    bindings,
    service: createWorkGoldenPathService({ coreStore, outbox }),
  };
}

async function admit(harness: Harness): Promise<{ workItemId: string; runId: string; taskId: string }> {
  await harness.coreStore.updateCore((core) => ({ ...core, botBindings: [...harness.bindings] }));
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: 'conversation-rotation',
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: 'tg-owner',
    externalConversationRef: CHAT_REF,
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/rotation-workspace',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    deliveryGates: [],
    openQuestion: null,
    readiness: READINESS,
    locale: 'en',
  });
  const startWork = received.offers.find((offer) => offer.action === 'start_work')!;
  const authorized = await harness.service.authorize({
    callbackData: startWork.callbackData,
    bindingId: BINDING_ID,
    externalUserRef: 'tg-owner',
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });
  return {
    workItemId: received.workItemId!,
    runId: authorized.admission!.runId!,
    taskId: authorized.admission!.taskId!,
  };
}

function runnerFor(harness: Harness) {
  return createWorkGoldenPathRunner({
    coreStore: harness.coreStore,
    service: harness.service,
    maxSteps: 1,
    executeStep: async () => ({
      status: 'claims_complete',
      summary: 'Committed the change.',
      satisfiedCriteria: [CRITERION],
      artifact: null,
      commit: COMMIT,
      blockedReason: null,
    }),
  });
}

async function project(harness: Harness, taskId: string) {
  return buildWorkGoldenPathDetailProjectionForTask({
    core: await harness.coreStore.readCore(),
    taskId,
    deliveryReader: harness.outbox,
  });
}

// --- Rotation ------------------------------------------------------------------

test('a rotated bot token still delivers to the recorded binding', async () => {
  const harness = createHarness();
  const { runId, workItemId } = await admit(harness);

  // The operator rotates the token while the run is in flight.
  harness.bindings[0] = botBinding({ botToken: 'token-v2' });

  const outcome = await runnerFor(harness).drive({ runId });

  assert.equal(outcome.status, 'delivered');
  const last = harness.sent[harness.sent.length - 1];
  assert.equal(last.token, 'token-v2', 'the current token is used, not the one from intake');
  assert.equal(last.chatId, CHAT_REF, 'and the destination is still the recorded chat');
  assert.equal((await harness.service.describeStage(workItemId))?.stage, 'delivered');
});

test('delivery never falls back to a different binding (FR-43)', async () => {
  const harness = createHarness();
  const { runId, taskId } = await admit(harness);

  // The original binding is removed and a different one is now the only active
  // binding. Delivering to it would put the owner's result in another chat.
  harness.bindings.length = 0;
  harness.bindings.push(botBinding({
    id: OTHER_BINDING_ID,
    botName: 'someone_else_bot',
    botToken: 'token-other',
  }));
  await harness.coreStore.updateCore((core) => ({ ...core, botBindings: [...harness.bindings] }));

  const before = harness.sent.length;
  const outcome = await runnerFor(harness).drive({ runId });

  assert.notEqual(outcome.status, 'delivered');
  assert.equal(
    harness.sent.length,
    before,
    'nothing was sent anywhere once the recorded binding was gone',
  );

  const view = await project(harness, taskId);
  assert.equal(view?.source.bindingId, BINDING_ID, 'the recorded source is unchanged');
  assert.equal(view?.source.present, false);
});

// --- Removal -------------------------------------------------------------------

test('a removed binding fails the delivery with a named, non-ambiguous reason', async () => {
  const harness = createHarness();
  const { runId, taskId, workItemId } = await admit(harness);

  harness.bindings.length = 0;
  await harness.coreStore.updateCore((core) => ({ ...core, botBindings: [] }));

  await runnerFor(harness).drive({ runId });

  const resultRow = harness.outbox
    .list(workItemId)
    .find((row) => row.purpose === 'result');
  assert.equal(resultRow?.state, 'failed', 'a missing binding is a definite non-delivery');
  assert.equal(
    resultRow?.lastErrorCode,
    'binding_unavailable',
    'and it is named, not folded into a generic transport error',
  );

  const view = await project(harness, taskId);
  assert.notEqual(view?.stage, 'delivered', 'the work is never projected as delivered');
  assert.equal(view?.delivery.receipt, null);
});

test('Desktop explains that the source binding is gone', async () => {
  const harness = createHarness();
  const { runId, taskId } = await admit(harness);

  harness.bindings.length = 0;
  await harness.coreStore.updateCore((core) => ({ ...core, botBindings: [] }));
  await runnerFor(harness).drive({ runId });

  const view = await project(harness, taskId);

  assert.equal(view?.source.present, false);
  assert.ok(
    view?.blockers.some((blocker) => blocker.includes(BINDING_ID)),
    'the blocker names the binding so the owner knows what to restore',
  );
  assert.ok(
    view?.recoveryActions.includes('retry_delivery'),
    'retry stays available for after the binding is restored',
  );
});

test('a disabled binding counts as gone', async () => {
  const harness = createHarness();
  const { taskId } = await admit(harness);

  await harness.coreStore.updateCore((core) => ({
    ...core,
    botBindings: core.botBindings.map((binding) => ({ ...binding, status: 'disabled' as const })),
  }));

  const view = await project(harness, taskId);
  assert.equal(view?.source.present, false);
});

test('restoring the binding lets the retry deliver to the original chat', async () => {
  const harness = createHarness();
  const { runId, taskId, workItemId } = await admit(harness);

  harness.bindings.length = 0;
  await harness.coreStore.updateCore((core) => ({ ...core, botBindings: [] }));
  await runnerFor(harness).drive({ runId });
  assert.equal(
    harness.outbox.list(workItemId).find((row) => row.purpose === 'result')?.state,
    'failed',
  );

  // The operator restores the binding, keeping its id.
  harness.bindings.push(botBinding({ botToken: 'token-v3' }));
  await harness.coreStore.updateCore((core) => ({ ...core, botBindings: [...harness.bindings] }));

  const resultRow = harness.outbox
    .list(workItemId)
    .find((row) => row.purpose === 'result')!;
  await harness.outbox.flush(resultRow.idempotencyKey);

  const last = harness.sent[harness.sent.length - 1];
  assert.equal(last.chatId, CHAT_REF, 'the retry still targets the originally recorded chat');
  const view = await project(harness, taskId);
  assert.equal(view?.source.present, true);
  assert.equal(view?.stage, 'delivered');
  assert.equal(
    harness.outbox.list(workItemId).filter((row) => row.purpose === 'result').length,
    1,
    'one result row survived the outage',
  );
});

// --- Callback identity -----------------------------------------------------------

test('a callback replayed on the replacement binding fails closed', async () => {
  const harness = createHarness();
  await harness.coreStore.updateCore((core) => ({ ...core, botBindings: [...harness.bindings] }));
  const core = await harness.coreStore.readCore();
  const received = await harness.service.receiveRequest({
    bindingId: BINDING_ID,
    conversationId: 'conversation-rotation',
    ownerActorId: core.ownerProfile.actorId,
    externalUserRef: 'tg-owner',
    externalConversationRef: CHAT_REF,
    externalUpdateRef: 'tg-update-1',
    externalMessageRef: 'tg-message-1',
    goal: 'Add a changelog entry for 0.1.21',
    targetLabel: 'cats-platform',
    projectId: null,
    workspacePath: '/tmp/rotation-workspace',
    acceptanceCriteria: [CRITERION],
    deliveryMode: 'commit_only',
    deliveryGates: [],
    openQuestion: null,
    readiness: READINESS,
    locale: 'en',
  });
  const startWork = received.offers.find((offer) => offer.action === 'start_work')!;

  const rejected = await harness.service.authorize({
    callbackData: startWork.callbackData,
    bindingId: OTHER_BINDING_ID,
    externalUserRef: 'tg-owner',
    ownerEventRef: 'tg-callback-1',
    readiness: READINESS,
  });

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejection, 'cross_binding');
  assert.equal((await harness.coreStore.readCore()).runs.length, 0);
});
