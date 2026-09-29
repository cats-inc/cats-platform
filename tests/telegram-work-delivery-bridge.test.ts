/**
 * Bridge-level wiring for the SPEC-114 golden path.
 *
 * The service-level acceptance path lives in
 * `telegram-work-delivery-golden-path.test.ts`. This file proves the part that
 * file cannot: that a real Telegram update actually reaches the golden path,
 * that a golden-path callback is durably captured before its best-effort
 * Telegram acknowledgement (FR-12), and that everything else still falls
 * through to ordinary chat.
 *
 * All state is temporary and in-memory; no real bot or credential is involved.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.js';
import { createDefaultCoreState } from '../src/core/model/index.js';
import type { BotBindingRecord } from '../src/core/types.js';
import { bridgeTelegramWebhookToRoom } from '../src/platform/transports/telegram/bridge.js';
import type {
  TelegramDeliveryReceipt,
  TelegramDeliveryRequest,
  TelegramRelayContext,
  TelegramWebhookReceipt,
  TelegramWebhookUpdate,
} from '../src/platform/transports/telegram/contracts.js';
import type { TelegramRelay } from '../src/platform/transports/telegram/relay/index.js';
import { createTransportWorkOutbox } from '../src/platform/transports/work-delivery/outbox.js';
import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import type {
  TransportWorkGoldenPathPort,
  TransportWorkHandledResult,
} from '../src/platform/transports/work-delivery/port.js';
import { createWorkGoldenPathService } from '../src/products/work/state/workGoldenPathService.js';
import {
  createTelegramGoldenPathPort,
} from '../src/products/work/state/workGoldenPathTelegramPort.js';
import type { CatsMemoryService } from '../src/platform/memory/service.js';
import type { RuntimeClient } from '../src/platform/runtime/client.js';

const BINDING_ID = 'binding-telegram-bridge-test';
const CHAT_ID = '4242';
const CONVERSATION_ID = 'conversation-bridge-test';
const OWNER_USER_ID = 987654;

/** The bridge only reaches these when an update is *not* golden-path traffic. */
const memoryService = {} as unknown as CatsMemoryService;
const runtimeClient = {} as unknown as RuntimeClient;

function botBinding(): BotBindingRecord {
  return {
    id: BINDING_ID,
    platform: 'telegram',
    botName: 'bridge_test_bot',
    orchestratorActorId: 'actor-orchestrator',
    catActorId: 'actor-cat',
    bossCatActorId: 'actor-cat',
    botToken: null,
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: 'direct_message',
    status: 'active',
    createdAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  };
}

function relayContext(): TelegramRelayContext {
  const binding = botBinding();
  return {
    bossCatId: 'cat-1',
    bossCatName: 'Bridge Cat',
    bossCatActorId: 'actor-cat',
    botBindings: [binding],
    defaultBotBinding: binding,
    selectedBotBinding: binding,
  };
}

function acceptedReceipt(overrides: Partial<TelegramWebhookReceipt> = {}): TelegramWebhookReceipt {
  return {
    platform: 'telegram',
    status: 'accepted',
    acceptedAt: '2026-09-02T10:00:00.000Z',
    updateId: 1001,
    chatId: CHAT_ID,
    messageId: '55',
    bindingId: BINDING_ID,
    botName: 'bridge_test_bot',
    bossCatId: 'cat-1',
    bossCatName: 'Bridge Cat',
    mappedConversationId: CONVERSATION_ID,
    messageSummary: null,
    roomRouting: 'direct_lane',
    ...overrides,
  } as TelegramWebhookReceipt;
}

interface RecordedCall {
  kind: string;
  detail?: string;
}

/**
 * A relay stub that records the order of calls.
 *
 * Ordering is the whole point of the FR-12 assertion, so the fake records a
 * single shared log rather than per-method counters.
 */
