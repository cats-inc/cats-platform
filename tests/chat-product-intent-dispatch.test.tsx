import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldBridgeTelegramProductIntentCommand } from '../src/server/telegramProductIntentCommands.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  createChannel,
  requireChannel,
} from '../src/products/chat/state/model/index.ts';
import {
  beginChannelMessageDispatch,
  routeChannelMessage,
} from '../src/products/chat/state/runtime-dispatch/routing.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import {
  parseProviderCapabilityBootstrapConfigDocument,
  type ProviderCapabilityBootstrapConfig,
} from '../src/platform/supervision/index.ts';

function runtimeStub(onClose?: () => void): RuntimeClient {
  return {
    async closeSession() {
      onClose?.();
    },
  } as RuntimeClient;
}

function runtimeReplyStub(reply: string): RuntimeClient & {
  sentMessages: Array<{
    sessionId: string;
    content: string;
    input?: { instructions?: string | null };
  }>;
} {
  let nextSession = 1;
  const sentMessages: Array<{
    sessionId: string;
    content: string;
    input?: { instructions?: string | null };
  }> = [];
  return {
    sentMessages,
    async createSession(input) {
      const sessionId = `session-${nextSession}`;
      nextSession += 1;
      return {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        modelSelection: input.modelSelection ?? null,
        modelResolution: null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage(sessionId, content, input) {
      sentMessages.push({ sessionId, content, input });
      return {
        segments: [{ kind: 'text', text: reply, toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async closeSession() {},
    async observeSession(sessionId) {
      return { session: { id: sessionId, status: 'ready' } };
    },
    async streamSession() {},
  } as RuntimeClient & {
    sentMessages: Array<{
      sessionId: string;
      content: string;
      input?: { instructions?: string | null };
    }>;
  };
}

function fixtureBootstrapConfig(
  initialTreatment: 'strong_agent' | 'weak_worker' = 'strong_agent',
): ProviderCapabilityBootstrapConfig {
  const parsed = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'claude-native-sonnet-strong',
          selector: {
            provider: 'claude',
            instance: 'native',
            model: 'sonnet',
            control: 'default',
          },
          initialTreatment,
          confidenceLevel: 'catalog_only',
          reason: `Fixture direct audience Cat is ${initialTreatment}.`,
        },
      ],
    },
    { observedAt: '2026-05-06T08:00:00.000Z' },
  );

  if (!parsed.config) {
    throw new Error('Expected fixture bootstrap config to parse.');
  }

  return parsed.config;
}

function createDirectState() {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct work intake',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'ConciergeCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );

  return {
    state,
    channelId: state.selectedChannelId,
  };
}

test('beginChannelMessageDispatch records direct product intent and starts chat-only Concierge dispatch', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  let closeSessionCalls = 0;

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(() => {
      closeSessionCalls += 1;
    }),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const channel = requireChannel(begun.state, channelId);
  const [userMessage, ackMessage] = channel.messages.slice(-2);
  const productIntentMetadata = userMessage?.metadata.productIntentCommand as
    | { command?: unknown; source?: unknown }
    | undefined;
  const postureChange = ackMessage?.metadata.directSlashModePostureChange as
    | {
        command?: unknown;
        previousPosture?: unknown;
        posture?: unknown;
        changed?: unknown;
        sourceTransport?: unknown;
        sourceChannelId?: unknown;
        audienceCatId?: unknown;
        capabilityProfileKind?: unknown;
      }
    | undefined;
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: {
          workItemId?: unknown;
          targetProduct?: unknown;
          establishedBySegmentId?: unknown;
        };
      }
    | undefined;
  const core = await store.readCore();
  const segment = core.segments.find((candidate) =>
    candidate.metadata.event === 'product_intent_posture_changed');
  const segmentPostureChange = segment?.metadata.directSlashModePostureChange as
    | { posture?: unknown; sourceChannelId?: unknown }
    | undefined;
  const segmentDirectSlashMode = segment?.metadata.directSlashMode as
    | {
        activeAnchor?: {
          workItemId?: unknown;
          targetProduct?: unknown;
          establishedBySegmentId?: unknown;
        };
      }
    | undefined;
  const directWorkItems = core.workItems.filter((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const directWorkItem = directWorkItems[0];
  const directWorkItemIntake = directWorkItem?.metadata.directSlashModeIntake as
    | {
        targetProduct?: unknown;
        source?: {
          channelId?: unknown;
          conversationId?: unknown;
          commandSegmentId?: unknown;
          transport?: unknown;
        };
        audience?: {
          catId?: unknown;
          capabilityProfileKind?: unknown;
        };
        draft?: {
          goal?: unknown;
          successCriteria?: unknown;
          outOfScope?: unknown;
          openQuestions?: unknown;
          proposedNextAction?: unknown;
        };
      }
    | undefined;

  assert.notEqual(begun.preparedTurn, null);
  assert.deepEqual(begun.results, []);
  assert.equal(closeSessionCalls, 0);
  assert.equal(begun.preparedTurn?.userMessage.id, userMessage?.id);
  assert.equal(begun.preparedTurn?.userMessage.body, 'clarify the MVP');
  assert.equal(
    (begun.preparedTurn?.userMessage.metadata.directSlashModeIntakeRef as
      | { workItemId?: unknown }
      | undefined)?.workItemId,
    directWorkItem?.id,
  );
  assert.equal(
    (userMessage?.metadata.directSlashModeIntakeRef as
      | { workItemId?: unknown }
      | undefined)?.workItemId,
    directWorkItem?.id,
  );
  assert.equal(userMessage?.metadata.productIntentLocale, 'en');
  assert.equal(userMessage?.body, '/work clarify the MVP');
  assert.equal(productIntentMetadata?.command, 'work');
  assert.equal(productIntentMetadata?.source, 'web');
  assert.equal(ackMessage?.senderKind, 'system');
  assert.equal(ackMessage?.metadata.event, 'product_intent_posture_changed');
  assert.equal(ackMessage?.metadata.accepted, true);
  assert.match(ackMessage?.body ?? '', /^Work mode is active\./u);
  assert.equal(postureChange?.command, 'work');
  assert.equal(postureChange?.previousPosture, null);
  assert.equal(postureChange?.posture, 'work');
  assert.equal(postureChange?.changed, true);
  assert.equal(postureChange?.sourceTransport, 'web');
  assert.equal(postureChange?.sourceChannelId, channelId);
  assert.equal(postureChange?.audienceCatId, state.cats[0]?.id);
  assert.equal(postureChange?.capabilityProfileKind, 'strong_agent');
  assert.equal(segment?.kind, 'system');
  assert.equal(segment?.status, 'complete');
  assert.equal(segment?.metadata.sourceMessageId, userMessage?.id);
  assert.equal(segment?.metadata.activeProductPosture, 'work');
  assert.equal(segmentPostureChange?.posture, 'work');
  assert.equal(segmentPostureChange?.sourceChannelId, channelId);
  assert.equal(directSlashMode?.activeAnchor?.workItemId, directWorkItem?.id);
  assert.equal(directSlashMode?.activeAnchor?.targetProduct, 'work');
  assert.equal(segmentDirectSlashMode?.activeAnchor?.workItemId, directWorkItem?.id);
  assert.equal(segmentDirectSlashMode?.activeAnchor?.establishedBySegmentId, segment?.id);
  assert.equal(directWorkItems.length, 1);
  assert.equal(directWorkItem?.status, 'draft');
  assert.equal(directWorkItem?.conversationId, segment?.conversationId);
  assert.deepEqual(directWorkItem?.assignedActorIds, [`actor-cat-${state.cats[0]?.id}`]);
  assert.equal(directWorkItemIntake?.targetProduct, 'work');
  assert.equal(directWorkItemIntake?.source?.channelId, channelId);
  assert.equal(directWorkItemIntake?.source?.commandSegmentId, segment?.id);
  assert.equal(directWorkItemIntake?.source?.transport, 'web');
  assert.equal(directWorkItemIntake?.audience?.catId, state.cats[0]?.id);
  assert.equal(directWorkItemIntake?.audience?.capabilityProfileKind, 'strong_agent');
  assert.equal(directWorkItemIntake?.draft?.goal, 'clarify the MVP');
  const draftMetadata = directWorkItemIntake?.draft as Record<string, unknown> | undefined;
  const draftLocalization = draftMetadata?.localization as { locale?: unknown } | undefined;
  assert.equal(
    draftMetadata?.placeholder,
    true,
  );
  assert.equal(draftLocalization?.locale, 'en');
  assert.equal(Array.isArray(directWorkItemIntake?.draft?.successCriteria), true);
  assert.equal((directWorkItemIntake?.draft?.successCriteria as unknown[] | undefined)?.length, 1);
  assert.equal(Array.isArray(directWorkItemIntake?.draft?.outOfScope), true);
  assert.equal((directWorkItemIntake?.draft?.outOfScope as unknown[] | undefined)?.length, 1);
  assert.equal(Array.isArray(directWorkItemIntake?.draft?.openQuestions), true);
  assert.equal((directWorkItemIntake?.draft?.openQuestions as unknown[] | undefined)?.length, 1);
  assert.equal(directWorkItemIntake?.draft?.proposedNextAction, 'clarify');
});

test('routeChannelMessage sends the first strong product-intent command to the same Cat', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('What outcome should this work produce first?');

  const dispatched = await routeChannelMessage(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const channel = requireChannel(dispatched.state, channelId);
  const ackMessage = channel.messages.find((message) =>
    message.metadata.event === 'product_intent_posture_changed');
  const assistantMessage = channel.messages.at(-1);

  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.match(runtimeClient.sentMessages[0]?.content ?? '', /clarify the MVP/u);
  assert.match(
    runtimeClient.sentMessages[0]?.input?.instructions ?? '',
    /Direct slash-mode Work intake is active/u,
  );
  assert.equal(ackMessage?.senderKind, 'system');
  assert.equal(assistantMessage?.senderKind, 'agent');
  assert.equal(assistantMessage?.senderName, 'ConciergeCat');
  assert.equal(assistantMessage?.body, 'What outcome should this work produce first?');
  assert.equal(dispatched.results.length, 1);
});

test('beginChannelMessageDispatch records weak direct audience capability outcome', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig('weak_worker'),
    },
  );

  const ackMessage = requireChannel(begun.state, channelId).messages.at(-1);
  const postureChange = ackMessage?.metadata.directSlashModePostureChange as
    | { capabilityProfileKind?: unknown }
    | undefined;
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        humanGate?: {
          kind?: unknown;
          capabilityProfileKind?: unknown;
          targetProduct?: unknown;
          draftSummary?: unknown;
          suggestedActions?: unknown;
        };
      }
    | undefined;
  const core = await store.readCore();

  assert.match(ackMessage?.body ?? '', /^Work mode is active\./u);
  assert.equal(postureChange?.capabilityProfileKind, 'weak_worker');
  assert.equal(directSlashMode?.humanGate?.kind, 'human_gate_required');
  assert.equal(directSlashMode?.humanGate?.capabilityProfileKind, 'weak_worker');
  assert.equal(directSlashMode?.humanGate?.targetProduct, 'work');
  assert.equal(directSlashMode?.humanGate?.draftSummary, 'clarify the MVP');
  assert.deepEqual(
    (directSlashMode?.humanGate?.suggestedActions as Array<{
      kind?: unknown;
      path?: unknown;
    }> | undefined)?.map((action) => ({
      kind: action.kind,
      path: action.path,
    })),
    [
      {
        kind: 'continue_clarifying',
        path: undefined,
      },
      {
        kind: 'open_work_items',
        path: '/work/work-items',
      },
      {
        kind: 'switch_cat',
        path: undefined,
      },
    ],
  );
  assert.match(ackMessage?.choices?.[0]?.question ?? '', /next step/u);
  assert.equal(ackMessage?.choices?.[0]?.allowSkip, true);
  assert.deepEqual(
    ackMessage?.choices?.[0]?.options.map((option) => ({
      id: option.id,
      description: option.description,
      style: option.style,
    })),
    [
      {
        id: 'continue_clarifying',
        description: undefined,
        style: 'secondary',
      },
      {
        id: 'open_work_items',
        description: '/work/work-items',
        style: 'primary',
      },
      {
        id: 'switch_cat',
        description: undefined,
        style: 'secondary',
      },
    ],
  );
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('beginChannelMessageDispatch localizes direct product-intent acknowledgements and drafts', async () => {
  const { state, channelId } = createDirectState();
  requireChannel(state, channelId).language = 'zh-TW';
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const ackMessage = requireChannel(begun.state, channelId).messages.at(-1);
  const core = await store.readCore();
  const directWorkItem = core.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | { draft?: { localization?: { locale?: unknown } } }
    | undefined;

  assert.match(ackMessage?.body ?? '', /^Work 模式已啟用/u);
  assert.match(begun.preparedTurn?.userMessage.body ?? '', /切換到 Work 模式/u);
  assert.match(directWorkItem?.summary ?? '', /直接對話/u);
  assert.equal(intake?.draft?.localization?.locale, 'zh-TW');
});

