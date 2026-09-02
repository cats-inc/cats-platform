/**
 * Deterministic end-to-end golden path (PLAN-105 Phase 6, gate G6's first item).
 *
 * Every other golden-path suite tests one layer against fakes on both sides.
 * This one drives the whole chain in one process: a raw Telegram update enters
 * the real bridge, the real relay writes to a fake Telegram API, admission and
 * execution run against isolated in-memory Core, and the assertions are about
 * what appeared on the wire and what was persisted — not about intermediate
 * function returns.
 *
 * The point is coverage of the *seams*. A layer test cannot catch a message that
 * is never sent because two layers disagree about who sends it, or a button
 * whose callback nothing claims.
 *
 * What is still faked, and cannot be otherwise here: the provider, and the
 * runtime's repo operations. Those are gate G6's real-bot and packaged smokes.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import type { BotBindingRecord } from '../src/core/types.js';
import { bridgeTelegramWebhookToRoom } from '../src/platform/transports/telegram/bridge.js';
import { createTelegramRelay } from '../src/platform/transports/telegram/relay/index.js';
import type {
  TelegramDeliveryClient,
  TelegramDeliveryClientResult,
} from '../src/platform/transports/telegram/delivery.js';
import type {
  TelegramRelayContext,
  TelegramWebhookUpdate,
} from '../src/platform/transports/telegram/contracts.js';
import { createTransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import { createTransportWorkActionTokenStore } from '../src/platform/transports/work-delivery/actionTokens.js';
import {
  createMemoryTransportWorkStateStore,
  type TransportWorkStateStore,
} from '../src/platform/transports/work-delivery/stateStore.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import {
  createTransportWorkTelemetry,
  type TransportWorkTelemetry,
} from '../src/platform/transports/work-delivery/telemetry.js';
import type { RuntimeDeliveryClient } from '../src/platform/runtime/deliveryClient.js';
import { createWorkGoldenPathService } from '../src/products/work/state/workGoldenPathService.js';
import {
  createWorkGoldenPathRunner,
  type WorkGoldenPathStepResult,
} from '../src/products/work/state/workGoldenPathRunner.js';
import { createRuntimeEvidenceCollector } from '../src/products/work/state/workGoldenPathDeliveryEvidence.js';
import {
  createTelegramGoldenPathOutboxSender,
  createTelegramGoldenPathPort,
} from '../src/products/work/state/workGoldenPathTelegramPort.js';
import { buildWorkGoldenPathDetailProjectionForTask } from '../src/products/work/api/goldenPathProjection.js';
import { resumeGoldenPathRuns } from '../src/app/server/goldenPathStartupResume.js';

const BINDING_ID = 'binding-e2e';
const CHAT_ID = '9090';
const OWNER_REF = 'tg-owner-1';
const WORKSPACE = '/tmp/e2e-workspace';
const CRITERION = 'CHANGELOG.md contains a 0.1.21 section';
const HEAD_BEFORE = 'aaaaaaaaaaaa';
const HEAD_AFTER = 'bbbbbbbbbbbb';

const READINESS = evaluateTransportWorkReadiness({
  bindingEnabled: true,
  bindingHealthy: true,
  ownerAuthorized: true,
  boundCatId: 'cat-1',
  executionTargetId: 'claude:opus',
  capabilityProfileResolved: true,
  workspacePath: WORKSPACE,
  permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
  deliveryMode: 'commit_only',
  deliveryGates: [],
  backgroundServiceAvailable: true,
});

const ROOM_STATE = {
  selectedChannelId: 'room-1',
  channels: [{ id: 'room-1' }],
  cats: [],
};

const BINDING: BotBindingRecord = {
  id: BINDING_ID,
  platform: 'telegram',
  botName: 'e2e_bot',
  orchestratorActorId: 'actor-orchestrator',
  catActorId: 'actor-cat',
  bossCatActorId: 'actor-cat',
  botToken: 'token-e2e',
  webhookSecret: null,
  inboundMode: 'polling',
  roomMode: 'direct_message',
  status: 'active',
  createdAt: '2026-09-02T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
};

interface WireMessage {
  operation: string;
  chatId: string;
  text: string;
  buttons: string[][];
}

/** Callback ids the transport acknowledged, in order. */
type AnsweredCallbacks = string[];