function createRecordingRelay(log: RecordedCall[]): TelegramRelay {
  return {
    getIngressConfig: () => ({ secretToken: null, maxBodyBytes: 1024 }),
    getStatus: () => {
      throw new Error('not used');
    },
    getDiagnostics: () => {
      throw new Error('not used');
    },
    resolveBinding: () => null,
    findSoleUnlinkedConversation: () => null,
    linkRoom: () => null,
    receiveUpdate: () => acceptedReceipt(),
    markUpdateProcessed: () => undefined,
    deliver: async ({ request }) => {
      log.push({ kind: `deliver:${request.operation}`, detail: request.text ?? undefined });
      return {
        platform: 'telegram',
        operation: request.operation,
        status: 'sent',
        deliveredAt: '2026-09-02T10:00:00.000Z',
        deliveryId: `delivery-${log.length}`,
        chatId: request.chatId ?? null,
        conversationId: request.conversationId ?? null,
        messageId: `tg-${log.length}`,
        replyToMessageId: null,
        bindingId: BINDING_ID,
        botName: 'bridge_test_bot',
        bossCatId: 'cat-1',
        bossCatName: 'Bridge Cat',
        textPreview: request.text ?? null,
      } satisfies TelegramDeliveryReceipt;
    },
    recordBridgeDispatchFailure: ({ errorMessage }) => {
      log.push({ kind: 'relay:dispatchFailure', detail: errorMessage });
      return {
        platform: 'telegram',
        operation: 'send',
        status: 'failed',
        deliveredAt: '2026-09-02T10:00:00.000Z',
        deliveryId: 'delivery-failure',
        chatId: CHAT_ID,
        conversationId: CONVERSATION_ID,
        messageId: null,
        replyToMessageId: null,
        bindingId: BINDING_ID,
        botName: 'bridge_test_bot',
        bossCatId: 'cat-1',
        bossCatName: 'Bridge Cat',
        textPreview: null,
        reason: 'runtime_dispatch_failed',
      } satisfies TelegramDeliveryReceipt;
    },
  };
}

/** A port stub that records what the bridge handed it. */
function createRecordingPort(log: RecordedCall[]): TransportWorkGoldenPathPort {
  const result = (outcome: TransportWorkHandledResult['outcome']): TransportWorkHandledResult => ({
    handled: true,
    outcome,
    workItemId: null,
    rejection: null,
  });
  return {
    ownsCallback: (callbackData) => callbackData.startsWith('gp:'),
    handleWorkCommand: async (input) => {
      log.push({ kind: 'handleWorkCommand', detail: input.goal });
      return result('accepted');
    },
    handleActionCallback: async (input) => {
      log.push({ kind: 'handleActionCallback', detail: input.ownerEventRef });
      return result('admitted');
    },
    refuse: async (input) => {
      log.push({ kind: 'refuse', detail: input.reasonKey });
      return result('refused');
    },
  };
}

/**
 * A room bridge stub that records rather than throws.
 *
 * The bridge catches room-bridge failures and reports them through the relay,
 * so an exception here would be swallowed and prove nothing. Whether the chat
 * path was entered is therefore asserted from the call log.
 */
function createChatRoomBridgeSpy(log: RecordedCall[]) {
  return {
    readState: async () => {
      log.push({ kind: 'roomBridge:readState' });
      return { selectedChannelId: 'channel-1', channels: [{ id: 'channel-1' }], cats: [] };
    },
    writeState: async (state: unknown) => state,
    createRoom: (state: unknown) => {
      log.push({ kind: 'roomBridge:createRoom' });
      return { state, roomId: 'channel-1' };
    },
    findReusableRoomId: () => 'channel-1',
    readRoom: () => ({ messages: [] }),
    routeRoomMessage: async ({ state }: { state: unknown }) => {
      log.push({ kind: 'roomBridge:routeRoomMessage' });
      return { state };
    },
  } as never;
}

/** Asserts the update took the ordinary chat path, not the golden path. */
function assertFellThroughToChat(log: RecordedCall[]): void {
  assert.ok(
    log.some((entry) => entry.kind.startsWith('roomBridge:')),
    'the update should have reached the chat room bridge',
  );
  assert.ok(
    !log.some((entry) => entry.kind.startsWith('handle') || entry.kind === 'refuse'),
    'the golden path must not consume ordinary chat traffic',
  );
}

function workUpdate(text: string, overrides: Partial<TelegramWebhookUpdate> = {}) {
  return {
    update_id: 1001,
    message: {
      message_id: 55,
      text,
      chat: { id: Number(CHAT_ID), type: 'private' },
      from: { id: OWNER_USER_ID, is_bot: false, first_name: 'Owner', language_code: 'en' },
    },
    ...overrides,
  } satisfies TelegramWebhookUpdate;
}