test('beginChannelMessageDispatch prefers Telegram transport locale for first product-intent turn', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      transport: 'telegram',
      transportLocale: 'zh-Hant',
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const channel = requireChannel(begun.state, channelId);
  const userMessage = channel.messages.find((message) => message.senderKind === 'user');
  const ackMessage = channel.messages.at(-1);
  const core = await store.readCore();
  const directWorkItem = core.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | { draft?: { localization?: { locale?: unknown } } }
    | undefined;

  assert.match(ackMessage?.body ?? '', /^Work 模式已啟用/u);
  assert.equal(userMessage?.metadata.productIntentLocale, 'zh-TW');
  assert.match(begun.preparedTurn?.userMessage.body ?? '', /切換到 Work 模式/u);
  assert.equal(intake?.draft?.localization?.locale, 'zh-TW');
});

test('beginChannelMessageDispatch records unknown direct audience capability outcome', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
    },
  );

  const ackMessage = requireChannel(begun.state, channelId).messages.at(-1);
  const postureChange = ackMessage?.metadata.directSlashModePostureChange as
    | { capabilityProfileKind?: unknown }
    | undefined;
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | { humanGate?: { kind?: unknown; capabilityProfileKind?: unknown; suggestedActions?: unknown } }
    | undefined;
  const core = await store.readCore();

  assert.match(ackMessage?.body ?? '', /^Work mode is active\./u);
  assert.equal(postureChange?.capabilityProfileKind, 'unknown');
  assert.equal(directSlashMode?.humanGate?.kind, 'human_gate_required');
  assert.equal(directSlashMode?.humanGate?.capabilityProfileKind, 'unknown');
  assert.ok(Array.isArray(directSlashMode?.humanGate?.suggestedActions));
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('beginChannelMessageDispatch creates code-target Work Item anchors for strong direct Cats', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/code add command parsing tests',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const ackMessage = requireChannel(begun.state, channelId).messages.at(-1);
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: {
          workItemId?: unknown;
          targetProduct?: unknown;
        };
      }
    | undefined;
  const core = await store.readCore();
  const directWorkItems = core.workItems.filter((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const directWorkItem = directWorkItems[0];
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | {
        targetProduct?: unknown;
        command?: { name?: unknown; posture?: unknown };
      }
    | undefined;
  const planning = directWorkItem?.metadata.planning as
    | { productHint?: unknown }
    | undefined;

  assert.match(ackMessage?.body ?? '', /^Code mode is active\./u);
  assert.equal(directSlashMode?.activeAnchor?.targetProduct, 'code');
  assert.equal(directSlashMode?.activeAnchor?.workItemId, directWorkItem?.id);
  assert.equal(directWorkItems.length, 1);
  assert.equal(directWorkItem?.title, 'add command parsing tests');
  assert.equal(intake?.targetProduct, 'code');
  assert.equal(intake?.command?.name, 'code');
  assert.equal(intake?.command?.posture, 'code');
  assert.equal(planning?.productHint, 'code');
});