function messageUpdate(updateId: number, text: string): TelegramWebhookUpdate {
  return {
    update_id: updateId,
    message: {
      message_id: updateId * 10,
      text,
      chat: { id: Number(CHAT_ID), type: 'private' },
      from: { id: 1, is_bot: false, first_name: 'Kenny', language_code: 'en' },
      date: 1_756_000_000,
    },
  } as unknown as TelegramWebhookUpdate;
}

function callbackUpdate(updateId: number, data: string): TelegramWebhookUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: `cb-${updateId}`,
      data,
      from: { id: 1, is_bot: false, first_name: 'Kenny', language_code: 'en' },
      message: {
        message_id: updateId * 10,
        chat: { id: Number(CHAT_ID), type: 'private' },
        date: 1_756_000_000,
      },
    },
  } as unknown as TelegramWebhookUpdate;
}

interface Harness {
  coreStore: MemoryCoreStore;
  transportState: TransportWorkStateStore;
  /** Message bodies that reached ordinary chat routing instead of the path. */
  routedToChat: string[];
  outbox: ReturnType<typeof createTransportWorkOutbox>;
  telemetry: TransportWorkTelemetry;
  wire: WireMessage[];
  answered: AnsweredCallbacks;
  repoCalls: string[];
  deliver(update: TelegramWebhookUpdate): Promise<void>;
  /** Waits for detached run driving started by an admission. */
  settle(): Promise<void>;
}