function callbackUpdate(callbackData: string): TelegramWebhookUpdate {
  return {
    update_id: 1002,
    callback_query: {
      id: 'cbq-1',
      data: callbackData,
      from: { id: OWNER_USER_ID, is_bot: false, first_name: 'Owner', language_code: 'en' },
      message: {
        message_id: 56,
        chat: { id: Number(CHAT_ID), type: 'private' },
      },
    },
  } as TelegramWebhookUpdate;
}

async function runBridge(input: {
  update: TelegramWebhookUpdate;
  log: RecordedCall[];
  goldenPath: TransportWorkGoldenPathPort | null;
  receipt?: TelegramWebhookReceipt;
  telegramRelay?: TelegramRelay;
}) {
  return bridgeTelegramWebhookToRoom({
    update: input.update,
    receipt: input.receipt ?? acceptedReceipt({
      updateId: input.update.update_id ?? null,
    }),
    context: relayContext(),
    roomBridge: createChatRoomBridgeSpy(input.log),
    memoryService,
    runtimeClient,
    telegramRelay: input.telegramRelay ?? createRecordingRelay(input.log),
    goldenPath: input.goldenPath,
  });
}

// --- Routing -----------------------------------------------------------------

test('a /work message is routed to the golden path and never to the chat room', async () => {
  const log: RecordedCall[] = [];
  const result = await runBridge({
    update: workUpdate('/work Add a changelog entry for 0.1.21'),
    log,
    goldenPath: createRecordingPort(log),
  });

  assert.deepEqual(
    log.map((entry) => entry.kind),
    ['handleWorkCommand'],
    'the chat room bridge is never touched for a /work request',
  );
  assert.equal(log[0].detail, 'Add a changelog entry for 0.1.21');
  assert.deepEqual(result.messages, []);
  assert.equal(result.roomCreated, false);
});

test('an ordinary message still falls through to the chat room', async () => {
  const log: RecordedCall[] = [];
  await runBridge({
    update: workUpdate('what is the weather today'),
    log,
    goldenPath: createRecordingPort(log),
  });
  assertFellThroughToChat(log);
});

test('with the golden path disabled, /work falls through to chat unchanged', async () => {
  const log: RecordedCall[] = [];
  await runBridge({
    update: workUpdate('/work Add a changelog entry'),
    log,
    goldenPath: null,
  });
  assertFellThroughToChat(log);
});

test('a companion heartbeat that lands mid-turn is never re-sent as the Telegram reply', async () => {
  const log: RecordedCall[] = [];
  type Message = { senderKind: string; senderName: string; body: string; metadata?: Record<string, unknown> };
  const roomState = (messages: Message[]) => ({
    selectedChannelId: 'channel-1',
    channels: [{ id: 'channel-1', title: 'Bridge Cat', messages }],
    cats: [],
  });
  // The owner's turn failed, so the only Cat message since dispatch is the heartbeat
  // that the transport fanout already mirrored.
  const roomBridge = {
    readState: async () => roomState([]),
    writeState: async (state: unknown) => state,
    createRoom: (state: unknown) => ({ state, roomId: 'channel-1' }),
    findReusableRoomId: () => 'channel-1',
    readRoom: (state: ReturnType<typeof roomState>) => state.channels[0],
    routeRoomMessage: async ({ state }: { state: ReturnType<typeof roomState> }) => ({
      state: roomState([
        ...state.channels[0]!.messages,
        { senderKind: 'user', senderName: 'Owner', body: 'are you up?' },
        {
          senderKind: 'agent',
          senderName: 'Bridge Cat',
          body: 'Good morning from the windowsill.',
          metadata: { event: 'companion_heartbeat', origin: 'runtime' },
        },
        { senderKind: 'system', senderName: 'Cats', body: 'Bridge Cat could not answer right now.' },
      ]),
    }),
  } as never;

  await bridgeTelegramWebhookToRoom({
    update: workUpdate('are you up?'),
    receipt: acceptedReceipt(),
    context: relayContext(),
    roomBridge,
    memoryService,
    runtimeClient,
    telegramRelay: createRecordingRelay(log),
    goldenPath: null,
  });

  const replies = log.filter((entry) => entry.kind.startsWith('deliver:'));
  assert.equal(replies.length, 1);
  assert.doesNotMatch(replies[0]!.detail ?? '', /windowsill/u);
  assert.match(replies[0]!.detail ?? '', /could not answer right now/u);
});