test('beginChannelMessageDispatch supersedes active draft anchors when product posture switches', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const first = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );
  const coreAfterWork = await store.readCore();
  const firstWorkItem = coreAfterWork.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  if (!firstWorkItem) {
    throw new Error('Expected first direct slash-mode Work Item.');
  }

  const second = await beginChannelMessageDispatch(
    first.state,
    channelId,
    {
      body: '/code add command parsing tests',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:02:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const ackMessage = requireChannel(second.state, channelId).messages.at(-1);
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: {
          workItemId?: unknown;
          targetProduct?: unknown;
          establishedBySegmentId?: unknown;
        };
        clearReason?: unknown;
        clearedActiveAnchor?: { workItemId?: unknown };
      }
    | undefined;
  const core = await store.readCore();
  const directWorkItems = core.workItems.filter((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const oldWorkItem = core.workItems.find((candidate) => candidate.id === firstWorkItem.id);
  const newWorkItem = directWorkItems.find((candidate) => candidate.id !== firstWorkItem.id);
  const supersededBy = oldWorkItem?.metadata.directSlashModeSupersededBy as
    | { workItemId?: unknown; segmentId?: unknown }
    | undefined;

  assert.equal(directSlashMode?.clearReason, 'anchor_superseded');
  assert.equal(directSlashMode?.clearedActiveAnchor?.workItemId, firstWorkItem.id);
  assert.equal(directSlashMode?.activeAnchor?.workItemId, newWorkItem?.id);
  assert.equal(directSlashMode?.activeAnchor?.targetProduct, 'code');
  assert.equal(directWorkItems.length, 2);
  assert.equal(oldWorkItem?.status, 'cancelled');
  assert.equal(newWorkItem?.status, 'draft');
  assert.equal(supersededBy?.workItemId, newWorkItem?.id);
  assert.equal(supersededBy?.segmentId, directSlashMode?.activeAnchor?.establishedBySegmentId);
});

test('beginChannelMessageDispatch clears active anchors on product switch without replacement', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const first = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );
  const coreAfterWork = await store.readCore();
  const firstWorkItem = coreAfterWork.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  if (!firstWorkItem) {
    throw new Error('Expected first direct slash-mode Work Item.');
  }

  const second = await beginChannelMessageDispatch(
    first.state,
    channelId,
    {
      body: '/code add command parsing tests',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:02:00.000Z'),
    {
      chatStore: store,
    },
  );

  const ackMessage = requireChannel(second.state, channelId).messages.at(-1);
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: unknown;
        clearReason?: unknown;
        clearedActiveAnchor?: { workItemId?: unknown };
        humanGate?: { kind?: unknown; capabilityProfileKind?: unknown };
      }
    | undefined;
  const core = await store.readCore();
  const abandonedWorkItem = core.workItems.find((candidate) => candidate.id === firstWorkItem.id);
  const abandonedBy = abandonedWorkItem?.metadata.directSlashModeAbandonedBy as
    | { reason?: unknown; segmentId?: unknown }
    | undefined;

  assert.equal(directSlashMode?.activeAnchor, null);
  assert.equal(directSlashMode?.clearReason, 'posture_changed');
  assert.equal(directSlashMode?.clearedActiveAnchor?.workItemId, firstWorkItem.id);
  assert.equal(directSlashMode?.humanGate?.kind, 'human_gate_required');
  assert.equal(directSlashMode?.humanGate?.capabilityProfileKind, 'unknown');
  assert.equal(abandonedWorkItem?.status, 'cancelled');
  assert.equal(abandonedBy?.reason, 'posture_abandoned');
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    1,
  );
});