function createHarness(options: {
  /** Steps the fake provider performs before claiming completion. */
  steps?: Array<{ satisfied: string[]; summary: string }>;
  /** Leaves the worktree dirty so a commit is actually produced. */
  dirty?: boolean;
  /** Models the rollback switch: the host composes no golden path at all. */
  disabled?: boolean;
  coreStore?: MemoryCoreStore;
  transportState?: TransportWorkStateStore;
} = {}): Harness {
  const coreStore = options.coreStore ?? new MemoryCoreStore(createDefaultCoreState());
  const transportState = options.transportState ?? createMemoryTransportWorkStateStore();
  const routedToChat: string[] = [];
  const wire: WireMessage[] = [];
  const answered: AnsweredCallbacks = [];
  const repoCalls: string[] = [];
  const driving: Array<Promise<unknown>> = [];

  const relay = createTelegramRelay({
    resolveDeliveryClient: () => ({
      deliver: async (request: Record<string, never> & {
        operation: string;
        chatId: string;
        text?: string;
        callbackQueryId?: string;
        replyMarkup?: unknown;
      }): Promise<TelegramDeliveryClientResult> => {
        // An acknowledgement is an ordinary delivery with `answer_callback`, so
        // both travel through here and ordering between them is observable.
        if (request.operation === 'answer_callback') {
          answered.push(String(request.callbackQueryId ?? ''));
          return { ok: true, chatId: request.chatId, messageId: null };
        }
        const markup = request.replyMarkup as
          | { inline_keyboard?: Array<Array<{ callback_data?: string }>> }
          | undefined;
        const buttons = (markup?.inline_keyboard ?? []).map((row) =>
          row.map((button) => button.callback_data ?? ''),
        );
        wire.push({
          operation: request.operation,
          chatId: request.chatId,
          text: request.text ?? '',
          buttons,
        });
        return { ok: true, chatId: request.chatId, messageId: `tg-${wire.length}` };
      },
      setMyCommands: async () => ({ ok: true }),
      deleteMyCommands: async () => ({ ok: true }),
      setChatMenuButton: async () => ({ ok: true }),
    } as unknown as TelegramDeliveryClient),
  });

  const context: TelegramRelayContext = {
    bossCatId: 'cat-1',
    bossCatName: 'E2E Cat',
    bossCatActorId: 'actor-cat',
    botBindings: [BINDING],
    defaultBotBinding: BINDING,
    selectedBotBinding: BINDING,
  };

  const telemetry = createTransportWorkTelemetry();
  const outbox = createTransportWorkOutbox({
    telemetry,
    store: transportState,
    send: createTelegramGoldenPathOutboxSender({
      telegramRelay: relay,
      resolveRelayContext: () => context,
    }),
  });

  // A worktree that is dirty until Cats commits, then clean at a moved HEAD —
  // the post-condition the evidence collector verifies for itself.
  let committed = false;
  const deliveryClient = {
    async inspectRepo() {
      repoCalls.push('inspect');
      return {
        supported: true,
        repository: true,
        clean: committed || options.dirty === false,
        branch: 'main',
        headOid: committed ? HEAD_AFTER : HEAD_BEFORE,
        stagedCount: committed ? 0 : 1,
        modifiedCount: 0,
        untrackedCount: 0,
      };
    },
    async createCommit() {
      repoCalls.push('commit');
      committed = true;
      return { state: 'completed', commitId: HEAD_AFTER, blockedReasons: [] };
    },
    async previewArtifacts() {
      return [];
    },
  } as unknown as RuntimeDeliveryClient;

  const service = createWorkGoldenPathService({
    coreStore,
    outbox,
    deliveryClient,
    telemetry,
    tokenStore: createTransportWorkActionTokenStore({ store: transportState }),
  });

  // The provider is the only fake in the execution path: the real evidence
  // collector still decides what counts as done, from what the repo reports.
  const collectEvidence = createRuntimeEvidenceCollector({ deliveryClient });
  const steps = options.steps ?? [{ satisfied: [CRITERION], summary: 'Added the entry.' }];
  let stepIndex = 0;
  const runner = createWorkGoldenPathRunner({
    coreStore,
    service,
    maxSteps: steps.length + 1,
    executeStep: async (context): Promise<WorkGoldenPathStepResult> => {
      const step = steps[Math.min(stepIndex, steps.length - 1)];
      stepIndex += 1;
      if (stepIndex < steps.length) {
        return {
          status: 'continue',
          summary: step.summary,
          satisfiedCriteria: step.satisfied,
          artifact: null,
          commit: null,
          blockedReason: null,
        };
      }
      const evidence = await collectEvidence({
        runId: context.runId,
        sessionId: 'session-e2e',
        goal: context.goal,
        deliveryMode: context.deliveryMode,
          workspacePath: context.workspacePath,
          baselineHeadOid: context.workspaceHeadOid ?? null,
          acceptanceCriteria: context.acceptanceCriteria,
        claimedCriteria: step.satisfied,
      });
      return {
        status: 'claims_complete',
        summary: step.summary,
        satisfiedCriteria: evidence.satisfiedCriteria,
        artifact: evidence.artifact,
        commit: evidence.commit,
        blockedReason: null,
      };
    },
  });

  const port = createTelegramGoldenPathPort({
    service,
    resolveContext: async () => ({
      readiness: READINESS,
      ownerActorId: 'actor-owner',
      targetLabel: 'cats-platform',
      projectId: null,
      workspacePath: WORKSPACE,
      deliveryMode: 'commit_only',
      deliveryGates: [],
      acceptanceCriteria: [CRITERION],
      openQuestion: null,
      toolScope: 'narrow_write',
      executionTarget: { provider: 'claude', instance: 'native', model: 'opus' },
      workspaceHeadOid: HEAD_BEFORE,
    }),
    onAdmitted: ({ runId }) => {
      driving.push(runner.drive({ runId }).catch(() => undefined));
    },
  });

  return {
    coreStore,
    transportState,
    routedToChat,
    outbox,
    telemetry,
    wire,
    answered,
    repoCalls,
    async deliver(update) {
      const receipt = relay.receiveUpdate({ update, context });
      if (receipt.status !== 'accepted') {
        return;
      }
      await bridgeTelegramWebhookToRoom({
        update,
        receipt,
        context,
        roomBridge: {
          readState: async () => ROOM_STATE,
          writeState: async (state: unknown) => state,
          findReusableRoomId: () => 'room-1',
          createRoom: (state: unknown) => ({ roomId: 'room-1', state }),
          readRoom: (_state: unknown, roomId: string) => ({ id: roomId, title: roomId, messages: [] }),
          buildRecoveryState: ({ state }: { state: unknown }) => state,
          routeRoomMessage: async ({ state, body }: { state: unknown; body: string }) => {
            routedToChat.push(body);
            return { state };
          },
        } as never,
        memoryService: {} as never,
        runtimeClient: {} as never,
        telegramRelay: relay,
        goldenPath: options.disabled ? null : port,
      });
      // Production ingress returns once Core and the durable outbox are
      // captured. This deterministic harness drains that outbox so assertions
      // about wire order do not race the intentionally detached sender.
      await outbox.flushWorkItem(
        (await coreStore.readCore()).workItems.at(-1)?.id ?? `pending:${String(update.update_id)}`,
      );
    },
    async settle() {
      await Promise.allSettled(driving);
      // The last delivery is enqueued from inside the run, one turn later.
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
  };
}

async function seedBinding(harness: Harness): Promise<void> {
  await harness.coreStore.updateCore((core) => ({ ...core, botBindings: [BINDING] }));
}

// --- The whole chain -----------------------------------------------------------

test('a /work message reaches delivered without any layer being stubbed out', async () => {
  const harness = createHarness();
  await seedBinding(harness);

  await harness.deliver(messageUpdate(1, '/work Add a changelog entry for 0.1.21'));

  // Acceptance and a proposal carrying real buttons.
  assert.ok(harness.wire.length >= 2, 'acceptance and proposal were both sent');
  const proposal = harness.wire.at(-1)!;
  assert.equal(proposal.chatId, CHAT_ID);
  const callbackData = proposal.buttons.flat().filter((entry) => entry.length > 0);
  assert.ok(callbackData.length > 0, 'the proposal carried an inline keyboard');
  assert.ok(
    callbackData.every((entry) => entry.length <= 64),
    "callback_data must fit Telegram's 64-byte limit",
  );
  assert.ok(
    callbackData.every((entry) => !entry.includes(WORKSPACE)),
    'FR-6/FR-13: no local path may travel in callback data',
  );

  const before = harness.wire.length;
  await harness.deliver(callbackUpdate(2, callbackData[0]));
  await harness.settle();

  // The callback was acknowledged (FR-12) and the work reached delivery.
  assert.deepEqual(harness.answered, ['cb-2']);

  const core = await harness.coreStore.readCore();
  const run = core.runs.at(-1)!;
  assert.equal(run.status, 'completed');
  assert.deepEqual(
    (run.metadata.workGoldenPath as Record<string, unknown>).execution,
    {
      target: { provider: 'claude', instance: 'native', model: 'opus' },
      toolScope: 'narrow_write',
      workspaceHeadOid: HEAD_BEFORE,
    },
    'execution facts are attached to this Run rather than held in process globals',
  );
  assert.equal(core.runs.length, 1, 'exactly one Run for one authorization');
  assert.equal(core.tasks.length, 1, 'exactly one Task');

  const delivered = harness.wire.slice(before);
  assert.ok(delivered.length > 0, 'the owner heard back after authorizing');
  assert.ok(
    delivered.every((message) => message.chatId === CHAT_ID),
    'FR-43: every message went to the originating chat',
  );

  // Evidence was produced by Cats, not claimed by the provider.
  assert.deepEqual(harness.repoCalls, ['inspect', 'commit', 'inspect']);

  // The real outbox is the reader, so `delivered` means a receipt exists rather
  // than "the Run finished" — the distinction the whole design rests on.
  const projection = buildWorkGoldenPathDetailProjectionForTask({
    core,
    taskId: run.taskId!,
    deliveryReader: harness.outbox,
  });
  assert.equal(projection?.stage, 'delivered');
});

test('nothing sent to Telegram carries a workspace path or a token', async () => {
  const harness = createHarness();
  await seedBinding(harness);

  await harness.deliver(messageUpdate(1, '/work Add a changelog entry for 0.1.21'));
  const callbackData = harness.wire.at(-1)!.buttons.flat().filter((entry) => entry.length > 0);
  await harness.deliver(callbackUpdate(2, callbackData[0]));
  await harness.settle();

  for (const message of harness.wire) {
    assert.ok(!message.text.includes(WORKSPACE), `payload leaked a local path: ${message.text}`);
    assert.ok(!message.text.includes('token-e2e'), 'payload leaked the bot token');
  }
});

// --- Idempotency across the whole chain ---------------------------------------

test('a redelivered /work update does not open a second Work Item', async () => {
  const harness = createHarness();
  await seedBinding(harness);

  const update = messageUpdate(1, '/work Add a changelog entry for 0.1.21');
  await harness.deliver(update);
  const afterFirst = harness.wire.length;
  await harness.deliver(update);

  const core = await harness.coreStore.readCore();
  assert.equal(core.workItems.length, 1, 'the replay reused the same Work Item');
  assert.equal(
    harness.wire.length,
    afterFirst,
    'and the owner was not told twice — the relay deduped the update',
  );
});

test('a double-tapped Start work button produces one Run and one delivery', async () => {
  const harness = createHarness();
  await seedBinding(harness);

  await harness.deliver(messageUpdate(1, '/work Add a changelog entry for 0.1.21'));
  const callbackData = harness.wire.at(-1)!.buttons.flat().filter((entry) => entry.length > 0)[0];

  await harness.deliver(callbackUpdate(2, callbackData));
  await harness.deliver(callbackUpdate(3, callbackData));
  await harness.settle();

  const core = await harness.coreStore.readCore();
  assert.equal(core.runs.length, 1, 'the second tap did not start a second Run');
  assert.equal(core.tasks.length, 1);
  assert.equal(core.outcomes.length, 1, 'one run, one outcome');
  assert.deepEqual(harness.answered, ['cb-2', 'cb-3'], 'both taps were still acknowledged');
});

// --- Truthful refusal ----------------------------------------------------------

test('an attachment-only request is refused without inventing a goal (FR-48)', async () => {
  const harness = createHarness();
  await seedBinding(harness);

  const update = {
    update_id: 1,
    message: {
      message_id: 10,
      caption: '/work',
      document: { file_id: 'file-1', file_name: 'spec.pdf' },
      chat: { id: Number(CHAT_ID), type: 'private' },
      from: { id: 1, is_bot: false, first_name: 'Kenny', language_code: 'en' },
      date: 1_756_000_000,
    },
  } as unknown as TelegramWebhookUpdate;

  await harness.deliver(update);

  const core = await harness.coreStore.readCore();
  assert.equal(core.workItems.length, 0, 'no Work Item was captured from an attachment');
  assert.equal(harness.wire.length, 1, 'the owner was told why');
  assert.ok(
    !harness.wire[0].text.includes('spec.pdf'),
    'the filename must not be passed off as the goal',
  );
});

// --- Restart at every checkpoint (PLAN-105 Phase 6) ----------------------------

/**
 * A host restart must never produce a second Task, Run, commit, or final
 * message. The interesting cases are not "does it recover" but "does recovery
 * duplicate", so each of these restarts at a checkpoint and then re-drives the
 * *same* Core state through a fresh set of in-process objects — which is what a
 * restart actually is here, since the driver lives in the process and the ledger
 * does not.
 */


/** Rebuilds the process-local objects around surviving Core state. */
function restart(previous: Harness): Harness {
  return createHarness({
    coreStore: previous.coreStore,
    transportState: previous.transportState,
  });
}

async function proposeAndCaptureButton(harness: Harness): Promise<string> {
  await seedBinding(harness);
  await harness.deliver(messageUpdate(1, '/work Add a changelog entry for 0.1.21'));
  return harness.wire.at(-1)!.buttons.flat().filter((entry) => entry.length > 0)[0];
}

test('restarting at scope-proposed keeps one Work Item and the button still works', async () => {
  const first = createHarness();
  const button = await proposeAndCaptureButton(first);

  // The proposal was sent; the host dies before the owner taps.
  const second = restart(first);
  const beforeRuns = (await second.coreStore.readCore()).runs.length;
  assert.equal(beforeRuns, 0, 'no Run exists before authorization (FR-19)');

  // Both the opaque token grant and the proposal survive the process boundary.
  await second.deliver(callbackUpdate(2, button));
  await second.settle();
  const core = await second.coreStore.readCore();
  assert.equal(core.workItems.length, 1, 'no parallel Work Item appeared');
  assert.equal(core.runs.length, 1, 'the already-issued button admits exactly one Run');
  assert.deepEqual(second.answered, ['cb-2'], 'the tap was still acknowledged (FR-12)');
});

test('restarting mid-run resumes it once and delivers once', async () => {
  const first = createHarness();
  const button = await proposeAndCaptureButton(first);
  await first.deliver(callbackUpdate(2, button));
  await first.settle();

  const core = await first.coreStore.readCore();
  const runId = core.runs[0]!.id;
  // Rewind to a host that died with the Run still live.
  await first.coreStore.updateCore((state) => ({
    ...state,
    runs: state.runs.map((run) => (run.id === runId ? { ...run, status: 'running' } : run)),
  }));

  const second = restart(first);
  const result = await resumeGoldenPathRuns({
    coreStore: second.coreStore,
    runner: createWorkGoldenPathRunner({
      coreStore: second.coreStore,
      service: createWorkGoldenPathService({ coreStore: second.coreStore, outbox: second.outbox }),
      maxSteps: 1,
      executeStep: async () => ({
        status: 'claims_complete',
        summary: 'Finished after the restart.',
        satisfiedCriteria: [CRITERION],
        artifact: null,
        commit: {
          commitId: HEAD_AFTER,
          changeSummary: 'Added the entry',
          validation: { command: 'runtime repo status: worktree clean at the new HEAD', passed: true },
        },
        blockedReason: null,
      }),
    }),
  });
  assert.deepEqual(result.resumed, [runId]);
  await new Promise((resolve) => setTimeout(resolve, 30));

  const after = await second.coreStore.readCore();
  assert.equal(after.runs.length, 1, 'the resume re-drove the same Run');
  assert.equal(after.tasks.length, 1);
  assert.equal(after.outcomes.length, 1, 'one outcome, not one per boot');
});

test('a completed run is never re-driven by a restart', async () => {
  const first = createHarness();
  const button = await proposeAndCaptureButton(first);
  await first.deliver(callbackUpdate(2, button));
  await first.settle();

  const before = await first.coreStore.readCore();
  assert.equal(before.runs[0]!.status, 'completed');
  const outcomesBefore = before.outcomes.length;

  const second = restart(first);
  const result = await resumeGoldenPathRuns({
    coreStore: second.coreStore,
    runner: createWorkGoldenPathRunner({
      coreStore: second.coreStore,
      service: createWorkGoldenPathService({ coreStore: second.coreStore, outbox: second.outbox }),
      maxSteps: 1,
      executeStep: async () => {
        throw new Error('a finished run must never be executed again');
      },
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(result.resumed, []);
  const after = await second.coreStore.readCore();
  assert.equal(after.outcomes.length, outcomesBefore, 'no second outcome');
  assert.equal(second.wire.length, 0, 'and no second final message');
});

test('restarting after delivery sends nothing further', async () => {
  const first = createHarness();
  const button = await proposeAndCaptureButton(first);
  await first.deliver(callbackUpdate(2, button));
  await first.settle();

  const deliveredCount = first.wire.length;
  const second = restart(first);
  await resumeGoldenPathRuns({
    coreStore: second.coreStore,
    runner: createWorkGoldenPathRunner({
      coreStore: second.coreStore,
      service: createWorkGoldenPathService({ coreStore: second.coreStore, outbox: second.outbox }),
      maxSteps: 1,
      executeStep: async () => {
        throw new Error('nothing left to execute');
      },
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(second.wire.length, 0, 'the new process sent nothing');
  assert.ok(deliveredCount > 0, 'the original delivery did happen');
});

// --- Counters describe the run that actually happened --------------------------

test('a completed run moves the counters, and none of them carry content', async () => {
  const harness = createHarness();
  const button = await proposeAndCaptureButton(harness);
  await harness.deliver(callbackUpdate(2, button));
  await harness.settle();

  const snapshot = harness.telemetry.snapshot();
  assert.equal(snapshot.counters['admission_result.admitted'], 1);
  assert.ok(
    (snapshot.counters['delivery_receipt.sent'] ?? 0) > 0,
    'the delivery receipt was counted',
  );

  // The whole point of the closed label set: a counter key can never become a
  // place where a goal, a chat id, or a token ends up.
  for (const key of Object.keys(snapshot.counters)) {
    assert.ok(!key.includes(CHAT_ID), `counter key leaked a chat id: ${key}`);
    assert.ok(!key.includes('token-e2e'), `counter key leaked a token: ${key}`);
    assert.ok(!key.toLowerCase().includes('changelog'), `counter key leaked the goal: ${key}`);
  }
});

// --- Rollback (PLAN-105 Phase 6) -----------------------------------------------

test('rolling back reverts /work to chat and keeps every record', async () => {
  // Run the path once so there is state a rollback could plausibly destroy.
  const live = createHarness();
  const button = await proposeAndCaptureButton(live);
  await live.deliver(callbackUpdate(2, button));
  await live.settle();

  const before = await live.coreStore.readCore();
  assert.equal(before.workItems.length, 1);
  assert.equal(before.runs.length, 1);

  // The rollback is `CATS_WORK_GOLDEN_PATH_ENABLED=false`, which makes the host
  // compose no golden path at all — modelled here by passing none to the bridge.
  const rolledBack = createHarness({ disabled: true });
  (rolledBack as { coreStore: MemoryCoreStore }).coreStore = live.coreStore;
  await rolledBack.deliver(messageUpdate(9, '/work Something else entirely'));

  assert.deepEqual(
    rolledBack.routedToChat,
    ['/work Something else entirely'],
    '/work falls through to ordinary chat routing',
  );

  const after = await rolledBack.coreStore.readCore();
  assert.equal(after.workItems.length, 1, 'existing Work Items survive the rollback');
  assert.equal(after.runs.length, 1, 'and so do Runs');
  assert.equal(after.outcomes.length, before.outcomes.length);
  assert.equal(
    after.activities.length,
    before.activities.length,
    'the activity trail is retained for the failure review the rollout gate requires',
  );
});