test('a reply carrying an album photo reaches Telegram as that photo, captioned with the reply', async () => {
  const log: RecordedCall[] = [];
  const photo = { path: '/album/trips/sunset.png', fileName: 'sunset.png' };
  type Message = { senderKind: string; senderName: string; body: string; metadata?: Record<string, unknown> };
  const roomState = (messages: Message[]) => ({
    selectedChannelId: 'channel-1',
    channels: [{ id: 'channel-1', title: 'Bridge Cat', messages }],
    cats: [],
  });
  const roomBridge = {
    readState: async () => roomState([]),
    writeState: async (state: unknown) => state,
    createRoom: (state: unknown) => ({ state, roomId: 'channel-1' }),
    findReusableRoomId: () => 'channel-1',
    readRoom: (state: ReturnType<typeof roomState>) => state.channels[0],
    routeRoomMessage: async ({ state }: { state: ReturnType<typeof roomState> }) => ({
      state: roomState([
        ...state.channels[0]!.messages,
        { senderKind: 'user', senderName: 'Owner', body: 'show me the beach' },
        {
          senderKind: 'agent',
          senderName: 'Bridge Cat',
          body: '[Attached files in working directory:]\n- .cats-attachments/sunset.png\n\nHere is last summer.',
          metadata: { event: 'assistant_turn_segment', transportMedia: { kind: 'photo', ...photo } },
        },
      ]),
    }),
  } as never;
  const relay = createRecordingRelay(log);
  const requests: TelegramDeliveryRequest[] = [];
  const recordDelivery = relay.deliver;
  relay.deliver = async (input) => {
    requests.push(input.request);
    return recordDelivery(input);
  };

  await bridgeTelegramWebhookToRoom({
    update: workUpdate('show me the beach'),
    receipt: acceptedReceipt(),
    context: relayContext(),
    roomBridge,
    memoryService,
    runtimeClient,
    telegramRelay: relay,
    goldenPath: null,
  });

  assert.deepEqual(requests.map((request) => request.operation), ['send_media']);
  assert.deepEqual(requests[0]!.mediaFile, photo);
  assert.equal(requests[0]!.caption, 'Here is last summer.', 'the caption is the Cat\'s words alone');
});

function directLaneRoomBridge(options: { roomExists: boolean }) {
  type Channel = { id: string; title: string; messages: Array<{ senderKind: string; senderName: string; body: string }> };
  const roomState = (channels: Channel[]) => ({ selectedChannelId: 'channel-1', channels, cats: [] });
  return {
    readState: async () => roomState(options.roomExists ? [{ id: 'channel-1', title: '', messages: [] }] : []),
    writeState: async (state: unknown) => state,
    createRoom: (state: ReturnType<typeof roomState>) => ({
      state: roomState([...state.channels, { id: 'channel-1', title: '', messages: [] }]),
      roomId: 'channel-1',
    }),
    findReusableRoomId: (state: ReturnType<typeof roomState>) => state.channels[0]?.id ?? null,
    readRoom: (state: ReturnType<typeof roomState>) => state.channels[0],
    routeRoomMessage: async ({ state }: { state: ReturnType<typeof roomState> }) => ({
      state: roomState([{
        ...state.channels[0]!,
        messages: [
          ...state.channels[0]!.messages,
          { senderKind: 'user', senderName: 'Owner', body: 'are you up?' },
          { senderKind: 'agent', senderName: 'Bridge Cat', body: 'Purr. Right here.' },
        ],
      }]),
    }),
  } as never;
}

for (const roomExists of [true, false]) {
  test(`a Cat's own bot answers with its words alone (${roomExists ? 'ongoing lane' : 'first message'})`, async () => {
    const log: RecordedCall[] = [];

    await bridgeTelegramWebhookToRoom({
      update: workUpdate('are you up?'),
      receipt: acceptedReceipt(),
      context: relayContext(),
      roomBridge: directLaneRoomBridge({ roomExists }),
      memoryService,
      runtimeClient,
      telegramRelay: createRecordingRelay(log),
      goldenPath: null,
    });

    const replies = log.filter((entry) => entry.kind.startsWith('deliver:'));
    assert.deepEqual(replies.map((entry) => entry.detail), ['Purr. Right here.']);
  });
}