test('beginChannelMessageDispatch rejects product intent posture changes outside direct lanes', async () => {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Group room',
      topic: 'Group work intake',
      originSurface: 'chat',
      roomMode: 'chat_channel',
    },
    now,
  );
  const channelId = state.selectedChannelId;

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/code implement the change',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
  );

  const channel = requireChannel(begun.state, channelId);
  const ackMessage = channel.messages.at(-1);

  assert.equal(begun.preparedTurn, null);
  assert.equal(ackMessage?.senderKind, 'system');
  assert.equal(ackMessage?.metadata.event, 'product_intent_unsupported_context');
  assert.equal(ackMessage?.metadata.accepted, false);
  assert.equal(ackMessage?.metadata.directSlashModePostureChange, undefined);
});

test('beginChannelMessageDispatch rejects direct product intent without one audience Cat', async () => {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Empty direct lane',
      topic: 'Direct work intake',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
    },
    now,
  );
  const channelId = state.selectedChannelId;

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify this',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
  );

  const ackMessage = requireChannel(begun.state, channelId).messages.at(-1);

  assert.equal(begun.preparedTurn, null);
  assert.equal(ackMessage?.metadata.event, 'product_intent_unsupported_context');
  assert.equal(ackMessage?.metadata.rejectionReason, 'missing_direct_audience_cat');
  assert.equal(ackMessage?.metadata.directSlashModePostureChange, undefined);
});