test('an ordinary message shows the Cat typing before the turn runs, without a delivery receipt', async () => {
  const log: RecordedCall[] = [];
  const relay: TelegramRelay = {
    ...createRecordingRelay(log),
    sendChatAction: async ({ chatId, action }) => {
      log.push({ kind: `chatAction:${action}`, detail: chatId });
    },
  };
  await runBridge({
    update: workUpdate('are you up?'),
    log,
    goldenPath: null,
    telegramRelay: relay,
  });

  const kinds = log.map((entry) => entry.kind);
  assert.deepEqual(log.filter((entry) => entry.kind === 'chatAction:typing'), [
    { kind: 'chatAction:typing', detail: CHAT_ID },
  ]);
  assert.ok(
    kinds.indexOf('chatAction:typing') < kinds.indexOf('roomBridge:routeRoomMessage'),
    'typing starts before the Cat works on the message',
  );
  assert.ok(kinds.some((kind) => kind.startsWith('deliver:')), 'the reply is still delivered');
});

// --- FR-12: acknowledgement ordering -----------------------------------------

test('a golden-path callback is captured before its Telegram acknowledgement (FR-12)', async () => {
  const log: RecordedCall[] = [];
  await runBridge({
    update: callbackUpdate('gp:AbCdEfGhIjKlMnOpQrStUvWx'),
    log,
    goldenPath: createRecordingPort(log),
    receipt: acceptedReceipt({ updateId: 1002, messageId: '56' }),
  });

  assert.deepEqual(
    log.map((entry) => entry.kind),
    ['handleActionCallback', 'deliver:answer_callback'],
    'the owner action must be durable before the best-effort Telegram acknowledgement',
  );
  assert.equal(log[0].detail, 'cbq-1', 'the callback id becomes the owner event ref');
});

test('a failed Telegram callback acknowledgement does not lose the captured owner action', async () => {
  const log: RecordedCall[] = [];
  const relay = createRecordingRelay(log);
  relay.deliver = async ({ request }) => {
    log.push({ kind: `deliver:${request.operation}` });
    throw new Error('simulated answerCallbackQuery failure');
  };

  const result = await runBridge({
    update: callbackUpdate('gp:AbCdEfGhIjKlMnOpQrStUvWx'),
    log,
    goldenPath: createRecordingPort(log),
    receipt: acceptedReceipt({ updateId: 1002, messageId: '56' }),
    telegramRelay: relay,
  });

  assert.deepEqual(log.map((entry) => entry.kind), [
    'handleActionCallback',
    'deliver:answer_callback',
  ]);
  assert.equal(result.deliveryReceipt, null);
  assert.deepEqual(result.messages, []);
});

test('a callback the golden path does not own is left to the existing handlers', async () => {
  const log: RecordedCall[] = [];
  await runBridge({
    update: callbackUpdate('pi:confirm:something'),
    log,
    goldenPath: createRecordingPort(log),
    receipt: acceptedReceipt({ updateId: 1002, messageId: '56' }),
  });
  assert.ok(!log.some((entry) => entry.kind === 'handleActionCallback'));
});

// --- FR-48: attachments -------------------------------------------------------

test('a /work request carrying an attachment is refused, not silently ingested (FR-48)', async () => {
  const log: RecordedCall[] = [];
  const update = workUpdate('/work summarize this spec');
  (update.message as Record<string, unknown>).document = {
    file_id: 'doc-1',
    file_name: 'spec.pdf',
  };

  await runBridge({ update, log, goldenPath: createRecordingPort(log) });

  assert.deepEqual(log.map((entry) => entry.kind), ['refuse']);
  assert.equal(log[0].detail, 'workDelivery.inbound.attachmentNotIngested');
});

test('an ordinary message carrying an attachment keeps its existing chat behaviour', async () => {
  const log: RecordedCall[] = [];
  const update = workUpdate('here is a photo');
  (update.message as Record<string, unknown>).photo = [{ file_id: 'photo-1' }];

  await runBridge({ update, log, goldenPath: createRecordingPort(log) });

  assert.ok(
    !log.some((entry) => entry.kind === 'refuse'),
    'the golden path must not refuse attachments it was never asked about',
  );
  assertFellThroughToChat(log);
});