test('beginChannelMessageDispatch rejects direct product intent with multiple audience Cats', async () => {
  const { state, channelId } = createDirectState();
  const channel = requireChannel(state, channelId);
  const existingAssignment = channel.catAssignments[0];
  if (!existingAssignment) {
    throw new Error('Expected direct lane cat assignment.');
  }
  channel.catAssignments.push({
    ...structuredClone(existingAssignment),
    participantId: 'second-direct-cat',
    catId: 'second-direct-cat',
    sourceRefId: 'second-direct-cat',
    name: 'SecondDirectCat',
  });

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify this',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
  );

  const ackMessage = requireChannel(begun.state, channelId).messages.at(-1);

  assert.equal(begun.preparedTurn, null);
  assert.equal(ackMessage?.metadata.event, 'product_intent_unsupported_context');
  assert.equal(ackMessage?.metadata.rejectionReason, 'missing_direct_audience_cat');
  assert.equal(ackMessage?.metadata.directSlashModePostureChange, undefined);
});

test('beginChannelMessageDispatch marks repeated product posture commands as unchanged', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const first = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );
  const second = await beginChannelMessageDispatch(
    first.state,
    channelId,
    {
      body: '/work',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:02:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const ackMessage = requireChannel(second.state, channelId).messages.at(-1);
  const postureChange = ackMessage?.metadata.directSlashModePostureChange as
    | { previousPosture?: unknown; posture?: unknown; changed?: unknown }
    | undefined;
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | { activeAnchor?: unknown }
    | undefined;
  const core = await store.readCore();

  assert.equal(postureChange?.previousPosture, 'work');
  assert.equal(postureChange?.posture, 'work');
  assert.equal(postureChange?.changed, false);
  assert.equal(directSlashMode?.activeAnchor, undefined);
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    1,
  );
});

test('beginChannelMessageDispatch clears active slash-mode anchors on chat posture', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const first = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );
  const coreAfterWork = await store.readCore();
  const firstWorkItem = coreAfterWork.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));

  const second = await beginChannelMessageDispatch(
    first.state,
    channelId,
    {
      body: '/chat',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:02:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const ackMessage = requireChannel(second.state, channelId).messages.at(-1);
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: unknown;
        clearReason?: unknown;
        clearedActiveAnchor?: { workItemId?: unknown };
      }
    | undefined;
  const core = await store.readCore();
  const abandonedWorkItem = core.workItems.find((candidate) => candidate.id === firstWorkItem?.id);
  const abandonedBy = abandonedWorkItem?.metadata.directSlashModeAbandonedBy as
    | { reason?: unknown }
    | undefined;

  assert.equal(directSlashMode?.activeAnchor, null);
  assert.equal(directSlashMode?.clearReason, 'chat_posture');
  assert.equal(directSlashMode?.clearedActiveAnchor?.workItemId, firstWorkItem?.id);
  assert.equal(abandonedWorkItem?.status, 'cancelled');
  assert.equal(abandonedBy?.reason, 'posture_abandoned');
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    1,
  );
});

test('beginChannelMessageDispatch starts fresh slash-mode intake after terminal Work Item', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const first = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );
  const coreAfterWork = await store.readCore();
  const firstWorkItem = coreAfterWork.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  if (!firstWorkItem) {
    throw new Error('Expected first direct slash-mode Work Item.');
  }
  await store.updateCore((core) => ({
    ...core,
    workItems: core.workItems.map((candidate) =>
      candidate.id === firstWorkItem.id
        ? { ...candidate, status: 'completed' as const }
        : candidate),
  }));

  const second = await beginChannelMessageDispatch(
    first.state,
    channelId,
    {
      body: '/work clarify follow-up',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:02:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const ackMessage = requireChannel(second.state, channelId).messages.at(-1);
  const postureChange = ackMessage?.metadata.directSlashModePostureChange as
    | { changed?: unknown }
    | undefined;
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: { workItemId?: unknown };
        clearReason?: unknown;
        clearedActiveAnchor?: { workItemId?: unknown };
      }
    | undefined;
  const core = await store.readCore();
  const directWorkItems = core.workItems.filter((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));

  assert.equal(postureChange?.changed, false);
  assert.equal(directSlashMode?.clearReason, 'work_item_terminal');
  assert.equal(directSlashMode?.clearedActiveAnchor?.workItemId, firstWorkItem.id);
  assert.notEqual(directSlashMode?.activeAnchor?.workItemId, firstWorkItem.id);
  assert.equal(directWorkItems.length, 2);
});

test('Telegram product intent slash commands bridge into chat instead of transport command handling', () => {
  assert.equal(shouldBridgeTelegramProductIntentCommand('/work@CatsBot clarify scope'), true);
  assert.equal(shouldBridgeTelegramProductIntentCommand('/Work@CatsBot clarify scope'), true);
  assert.equal(shouldBridgeTelegramProductIntentCommand('/help'), false);
});