function photoRoomBridge(stored: string[] | null) {
  const calls = {
    routedBodies: [] as string[],
    storedFiles: [] as Array<{ name: string; bytes: Buffer }>,
  };
  const roomState = () => ({
    selectedChannelId: 'channel-1',
    channels: [{ id: 'channel-1', title: 'Bridge Cat', messages: [] }],
    cats: [],
  });
  const roomBridge = {
    readState: async () => roomState(),
    writeState: async (state: unknown) => state,
    createRoom: (state: unknown) => ({ state, roomId: 'channel-1' }),
    findReusableRoomId: () => 'channel-1',
    readRoom: (state: ReturnType<typeof roomState>) => state.channels[0],
    routeRoomMessage: async ({ state, body }: { state: ReturnType<typeof roomState>; body: string }) => {
      calls.routedBodies.push(body);
      return { state };
    },
    ...(stored
      ? {
          storeInboundAttachments: async ({ files }: { files: Array<{ name: string; bytes: Buffer }> }) => {
            calls.storedFiles.push(...files);
            return stored;
          },
        }
      : {}),
  } as never;
  return { roomBridge, calls };
}

function photoUpdate(caption: string | null) {
  const update = workUpdate('');
  const message = update.message as Record<string, unknown>;
  delete message.text;
  if (caption) message.caption = caption;
  message.photo = [
    { file_id: 'photo-small', width: 90, height: 90 },
    { file_id: 'photo-large', width: 1280, height: 1280, file_size: 180_000 },
  ];
  return update;
}

test('a photo from Telegram is downloaded beside the room and shown to the Cat as an attachment', async () => {
  const log: RecordedCall[] = [];
  const { roomBridge, calls } = photoRoomBridge(['.cats-attachments/telegram-photo-55.jpg']);
  const relay = createRecordingRelay(log);
  const downloads: string[] = [];
  relay.downloadFile = async ({ fileId }) => {
    downloads.push(fileId);
    return { bytes: Buffer.from('jpeg bytes'), filePath: 'photos/file_7.jpg' };
  };

  await bridgeTelegramWebhookToRoom({
    update: photoUpdate('look at this sky'),
    receipt: acceptedReceipt(),
    context: relayContext(),
    roomBridge,
    memoryService,
    runtimeClient,
    telegramRelay: relay,
    goldenPath: null,
  });

  assert.deepEqual(downloads, ['photo-large'], 'only the largest size is fetched');
  assert.deepEqual(
    calls.storedFiles.map((file) => [file.name, file.bytes.toString()]),
    [['telegram-photo-55.jpg', 'jpeg bytes']],
  );
  assert.deepEqual(calls.routedBodies, [
    '[Attached files in working directory:]\n- .cats-attachments/telegram-photo-55.jpg\n\nlook at this sky',
  ]);
});

test('a photo that cannot be downloaded keeps the plain attachment label', async () => {
  const log: RecordedCall[] = [];
  const { roomBridge, calls } = photoRoomBridge(['unused']);
  const relay = createRecordingRelay(log);
  relay.downloadFile = async () => null;

  await bridgeTelegramWebhookToRoom({
    update: photoUpdate(null),
    receipt: acceptedReceipt(),
    context: relayContext(),
    roomBridge,
    memoryService,
    runtimeClient,
    telegramRelay: relay,
    goldenPath: null,
  });

  assert.deepEqual(calls.storedFiles, []);
  assert.deepEqual(calls.routedBodies, ['Attachments: photo']);
});

// --- Full stack: bridge -> port -> service -> Telegram send -------------------

test('a /work message produces a Telegram proposal with inline actions', async () => {
  const sends: Array<{ text: string; buttons: string[]; chatId: string | null }> = [];
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const relayLog: RecordedCall[] = [];
  const relay = createRecordingRelay(relayLog);

  const outbox = createTransportWorkOutbox({
    send: async (row) => {
      sends.push({
        text: row.payload.text,
        buttons: row.payload.actions.map((action) => action.label),
        chatId: row.externalConversationRef,
      });
      return { ok: true, externalMessageRef: `tg-${sends.length}` };
    },
  });
  const service = createWorkGoldenPathService({ coreStore, outbox });
  const readiness = evaluateTransportWorkReadiness({
    bindingEnabled: true,
    bindingHealthy: true,
    ownerAuthorized: true,
    boundCatId: 'actor-cat',
    executionTargetId: 'claude:opus',
    capabilityProfileResolved: true,
    workspacePath: '/tmp/bridge-workspace',
    permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
    deliveryMode: 'commit_only',
    deliveryGates: [],
    backgroundServiceAvailable: true,
  });

  const port = createTelegramGoldenPathPort({
    service,
    resolveContext: async () => ({
      readiness,
      toolScope: 'broad_write',
      ownerActorId: (await coreStore.readCore()).ownerProfile.actorId,
      targetLabel: 'bridge-workspace',
      projectId: null,
      workspacePath: '/tmp/bridge-workspace',
      deliveryMode: 'commit_only',
      deliveryGates: [],
      acceptanceCriteria: ['CHANGELOG.md contains a 0.1.21 section'],
      openQuestion: null,
    }),
  });

  await bridgeTelegramWebhookToRoom({
    update: workUpdate('/work Add a changelog entry for 0.1.21'),
    receipt: acceptedReceipt(),
    context: relayContext(),
    roomBridge: createChatRoomBridgeSpy(relayLog),
    memoryService,
    runtimeClient,
    telegramRelay: relay,
    goldenPath: port,
  });

  assert.equal(sends.length, 2, 'an acknowledgement and a scope proposal are sent');
  const proposal = sends[1];
  assert.equal(proposal.chatId, CHAT_ID, 'delivery targets the originating chat (FR-43)');
  assert.deepEqual(proposal.buttons, ['Start work', 'Cancel']);
  assert.ok(proposal.text.includes('bridge-workspace'));
  assert.ok(proposal.text.includes('Commit only'));
  assert.ok(
    !proposal.text.includes('/tmp/bridge-workspace'),
    'the proposal names the target by label, never by local path (FR-44)',
  );

  const core = await coreStore.readCore();
  assert.equal(core.workItems.length, 1, 'one durable Work Item exists after intake');
  assert.equal(core.runs.length, 0, 'nothing executes before the owner confirms (FR-19)');
});

test('an unauthorized Telegram user is told why, and no work item is created (FR-1)', async () => {
  const sends: string[] = [];
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const relayLog: RecordedCall[] = [];

  const outbox = createTransportWorkOutbox({
    send: async (row) => {
      sends.push(row.payload.text);
      return { ok: true, externalMessageRef: 'tg-1' };
    },
  });
  const service = createWorkGoldenPathService({ coreStore, outbox });
  const port = createTelegramGoldenPathPort({
    service,
    resolveContext: async () => ({
      toolScope: 'broad_write',
      // The realistic default: no owner allowlist has been configured yet.
      readiness: evaluateTransportWorkReadiness({
        bindingEnabled: true,
        bindingHealthy: true,
        ownerAuthorized: false,
        boundCatId: 'actor-cat',
        executionTargetId: 'claude:opus',
        capabilityProfileResolved: true,
        workspacePath: '/tmp/bridge-workspace',
        permission: { toolScope: 'narrow_write', sufficient: true, reasons: [] },
        deliveryMode: 'commit_only',
        deliveryGates: [],
        backgroundServiceAvailable: true,
      }),
      ownerActorId: (await coreStore.readCore()).ownerProfile.actorId,
      targetLabel: 'bridge-workspace',
      projectId: null,
      workspacePath: '/tmp/bridge-workspace',
      deliveryMode: 'commit_only',
      deliveryGates: [],
      acceptanceCriteria: [],
      openQuestion: null,
    }),
  });

  await bridgeTelegramWebhookToRoom({
    update: workUpdate('/work do something privileged'),
    receipt: acceptedReceipt(),
    context: relayContext(),
    roomBridge: createChatRoomBridgeSpy(relayLog),
    memoryService,
    runtimeClient,
    telegramRelay: createRecordingRelay(relayLog),
    goldenPath: port,
  });

  assert.equal(sends.length, 1);
  assert.ok(sends[0].includes('cannot accept this work yet'));
  assert.ok(sends[0].includes('not the authorized owner'));
  const core = await coreStore.readCore();
  assert.equal(core.workItems.length, 0, 'an unauthorized request creates no durable work');
});
