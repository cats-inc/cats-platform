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
  beginChannelMessageRetryDispatch,
  routeChannelMessage,
} from '../src/products/chat/state/runtime-dispatch/routing.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import {
  parseProviderCapabilityBootstrapConfigDocument,
  type ProviderCapabilityBootstrapConfig,
} from '../src/platform/supervision/index.ts';
import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  type ProviderAgentBoundedObservation,
} from '../src/platform/orchestration/index.ts';
import type {
  ChatMessage,
  ChatState,
} from '../src/products/chat/api/contracts.ts';
import type { RuntimeTransportContext } from '../src/products/chat/state/runtimeTargeting.ts';
import type {
  ImplicitProductIntentCandidateMetadata,
  ImplicitProductIntentCandidateTransitionMetadata,
} from '../src/products/chat/shared/implicitProductIntent.ts';
import {
  IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN,
} from '../src/products/chat/shared/implicitProductIntent.ts';
import {
  CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN,
  CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
  type CatProductIntentProposalMetadata,
  type CatProductIntentProposalTransitionMetadata,
} from '../src/products/chat/shared/catProductIntentProposal.ts';
import { buildWorkWorkItemListProjection } from '../src/products/work/api/projection.ts';
import { buildTelegramImplicitProductIntentReplyMarkup } from '../src/platform/transports/telegram/bridge.ts';

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

function buildSingleChoiceResponse(
  sourceMessage: { id: string; choices?: Array<{ question: string }> },
  selectedOptionId: string,
  submittedAt = '2026-05-06T08:03:00.000Z',
) {
  const choice = sourceMessage.choices?.[0];
  if (!choice) {
    throw new Error('Expected source message choices.');
  }
  return {
    sourceMessageId: sourceMessage.id,
    status: 'submitted' as const,
    submittedAt,
    answers: [
      {
        question: choice.question,
        selectedOptionIds: [selectedOptionId],
      },
    ],
  };
}

function observationExposesProposalTool(
  observation: ProviderAgentBoundedObservation | null,
): boolean {
  return observation?.availableTools.some((tool) =>
    tool.manifest.name === CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME) ?? false;
}

async function captureConsoleWarns<T>(callback: () => Promise<T>): Promise<{
  result: T;
  warnings: unknown[][];
}> {
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    const result = await callback();
    return { result, warnings };
  } finally {
    console.warn = originalWarn;
  }
}

async function suggestImplicitProductIntentCandidate(input: {
  state: ChatState;
  channelId: string;
  store: MemoryChatStore;
  body: string;
  now: Date;
  transport?: RuntimeTransportContext;
  transportLocale?: string | null;
}): Promise<{ state: ChatState; candidateMessage: ChatMessage }> {
  const routed = await routeChannelMessage(
    input.state,
    input.channelId,
    {
      body: input.body,
      senderName: 'Kenneth',
    },
    runtimeReplyStub('I can discuss that.'),
    input.now,
    {
      chatStore: input.store,
      transport: input.transport,
      transportLocale: input.transportLocale,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(routed.state, input.channelId).messages
    .filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_suggested'
      && message.metadata.sourceMessageId)
    .at(-1);
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }

  return {
    state: routed.state,
    candidateMessage,
  };
}

async function suggestCatProductIntentProposal(input: {
  state: ChatState;
  channelId: string;
  store: MemoryChatStore;
  body: string;
  now: Date;
  targetProduct?: 'work' | 'code';
  summary?: string;
}): Promise<{ state: ChatState; proposalMessage: ChatMessage }> {
  const summary = input.summary ?? 'Plan onboarding requirements';
  const routed = await routeChannelMessage(
    input.state,
    input.channelId,
    {
      body: input.body,
      senderName: 'Kenneth',
    },
    runtimeReplyStub('I can discuss that.'),
    input.now,
    {
      chatStore: input.store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
      providerAgentDecisionRequester: async () => ({
        contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
        kind: 'tool_request',
        decisionId: `decision-propose-${input.targetProduct ?? 'work'}-1`,
        confidence: 'high',
        toolName: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
        target: {
          kind: 'worker_tool',
          toolName: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
        },
        input: {
          targetProduct: input.targetProduct ?? 'work',
          summary,
          rationale: 'The owner is asking for product intake.',
        },
        rationaleSummary: 'Ask the owner to confirm product intake.',
      }),
    },
  );
  const proposalMessage = requireChannel(routed.state, input.channelId).messages
    .find((message) => message.metadata.event === 'cat_product_intent_proposal_created');
  if (!proposalMessage) {
    throw new Error('Expected Cat product-intent proposal message.');
  }

  return {
    state: routed.state,
    proposalMessage,
  };
}

async function confirmImplicitProductIntentCandidate(input: {
  state: ChatState;
  channelId: string;
  store: MemoryChatStore;
  candidateMessage: ChatMessage;
  selectedOptionId: 'confirm_work' | 'confirm_code';
  now: Date;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
}): Promise<BegunImplicitConfirmation> {
  const begun = await beginChannelMessageDispatch(
    input.state,
    input.channelId,
    {
      body: 'Confirm',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(
        input.candidateMessage,
        input.selectedOptionId,
        input.now.toISOString(),
      ),
    },
    runtimeStub(),
    input.now,
    {
      chatStore: input.store,
      providerCapabilityBootstrapConfig:
        input.providerCapabilityBootstrapConfig === undefined
          ? fixtureBootstrapConfig()
          : input.providerCapabilityBootstrapConfig,
    },
  );

  return begun;
}

interface BegunImplicitConfirmation {
  state: ChatState;
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
  const productIntent = ackMessage?.metadata.productIntent as
    | {
        activeAnchor?: {
          workItemId?: unknown;
          targetProduct?: unknown;
          sourceContextRef?: {
            sourceProduct?: unknown;
            presetId?: unknown;
            channelId?: unknown;
            conversationId?: unknown;
          };
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
  const segmentProductIntent = segment?.metadata.productIntent as
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
  const productIntentIntake = directWorkItem?.metadata.productIntentIntake as
    | {
        targetProduct?: unknown;
        sourceContext?: {
          sourceProduct?: unknown;
          presetId?: unknown;
          source?: {
            channelId?: unknown;
            conversationId?: unknown;
            turnId?: unknown;
            segmentId?: unknown;
          };
          originSurface?: unknown;
          transport?: unknown;
          eligibleCats?: Array<{
            catId?: unknown;
            actorId?: unknown;
            capabilityProfileKind?: unknown;
          }>;
        };
        command?: {
          sourceKind?: unknown;
          name?: unknown;
          argumentText?: unknown;
          rawCommandToken?: unknown;
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
  const workItemProductIntent = directWorkItem?.metadata.productIntent as
    | {
        activeAnchor?: {
          workItemId?: unknown;
          targetProduct?: unknown;
          sourceContextRef?: {
            channelId?: unknown;
            conversationId?: unknown;
          };
        };
      }
    | undefined;
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
    (begun.preparedTurn?.userMessage.metadata.productIntentIntakeRef as
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
  assert.equal(userMessage?.metadata.productIntentArgumentProvided, true);
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
  assert.equal(productIntent?.activeAnchor?.workItemId, directWorkItem?.id);
  assert.equal(productIntent?.activeAnchor?.targetProduct, 'work');
  assert.equal(productIntent?.activeAnchor?.sourceContextRef?.sourceProduct, 'chat');
  assert.equal(productIntent?.activeAnchor?.sourceContextRef?.presetId, 'direct');
  assert.equal(productIntent?.activeAnchor?.sourceContextRef?.channelId, channelId);
  assert.equal(segmentDirectSlashMode?.activeAnchor?.workItemId, directWorkItem?.id);
  assert.equal(segmentDirectSlashMode?.activeAnchor?.establishedBySegmentId, segment?.id);
  assert.equal(segmentProductIntent?.activeAnchor?.workItemId, directWorkItem?.id);
  assert.equal(segmentProductIntent?.activeAnchor?.establishedBySegmentId, segment?.id);
  assert.equal(directWorkItems.length, 1);
  assert.equal(directWorkItem?.status, 'draft');
  assert.equal(directWorkItem?.conversationId, segment?.conversationId);
  assert.deepEqual(directWorkItem?.assignedActorIds, [`actor-cat-${state.cats[0]?.id}`]);
  assert.equal(productIntentIntake?.targetProduct, 'work');
  assert.equal(productIntentIntake?.sourceContext?.sourceProduct, 'chat');
  assert.equal(productIntentIntake?.sourceContext?.presetId, 'direct');
  assert.equal(productIntentIntake?.sourceContext?.source?.channelId, channelId);
  assert.equal(productIntentIntake?.sourceContext?.source?.conversationId, segment?.conversationId);
  assert.equal(productIntentIntake?.sourceContext?.source?.turnId, segment?.turnId);
  assert.equal(productIntentIntake?.sourceContext?.source?.segmentId, segment?.id);
  assert.equal(productIntentIntake?.sourceContext?.originSurface, 'desktop');
  assert.equal(productIntentIntake?.sourceContext?.transport, 'web');
  assert.equal(productIntentIntake?.sourceContext?.eligibleCats?.[0]?.catId, state.cats[0]?.id);
  assert.equal(
    productIntentIntake?.sourceContext?.eligibleCats?.[0]?.actorId,
    `actor-cat-${state.cats[0]?.id}`,
  );
  assert.equal(
    productIntentIntake?.sourceContext?.eligibleCats?.[0]?.capabilityProfileKind,
    'strong_agent',
  );
  assert.equal(productIntentIntake?.command?.sourceKind, 'explicit_command');
  assert.equal(productIntentIntake?.command?.name, 'work');
  assert.equal(productIntentIntake?.command?.argumentText, 'clarify the MVP');
  assert.equal(productIntentIntake?.command?.rawCommandToken, '/work');
  assert.equal(productIntentIntake?.draft?.goal, 'clarify the MVP');
  assert.equal(productIntentIntake?.draft?.proposedNextAction, 'clarify');
  assert.equal(workItemProductIntent?.activeAnchor?.workItemId, directWorkItem?.id);
  assert.equal(workItemProductIntent?.activeAnchor?.sourceContextRef?.channelId, channelId);
  assert.equal(
    workItemProductIntent?.activeAnchor?.sourceContextRef?.conversationId,
    segment?.conversationId,
  );
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
      naturalProductIntentMode: 'heuristic_prefilter',
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

test('beginChannelMessageDispatch records product intent from single-Cat Code channels', async () => {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Code channel',
      topic: 'Code work intake',
      originSurface: 'code',
      roomMode: 'chat_channel',
      cats: [
        {
          name: 'BuilderCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/code add parser coverage',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(begun.state, channelId);
  const ackMessage = channel.messages.find((message) =>
    message.metadata.event === 'product_intent_posture_changed');
  const core = await store.readCore();
  const workItem = core.workItems.find((candidate) =>
    Boolean(candidate.metadata.productIntentIntake));
  const productIntentIntake = workItem?.metadata.productIntentIntake as
    | {
        targetProduct?: unknown;
        sourceContext?: {
          sourceProduct?: unknown;
          presetId?: unknown;
          source?: {
            channelId?: unknown;
            conversationId?: unknown;
          };
        };
      }
    | undefined;

  assert.notEqual(begun.preparedTurn, null);
  assert.equal(ackMessage?.metadata.accepted, true);
  assert.equal(workItem?.status, 'draft');
  assert.equal(productIntentIntake?.targetProduct, 'code');
  assert.equal(productIntentIntake?.sourceContext?.sourceProduct, 'code');
  assert.equal(productIntentIntake?.sourceContext?.presetId, 'new_code');
  assert.equal(productIntentIntake?.sourceContext?.source?.channelId, channelId);
});

test('beginChannelMessageDispatch suggests implicit candidates while ordinary dispatch proceeds', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(begun.state, channelId);
  const userMessage = channel.messages.find((message) => message.senderKind === 'user');
  const candidateMessage = channel.messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  const candidateMetadata = candidateMessage?.metadata.implicitProductIntentCandidate as
    | ImplicitProductIntentCandidateMetadata
    | undefined;
  const core = await store.readCore();

  assert.notEqual(begun.preparedTurn, null);
  assert.equal(begun.preparedTurn?.userMessage.id, userMessage?.id);
  assert.equal(candidateMessage?.senderKind, 'system');
  assert.match(candidateMessage?.body ?? '', /^This looks like Work\./u);
  assert.equal(candidateMessage?.metadata.sourceMessageId, userMessage?.id);
  assert.equal(candidateMetadata?.event, 'suggested');
  assert.equal(candidateMetadata?.source.messageId, userMessage?.id);
  assert.equal(candidateMetadata?.source.channelId, channelId);
  assert.equal(candidateMetadata?.source.transport, 'web');
  assert.equal(candidateMetadata?.candidate.targetProduct, 'work');
  assert.deepEqual(
    candidateMessage?.choices?.[0]?.options.map((option) => ({
      id: option.id,
      label: option.label,
      style: option.style,
    })),
    [
      {
        id: 'confirm_work',
        label: 'Turn into Work',
        style: 'primary',
      },
      {
        id: 'decline',
        label: 'Keep as chat',
        style: 'secondary',
      },
    ],
  );
  assert.equal(candidateMessage?.choices?.[0]?.question, 'Turn this message into Work intake?');
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('beginChannelMessageDispatch does not suggest implicit candidates when deployment mode is off', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
    },
  );

  const candidateMessage = requireChannel(begun.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');

  assert.equal(candidateMessage, undefined);
  assert.notEqual(begun.preparedTurn, null);
});

test('beginChannelMessageDispatch does not suggest implicit candidates when owner setting is off', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  await store.updateCore((core) => ({
    ...core,
    ownerProfile: {
      ...core.ownerProfile,
      naturalProductIntentProposalsEnabled: false,
    },
  }));

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const candidateMessage = requireChannel(begun.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');

  assert.equal(candidateMessage, undefined);
  assert.notEqual(begun.preparedTurn, null);
});

test('routeChannelMessage records Cat proposal tool requests without durable Work intake', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can help clarify that.');
  let capturedObservation: ProviderAgentBoundedObservation | null = null;

  const routed = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
      providerAgentDecisionRequester: async ({ observation }) => {
        capturedObservation = observation;
        return {
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'tool_request',
          decisionId: 'decision-propose-work-1',
          confidence: 'high',
          toolName: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
          target: {
            kind: 'worker_tool',
            toolName: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
          },
          input: {
            targetProduct: 'work',
            summary: 'Plan onboarding requirements',
            rationale: 'The owner is asking for planning, not casual chat.',
          },
          rationaleSummary: 'Ask the owner to confirm Work intake.',
        };
      },
    },
  );

  const channel = requireChannel(routed.state, channelId);
  const proposalMessage = channel.messages.find((message) =>
    message.metadata.event === 'cat_product_intent_proposal_created');
  const proposal = proposalMessage?.metadata.catProductIntentProposal as
    | CatProductIntentProposalMetadata
    | undefined;
  const core = await store.readCore();

  assert.equal(observationExposesProposalTool(capturedObservation), true);
  assert.equal(
    capturedObservation?.invariants.some((invariant) =>
      invariant.includes('must not be used for casual chat')),
    true,
  );
  assert.equal(
    capturedObservation?.invariants.some((invariant) =>
      invariant.includes('At most one proposeProductIntake')),
    true,
  );
  assert.equal(proposalMessage?.senderKind, 'system');
  assert.equal(proposalMessage?.body, 'Plan onboarding requirements');
  assert.equal(proposal?.version, 2);
  assert.equal(proposal?.event, 'proposed');
  assert.equal(proposal?.proposal.targetProduct, 'work');
  assert.equal(proposal?.proposal.summary, 'Plan onboarding requirements');
  assert.equal(proposal?.source.channelId, channelId);
  assert.equal(proposal?.proposedBy.capabilityProfileKind, 'strong_agent');
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('routeChannelMessage does not synthesize Cat proposals without a tool request', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');

  const routed = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
    },
  );
  const channel = requireChannel(routed.state, channelId);

  assert.equal(
    channel.messages.some((message) =>
      message.metadata.event === 'cat_product_intent_proposal_created'),
    false,
  );
  assert.equal(
    channel.messages.some((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_suggested'),
    false,
  );
});

test('routeChannelMessage does not expose proposal tools in heuristic mode', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  let capturedObservation: ProviderAgentBoundedObservation | null = null;

  await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
      providerAgentDecisionRequester: async ({ observation }) => {
        capturedObservation = observation;
        return null;
      },
    },
  );

  assert.equal(observationExposesProposalTool(capturedObservation), false);
});

test('routeChannelMessage does not expose proposal tools to weak direct Cats', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  let capturedObservation: ProviderAgentBoundedObservation | null = null;

  await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig('weak_worker'),
      naturalProductIntentMode: 'cat_tool',
      providerAgentDecisionRequester: async ({ observation }) => {
        capturedObservation = observation;
        return null;
      },
    },
  );

  assert.equal(observationExposesProposalTool(capturedObservation), false);
});

test('routeChannelMessage does not expose proposal tools to unknown direct Cats', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  let capturedObservation: ProviderAgentBoundedObservation | null = null;

  await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      naturalProductIntentMode: 'cat_tool',
      providerAgentDecisionRequester: async ({ observation }) => {
        capturedObservation = observation;
        return null;
      },
    },
  );

  assert.equal(observationExposesProposalTool(capturedObservation), false);
});

test('routeChannelMessage does not expose proposal tools when owner setting is off', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  await store.updateCore((core) => ({
    ...core,
    ownerProfile: {
      ...core.ownerProfile,
      naturalProductIntentProposalsEnabled: false,
    },
  }));
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  let capturedObservation: ProviderAgentBoundedObservation | null = null;

  await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
      providerAgentDecisionRequester: async ({ observation }) => {
        capturedObservation = observation;
        return null;
      },
    },
  );

  assert.equal(observationExposesProposalTool(capturedObservation), false);
});

test('routeChannelMessage does not expose proposal tools outside direct lanes', async () => {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Group room',
      topic: 'Group product intent',
      originSurface: 'chat',
      entryKind: 'group',
      temporaryParticipants: [
        {
          participantId: 'participant-concierge',
          name: 'ConciergeCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  let capturedObservation: ProviderAgentBoundedObservation | null = null;

  await routeChannelMessage(
    state,
    channelId,
    {
      body: '@ConciergeCat please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
      providerAgentDecisionRequester: async ({ observation }) => {
        capturedObservation = observation;
        return null;
      },
    },
  );

  assert.equal(capturedObservation?.actor.actorRef, 'cat:participant-concierge');
  assert.equal(observationExposesProposalTool(capturedObservation), false);
});

test('beginChannelMessageDispatch confirms Cat proposals through slash-mode intake once', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const initial = await suggestCatProductIntentProposal({
    state,
    channelId,
    store,
    body: 'Please plan the onboarding requirements',
    now: new Date('2026-05-06T08:01:00.000Z'),
    summary: 'Create onboarding plan',
  });
  const proposal = initial.proposalMessage.metadata.catProductIntentProposal as
    | CatProductIntentProposalMetadata
    | undefined;

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Turn into Work',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(initial.proposalMessage, 'confirm_work'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
    },
  );

  const channel = requireChannel(confirmed.state, channelId);
  const choiceMessage = channel.messages.find((message) =>
    message.choiceResponse?.sourceMessageId === initial.proposalMessage.id);
  const transitionMessage = channel.messages.find((message) =>
    message.metadata.event === 'cat_product_intent_proposal_confirmed');
  const transition = transitionMessage?.metadata.catProductIntentProposalTransition as
    | CatProductIntentProposalTransitionMetadata
    | undefined;
  const commandMetadata = choiceMessage?.metadata.productIntentCommand as
    | {
        rawCommandToken?: unknown;
        proposalConfirmed?: unknown;
        originalProposalId?: unknown;
        originalMessageId?: unknown;
        proposedByCatId?: unknown;
      }
    | undefined;
  const core = await store.readCore();
  const directWorkItems = core.workItems.filter((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const directWorkItem = directWorkItems[0];
  const productIntentIntake = directWorkItem?.metadata.productIntentIntake as
    | {
        targetProduct?: unknown;
        command?: {
          sourceKind?: unknown;
          name?: unknown;
          argumentText?: unknown;
          rawCommandToken?: unknown;
          proposalId?: unknown;
          originalMessageId?: unknown;
        };
        draft?: { goal?: unknown };
      }
    | undefined;
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | { draft?: { goal?: unknown }; command?: { name?: unknown } }
    | undefined;

  assert.notEqual(confirmed.preparedTurn, null);
  assert.equal(initial.proposalMessage.choices?.[0]?.options[0]?.id, 'confirm_work');
  assert.equal(confirmed.preparedTurn?.userMessage.body, 'Create onboarding plan');
  assert.equal(commandMetadata?.rawCommandToken, CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN);
  assert.equal(commandMetadata?.proposalConfirmed, true);
  assert.equal(commandMetadata?.originalProposalId, proposal?.proposalId);
  assert.equal(commandMetadata?.originalMessageId, proposal?.source.messageId);
  assert.equal(commandMetadata?.proposedByCatId, proposal?.proposedBy.catId);
  assert.equal(transitionMessage?.body, 'Confirmed Work intake.');
  assert.equal(transition?.event, 'confirmed');
  assert.equal(transition?.confirmedCommand?.argumentText, 'Create onboarding plan');
  assert.equal(transition?.confirmedCommand?.proposedByCatId, proposal?.proposedBy.catId);
  assert.equal(
    transition?.confirmedCommand?.rawCommandToken,
    CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN,
  );
  assert.equal(directWorkItems.length, 1);
  assert.equal(directWorkItem?.status, 'draft');
  assert.equal(productIntentIntake?.targetProduct, 'work');
  assert.equal(productIntentIntake?.command?.sourceKind, 'cat_product_intent_proposal');
  assert.equal(productIntentIntake?.command?.name, 'work');
  assert.equal(productIntentIntake?.command?.argumentText, 'Create onboarding plan');
  assert.equal(productIntentIntake?.command?.rawCommandToken, CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN);
  assert.equal(productIntentIntake?.command?.proposalId, proposal?.proposalId);
  assert.equal(productIntentIntake?.command?.originalMessageId, proposal?.source.messageId);
  assert.equal(productIntentIntake?.draft?.goal, 'Create onboarding plan');
  assert.equal(intake?.draft?.goal, 'Create onboarding plan');
  assert.equal(intake?.command?.name, 'work');

  const duplicate = await beginChannelMessageDispatch(
    confirmed.state,
    channelId,
    {
      body: 'Turn into Work',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(
        initial.proposalMessage,
        'confirm_work',
        '2026-05-06T08:04:00.000Z',
      ),
    },
    runtimeStub(),
    new Date('2026-05-06T08:04:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
    },
  );
  const duplicateCore = await store.readCore();
  const duplicateChannel = requireChannel(duplicate.state, channelId);

  assert.equal(duplicate.preparedTurn, null);
  assert.equal(
    duplicateCore.workItems.filter((candidate) =>
      Boolean(candidate.metadata.directSlashModeIntake)).length,
    1,
  );
  assert.equal(
    duplicateChannel.messages.filter((message) =>
      message.metadata.event === 'cat_product_intent_proposal_confirmed').length,
    1,
  );
});

test('beginChannelMessageDispatch confirms Cat code proposals through slash-mode intake', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const initial = await suggestCatProductIntentProposal({
    state,
    channelId,
    store,
    body: 'Please add parser tests',
    now: new Date('2026-05-06T08:01:00.000Z'),
    targetProduct: 'code',
    summary: 'Add parser tests',
  });

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Turn into Code',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(initial.proposalMessage, 'confirm_code'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
    },
  );

  const channel = requireChannel(confirmed.state, channelId);
  const transitionMessage = channel.messages.find((message) =>
    message.metadata.event === 'cat_product_intent_proposal_confirmed');
  const transition = transitionMessage?.metadata.catProductIntentProposalTransition as
    | CatProductIntentProposalTransitionMetadata
    | undefined;
  const ackMessage = channel.messages.find((message) =>
    message.metadata.event === 'product_intent_posture_changed');
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | { activeAnchor?: { targetProduct?: unknown } }
    | undefined;
  const core = await store.readCore();
  const directWorkItem = core.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const productIntentIntake = directWorkItem?.metadata.productIntentIntake as
    | {
        targetProduct?: unknown;
        command?: { sourceKind?: unknown; name?: unknown; argumentText?: unknown };
        draft?: { goal?: unknown };
      }
    | undefined;
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | {
        targetProduct?: unknown;
        command?: { name?: unknown; targetProduct?: unknown };
        draft?: { goal?: unknown };
      }
    | undefined;

  assert.notEqual(confirmed.preparedTurn, null);
  assert.equal(initial.proposalMessage.choices?.[0]?.options[0]?.id, 'confirm_code');
  assert.equal(confirmed.preparedTurn?.userMessage.body, 'Add parser tests');
  assert.equal(transitionMessage?.body, 'Confirmed Code intake.');
  assert.equal(transition?.event, 'confirmed');
  assert.equal(transition?.confirmedCommand?.command, 'code');
  assert.equal(transition?.confirmedCommand?.argumentText, 'Add parser tests');
  assert.equal(directWorkItem?.status, 'draft');
  assert.equal(productIntentIntake?.targetProduct, 'code');
  assert.equal(productIntentIntake?.command?.sourceKind, 'cat_product_intent_proposal');
  assert.equal(productIntentIntake?.command?.name, 'code');
  assert.equal(productIntentIntake?.command?.argumentText, 'Add parser tests');
  assert.equal(productIntentIntake?.draft?.goal, 'Add parser tests');
  assert.equal(intake?.draft?.goal, 'Add parser tests');
  assert.equal(intake?.command?.name, 'code');
  assert.equal(intake?.targetProduct, 'code');
  assert.equal(directSlashMode?.activeAnchor?.targetProduct, 'code');
});

test('beginChannelMessageDispatch declines Cat proposals without product intake', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const initial = await suggestCatProductIntentProposal({
    state,
    channelId,
    store,
    body: 'Please plan the onboarding requirements',
    now: new Date('2026-05-06T08:01:00.000Z'),
  });

  const declined = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Keep as chat',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(initial.proposalMessage, 'decline'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
    },
  );

  const channel = requireChannel(declined.state, channelId);
  const transitionMessage = channel.messages.find((message) =>
    message.metadata.event === 'cat_product_intent_proposal_declined');
  const transition = transitionMessage?.metadata.catProductIntentProposalTransition as
    | CatProductIntentProposalTransitionMetadata
    | undefined;
  const core = await store.readCore();

  assert.equal(declined.preparedTurn, null);
  assert.equal(transitionMessage?.body, 'Kept as chat.');
  assert.equal(transition?.event, 'declined');
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('routeChannelMessage suppresses Cat proposal tool requests during decline cooldown', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const initial = await suggestCatProductIntentProposal({
    state,
    channelId,
    store,
    body: 'Please plan the onboarding requirements',
    now: new Date('2026-05-06T08:01:00.000Z'),
  });
  const declined = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Keep as chat',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(initial.proposalMessage, 'decline'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:02:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
    },
  );

  const { result: routed, warnings } = await captureConsoleWarns(() =>
    routeChannelMessage(
      declined.state,
      channelId,
      {
        body: 'Actually, please plan the launch requirements too.',
        senderName: 'Kenneth',
      },
      runtimeReplyStub('We can discuss it.'),
      new Date('2026-05-06T08:03:00.000Z'),
      {
        chatStore: store,
        providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
        naturalProductIntentMode: 'cat_tool',
        providerAgentDecisionRequester: async () => ({
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'tool_request',
          decisionId: 'decision-propose-work-cooldown',
          confidence: 'high',
          toolName: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
          target: {
            kind: 'worker_tool',
            toolName: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
          },
          input: {
            targetProduct: 'work',
            summary: 'Plan launch requirements',
            rationale: 'The owner is asking for product intake.',
          },
          rationaleSummary: 'Ask the owner to confirm product intake.',
        }),
      },
    ));
  const channel = requireChannel(routed.state, channelId);

  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'cat_product_intent_proposal_created').length,
    1,
  );
  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'cat_product_intent_proposal_declined').length,
    1,
  );
  assert.equal(
    warnings.some((warning) =>
      warning.some((part) =>
        typeof part === 'object'
        && part !== null
        && (part as { reason?: unknown }).reason === 'cooldown_active')),
    true,
  );
});

test('beginChannelMessageRetryDispatch drops duplicate Cat proposal tool requests for the same proposal id', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const initial = await suggestCatProductIntentProposal({
    state,
    channelId,
    store,
    body: 'Please plan the onboarding requirements',
    now: new Date('2026-05-06T08:01:00.000Z'),
  });
  const proposal = initial.proposalMessage.metadata.catProductIntentProposal as
    | CatProductIntentProposalMetadata
    | undefined;
  if (!proposal) {
    throw new Error('Expected initial Cat product-intent proposal metadata.');
  }

  const { result: duplicate, warnings } = await captureConsoleWarns(() =>
    beginChannelMessageRetryDispatch(
      initial.state,
      channelId,
      proposal.source.messageId,
      runtimeReplyStub('I can discuss the onboarding requirements.'),
      new Date('2026-05-06T08:02:00.000Z'),
      {
        chatStore: store,
        providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
        naturalProductIntentMode: 'cat_tool',
        providerAgentDecisionRequester: async () => ({
          contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          kind: 'tool_request',
          decisionId: 'decision-propose-work-duplicate',
          confidence: 'high',
          toolName: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
          target: {
            kind: 'worker_tool',
            toolName: CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
          },
          input: {
            targetProduct: 'work',
            summary: 'Plan onboarding requirements',
            rationale: 'The owner is asking for product intake.',
          },
          rationaleSummary: 'Ask the owner to confirm product intake.',
        }),
      },
    ));
  const channel = requireChannel(duplicate.state, channelId);
  const proposalMessages = channel.messages.filter((message) =>
    message.metadata.event === 'cat_product_intent_proposal_created');

  assert.equal(duplicate.userMessage.id, proposal.source.messageId);
  assert.equal(proposalMessages.length, 1);
  assert.equal(
    warnings.some((warning) =>
      warning.some((part) =>
        typeof part === 'object'
        && part !== null
        && (part as { reason?: unknown }).reason === 'duplicate_proposal'
        && ((part as { response?: { idempotent?: unknown } }).response?.idempotent === true))),
    true,
  );
});

test('beginChannelMessageDispatch suggests implicit candidates for room-routing direct lanes', async () => {
  const { state, channelId } = createDirectState();
  requireChannel(state, channelId).channelKind = 'chat_channel';
  const store = new MemoryChatStore(state);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const candidateMessage = requireChannel(begun.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');

  assert.equal(candidateMessage?.senderKind, 'system');
  assert.equal(
    (candidateMessage?.metadata.implicitProductIntentCandidate as
      | ImplicitProductIntentCandidateMetadata
      | undefined)?.candidate.targetProduct,
    'work',
  );
});

test('beginChannelMessageRetryDispatch suggests implicit candidates for retried messages', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeReplyStub('I can discuss that.'),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'off',
    },
  );
  const initialUserMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.senderKind === 'user'
    && message.body === 'Please plan the onboarding requirements');
  if (!initialUserMessage) {
    throw new Error('Expected initial user message.');
  }

  const retried = await beginChannelMessageRetryDispatch(
    initial.state,
    channelId,
    initialUserMessage.id,
    runtimeStub(),
    new Date('2026-05-06T08:02:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(retried.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  const candidate = candidateMessage?.metadata.implicitProductIntentCandidate as
    | ImplicitProductIntentCandidateMetadata
    | undefined;

  assert.equal(retried.userMessage.id, initialUserMessage.id);
  assert.equal(candidateMessage?.senderKind, 'system');
  assert.equal(candidateMessage?.metadata.sourceMessageId, initialUserMessage.id);
  assert.equal(candidate?.candidate.targetProduct, 'work');
});

test('beginChannelMessageRetryDispatch expires stale implicit candidates', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeReplyStub('I can discuss that.'),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const initialUserMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.senderKind === 'user'
    && message.body === 'Please plan the onboarding requirements');
  if (!initialUserMessage) {
    throw new Error('Expected initial user message.');
  }

  const retried = await beginChannelMessageRetryDispatch(
    initial.state,
    channelId,
    initialUserMessage.id,
    runtimeStub(),
    new Date('2026-05-06T08:17:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
    },
  );
  const channel = requireChannel(retried.state, channelId);

  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_suggested').length,
    1,
  );
  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_expired').length,
    1,
  );
});

test('beginChannelMessageDispatch records implicit candidate decline without product intake', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }

  const declined = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Keep as chat',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(candidateMessage, 'decline'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(declined.state, channelId);
  const transitionMessage = channel.messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_declined');
  const transition = transitionMessage?.metadata.implicitProductIntentTransition as
    | ImplicitProductIntentCandidateTransitionMetadata
    | undefined;
  const candidateMetadata = candidateMessage.metadata.implicitProductIntentCandidate as
    | ImplicitProductIntentCandidateMetadata
    | undefined;
  const core = await store.readCore();

  assert.equal(declined.preparedTurn, null);
  assert.equal(transitionMessage?.senderKind, 'system');
  assert.equal(transitionMessage?.body, 'Kept as chat.');
  assert.equal(transition?.event, 'declined');
  assert.equal(transition?.candidateId, candidateMetadata?.candidateId);
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('routeChannelMessage suppresses implicit candidates briefly after decline', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('We can keep chatting.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }
  const declined = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Keep as chat',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(candidateMessage, 'decline'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const next = await routeChannelMessage(
    declined.state,
    channelId,
    {
      body: 'Please plan the release requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:04:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const channel = requireChannel(next.state, channelId);

  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_suggested').length,
    1,
  );
});

test('beginChannelMessageDispatch expires open implicit candidates on chat posture', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('We can keep chatting.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const cleared = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: '/chat',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const channel = requireChannel(cleared.state, channelId);
  const expiredTransition = channel.messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_expired');
  const transition = expiredTransition?.metadata.implicitProductIntentTransition as
    | ImplicitProductIntentCandidateTransitionMetadata
    | undefined;

  assert.equal(expiredTransition?.body, 'Suggestion expired.');
  assert.equal(transition?.event, 'expired');
});

test('routeChannelMessage expires old implicit candidates before suggesting another', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('We can discuss it.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const next = await routeChannelMessage(
    initial.state,
    channelId,
    {
      body: 'Please plan the launch requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:17:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const channel = requireChannel(next.state, channelId);

  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_expired').length,
    1,
  );
  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_suggested').length,
    2,
  );
});

test('routeChannelMessage expires old implicit candidates even after switching to Cat proposals', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('We can discuss it.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const next = await routeChannelMessage(
    initial.state,
    channelId,
    {
      body: 'This is a normal follow-up chat message.',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:17:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'cat_tool',
    },
  );
  const channel = requireChannel(next.state, channelId);

  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_expired').length,
    1,
  );
  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_suggested').length,
    1,
  );
  assert.equal(
    channel.messages.some((message) =>
      message.metadata.event === 'cat_product_intent_proposal_created'),
    false,
  );
});

test('routeChannelMessage expires unresolved implicit candidates before suggesting another', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('We can discuss it.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const next = await routeChannelMessage(
    initial.state,
    channelId,
    {
      body: 'Please plan the launch requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:02:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const channel = requireChannel(next.state, channelId);

  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_expired').length,
    1,
  );
  assert.equal(
    channel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_suggested').length,
    2,
  );
});

test('beginChannelMessageDispatch confirms implicit candidates through slash-mode intake once', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }
  const choiceResponse = buildSingleChoiceResponse(candidateMessage, 'confirm_work');

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Turn into Work',
      senderName: 'Kenneth',
      choiceResponse,
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(confirmed.state, channelId);
  const choiceMessage = channel.messages.find((message) =>
    message.choiceResponse?.sourceMessageId === candidateMessage.id);
  const transitionMessage = channel.messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_confirmed');
  const transition = transitionMessage?.metadata.implicitProductIntentTransition as
    | ImplicitProductIntentCandidateTransitionMetadata
    | undefined;
  const commandMetadata = choiceMessage?.metadata.productIntentCommand as
    | { rawCommandToken?: unknown; implicitConfirmed?: unknown; originalMessageId?: unknown }
    | undefined;
  const core = await store.readCore();
  const directWorkItems = core.workItems.filter((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const directWorkItem = directWorkItems[0];
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | { draft?: { goal?: unknown }; command?: { name?: unknown } }
    | undefined;

  assert.notEqual(confirmed.preparedTurn, null);
  assert.equal(confirmed.preparedTurn?.userMessage.body, 'Please plan the onboarding requirements');
  assert.equal(commandMetadata?.rawCommandToken, IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN);
  assert.equal(commandMetadata?.implicitConfirmed, true);
  assert.equal(commandMetadata?.originalMessageId, transition?.sourceMessageId);
  assert.equal(transitionMessage?.body, 'Confirmed Work intake.');
  assert.equal(transition?.event, 'confirmed');
  assert.equal(transition?.confirmedCommand?.argumentText, 'Please plan the onboarding requirements');
  assert.equal(transition?.confirmedCommand?.rawCommandToken, IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN);
  assert.equal(directWorkItems.length, 1);
  assert.equal(directWorkItem?.status, 'draft');
  assert.equal(intake?.draft?.goal, 'Please plan the onboarding requirements');
  assert.equal(intake?.command?.name, 'work');

  const duplicate = await beginChannelMessageDispatch(
    confirmed.state,
    channelId,
    {
      body: 'Turn into Work',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(
        candidateMessage,
        'confirm_work',
        '2026-05-06T08:04:00.000Z',
      ),
    },
    runtimeStub(),
    new Date('2026-05-06T08:04:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const duplicateCore = await store.readCore();
  const duplicateChannel = requireChannel(duplicate.state, channelId);

  assert.equal(duplicate.preparedTurn, null);
  assert.equal(
    duplicateCore.workItems.filter((candidate) =>
      Boolean(candidate.metadata.directSlashModeIntake)).length,
    1,
  );
  assert.equal(
    duplicateChannel.messages.filter((message) =>
      message.metadata.event === 'implicit_product_intent_candidate_confirmed').length,
    1,
  );
});

test('beginChannelMessageDispatch expires stale implicit candidates instead of confirming them', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Turn into Work',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(candidateMessage, 'confirm_work'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:17:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(confirmed.state, channelId);
  const expiredTransition = channel.messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_expired');
  const confirmedTransition = channel.messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_confirmed');
  const core = await store.readCore();

  assert.equal(expiredTransition?.body, 'Suggestion expired.');
  assert.equal(confirmedTransition, undefined);
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('beginChannelMessageDispatch confirms implicit code candidates with code target', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the parser tests.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please fix the parser tests',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Turn into Code',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(candidateMessage, 'confirm_code'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(confirmed.state, channelId);
  const transitionMessage = channel.messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_confirmed');
  const transition = transitionMessage?.metadata.implicitProductIntentTransition as
    | ImplicitProductIntentCandidateTransitionMetadata
    | undefined;
  const ackMessage = channel.messages.find((message) =>
    message.metadata.event === 'product_intent_posture_changed');
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: {
          targetProduct?: unknown;
        };
      }
    | undefined;
  const core = await store.readCore();
  const directWorkItem = core.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | { targetProduct?: unknown; command?: { name?: unknown } }
    | undefined;

  assert.notEqual(confirmed.preparedTurn, null);
  assert.equal(confirmed.preparedTurn?.userMessage.body, 'Please fix the parser tests');
  assert.equal(transitionMessage?.body, 'Confirmed Code intake.');
  assert.equal(transition?.confirmedCommand?.command, 'code');
  assert.equal(directSlashMode?.activeAnchor?.targetProduct, 'code');
  assert.equal(directWorkItem?.title, 'Please fix the parser tests');
  assert.equal(intake?.targetProduct, 'code');
  assert.equal(intake?.command?.name, 'code');
});

test('beginChannelMessageDispatch confirms Telegram implicit code candidates through the same path', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the parser tests.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please fix the parser tests',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      transport: 'telegram',
      transportLocale: 'en',
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }
  const candidateMetadata = candidateMessage.metadata.implicitProductIntentCandidate as
    | ImplicitProductIntentCandidateMetadata
    | undefined;

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Turn into Code',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(candidateMessage, 'confirm_code'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      transport: 'telegram',
      transportLocale: 'en',
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(confirmed.state, channelId);
  const choiceMessage = channel.messages.find((message) =>
    message.choiceResponse?.sourceMessageId === candidateMessage.id);
  const commandMetadata = choiceMessage?.metadata.productIntentCommand as
    | { source?: unknown; rawCommandToken?: unknown; implicitConfirmed?: unknown }
    | undefined;
  const core = await store.readCore();
  const directWorkItem = core.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | { targetProduct?: unknown; command?: { name?: unknown } }
    | undefined;

  assert.equal(candidateMetadata?.source.transport, 'telegram');
  assert.equal(commandMetadata?.source, 'telegram');
  assert.equal(commandMetadata?.rawCommandToken, IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN);
  assert.equal(commandMetadata?.implicitConfirmed, true);
  assert.equal(directWorkItem?.status, 'draft');
  assert.equal(intake?.targetProduct, 'code');
  assert.equal(intake?.command?.name, 'code');
});

test('beginChannelMessageDispatch localizes Telegram implicit suggestions and confirmations', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: '請幫我修正 parser 測試',
      senderName: 'Kenneth',
    },
    runtimeReplyStub('我可以先了解狀況。'),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      transport: 'telegram',
      transportLocale: 'zh-Hant',
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }
  const replyMarkup = buildTelegramImplicitProductIntentReplyMarkup(candidateMessage);

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: '轉成 Code',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(candidateMessage, 'confirm_code'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      transport: 'telegram',
      transportLocale: 'zh-Hant',
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const transitionMessage = requireChannel(confirmed.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_confirmed');

  assert.equal(candidateMessage.body, '這看起來像 Code。確認後 Cats 才會建立耐久程式工作。');
  assert.equal(candidateMessage.choices?.[0]?.question, '要把這則訊息轉成 Code intake 嗎？');
  assert.deepEqual(
    candidateMessage.choices?.[0]?.options.map((option) => option.label),
    ['轉成 Code', '保留為 chat'],
  );
  assert.deepEqual(
    replyMarkup?.inline_keyboard[0]?.map((button) => button.text),
    ['轉成 Code', '保留為 chat'],
  );
  assert.equal(transitionMessage?.body, '已確認 Code intake。');
});

test('beginChannelMessageDispatch supersedes implicit draft anchors when confirmed posture switches', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const workSuggestion = await suggestImplicitProductIntentCandidate({
    state,
    channelId,
    store,
    body: 'Please plan the onboarding requirements',
    now: new Date('2026-05-06T08:01:00.000Z'),
  });
  const confirmedWork = await confirmImplicitProductIntentCandidate({
    state: workSuggestion.state,
    channelId,
    store,
    candidateMessage: workSuggestion.candidateMessage,
    selectedOptionId: 'confirm_work',
    now: new Date('2026-05-06T08:02:00.000Z'),
  });
  const coreAfterWork = await store.readCore();
  const firstWorkItem = coreAfterWork.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  if (!firstWorkItem) {
    throw new Error('Expected confirmed implicit Work Item.');
  }
  const codeSuggestion = await suggestImplicitProductIntentCandidate({
    state: confirmedWork.state,
    channelId,
    store,
    body: 'Please fix the parser tests',
    now: new Date('2026-05-06T08:03:00.000Z'),
  });

  const confirmedCode = await confirmImplicitProductIntentCandidate({
    state: codeSuggestion.state,
    channelId,
    store,
    candidateMessage: codeSuggestion.candidateMessage,
    selectedOptionId: 'confirm_code',
    now: new Date('2026-05-06T08:04:00.000Z'),
  });

  const ackMessage = requireChannel(confirmedCode.state, channelId).messages.at(-1);
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: { workItemId?: unknown; targetProduct?: unknown };
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
    | { workItemId?: unknown }
    | undefined;

  assert.equal(directSlashMode?.clearReason, 'anchor_superseded');
  assert.equal(directSlashMode?.clearedActiveAnchor?.workItemId, firstWorkItem.id);
  assert.equal(directSlashMode?.activeAnchor?.workItemId, newWorkItem?.id);
  assert.equal(directSlashMode?.activeAnchor?.targetProduct, 'code');
  assert.equal(directWorkItems.length, 2);
  assert.equal(oldWorkItem?.status, 'cancelled');
  assert.equal(newWorkItem?.status, 'draft');
  assert.equal(supersededBy?.workItemId, newWorkItem?.id);
});

test('beginChannelMessageDispatch abandons implicit draft anchors on chat posture', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const suggestion = await suggestImplicitProductIntentCandidate({
    state,
    channelId,
    store,
    body: 'Please plan the onboarding requirements',
    now: new Date('2026-05-06T08:01:00.000Z'),
  });
  const confirmed = await confirmImplicitProductIntentCandidate({
    state: suggestion.state,
    channelId,
    store,
    candidateMessage: suggestion.candidateMessage,
    selectedOptionId: 'confirm_work',
    now: new Date('2026-05-06T08:02:00.000Z'),
  });
  const coreAfterWork = await store.readCore();
  const firstWorkItem = coreAfterWork.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  if (!firstWorkItem) {
    throw new Error('Expected confirmed implicit Work Item.');
  }

  const cleared = await beginChannelMessageDispatch(
    confirmed.state,
    channelId,
    {
      body: '/chat',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const ackMessage = requireChannel(cleared.state, channelId).messages.at(-1);
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        activeAnchor?: unknown;
        clearReason?: unknown;
        clearedActiveAnchor?: { workItemId?: unknown };
      }
    | undefined;
  const core = await store.readCore();
  const abandonedWorkItem = core.workItems.find((candidate) => candidate.id === firstWorkItem.id);
  const abandonedBy = abandonedWorkItem?.metadata.directSlashModeAbandonedBy as
    | { reason?: unknown }
    | undefined;

  assert.equal(directSlashMode?.activeAnchor, null);
  assert.equal(directSlashMode?.clearReason, 'chat_posture');
  assert.equal(directSlashMode?.clearedActiveAnchor?.workItemId, firstWorkItem.id);
  assert.equal(abandonedWorkItem?.status, 'cancelled');
  assert.equal(abandonedBy?.reason, 'posture_abandoned');
});

test('Work projection lists Work Items created from confirmed implicit candidates', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const suggestion = await suggestImplicitProductIntentCandidate({
    state,
    channelId,
    store,
    body: 'Please plan the onboarding requirements',
    now: new Date('2026-05-06T08:01:00.000Z'),
  });

  await confirmImplicitProductIntentCandidate({
    state: suggestion.state,
    channelId,
    store,
    candidateMessage: suggestion.candidateMessage,
    selectedOptionId: 'confirm_work',
    now: new Date('2026-05-06T08:02:00.000Z'),
  });

  const core = await store.readCore();
  const projection = buildWorkWorkItemListProjection(core);
  const projectedWorkItem = projection.workItems.find((candidate) =>
    candidate.title === 'Please plan the onboarding requirements');

  assert.ok(projectedWorkItem);
  assert.equal(projectedWorkItem.status, 'draft');
  assert.equal(projectedWorkItem.conversationTitle, 'ConciergeCat Direct Chat');
  assert.equal(projectedWorkItem.conversationSourceChannelId, channelId);
  assert.equal(projectedWorkItem.assignedActors[0]?.displayName, 'ConciergeCat');
});

test('beginChannelMessageDispatch keeps confirmed implicit weak Cats human-gated', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig('weak_worker'),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Turn into Work',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(candidateMessage, 'confirm_work'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig('weak_worker'),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(confirmed.state, channelId);
  const transitionMessage = channel.messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_confirmed');
  const ackMessage = channel.messages.find((message) =>
    message.metadata.event === 'product_intent_posture_changed');
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        humanGate?: {
          kind?: unknown;
          capabilityProfileKind?: unknown;
          targetProduct?: unknown;
        };
      }
    | undefined;
  const core = await store.readCore();

  assert.equal(confirmed.preparedTurn, null);
  assert.equal(transitionMessage?.senderKind, 'system');
  assert.equal(directSlashMode?.humanGate?.kind, 'human_gate_required');
  assert.equal(directSlashMode?.humanGate?.capabilityProfileKind, 'weak_worker');
  assert.equal(directSlashMode?.humanGate?.targetProduct, 'work');
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('beginChannelMessageDispatch keeps confirmed implicit unknown Cats human-gated', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('I can discuss the onboarding requirements.');
  const initial = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please plan the onboarding requirements',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );
  const candidateMessage = requireChannel(initial.state, channelId).messages.find((message) =>
    message.metadata.event === 'implicit_product_intent_candidate_suggested');
  if (!candidateMessage) {
    throw new Error('Expected implicit product-intent candidate message.');
  }

  const confirmed = await beginChannelMessageDispatch(
    initial.state,
    channelId,
    {
      body: 'Turn into Work',
      senderName: 'Kenneth',
      choiceResponse: buildSingleChoiceResponse(candidateMessage, 'confirm_work'),
    },
    runtimeStub(),
    new Date('2026-05-06T08:03:00.000Z'),
    {
      chatStore: store,
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const channel = requireChannel(confirmed.state, channelId);
  const ackMessage = channel.messages.find((message) =>
    message.metadata.event === 'product_intent_posture_changed');
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | {
        humanGate?: {
          kind?: unknown;
          capabilityProfileKind?: unknown;
        };
      }
    | undefined;
  const core = await store.readCore();

  assert.equal(confirmed.preparedTurn, null);
  assert.equal(directSlashMode?.humanGate?.kind, 'human_gate_required');
  assert.equal(directSlashMode?.humanGate?.capabilityProfileKind, 'unknown');
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.directSlashModeIntake)).length,
    0,
  );
});

test('routeChannelMessage does not send localized synthetic user text for empty product-intent arguments', async () => {
  const { state, channelId } = createDirectState();
  requireChannel(state, channelId).language = 'zh-TW';
  const store = new MemoryChatStore(state);
  const runtimeClient = runtimeReplyStub('這項工作最重要的成果是什麼？');

  await routeChannelMessage(
    state,
    channelId,
    {
      body: '/work',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: fixtureBootstrapConfig(),
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  assert.equal(runtimeClient.sentMessages.length, 1);
  assert.match(
    runtimeClient.sentMessages[0]?.content ?? '',
    /Latest user message:\n\(no slash-command argument provided\)/u,
  );
  assert.doesNotMatch(runtimeClient.sentMessages[0]?.content ?? '', /切換到 Work 模式/u);
  assert.match(
    runtimeClient.sentMessages[0]?.input?.instructions ?? '',
    /did not provide an argument/u,
  );
  assert.match(
    runtimeClient.sentMessages[0]?.input?.instructions ?? '',
    /Reply in Traditional Chinese/u,
  );
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

  const weakChannel = requireChannel(begun.state, channelId);
  const userMessage = weakChannel.messages.find((message) => message.senderKind === 'user');
  const ackMessage = weakChannel.messages.at(-1);
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
  assert.equal(userMessage?.metadata.productIntentArgumentProvided, true);
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
      naturalProductIntentMode: 'heuristic_prefilter',
    },
  );

  const unknownChannel = requireChannel(begun.state, channelId);
  const userMessage = unknownChannel.messages.find((message) => message.senderKind === 'user');
  const ackMessage = unknownChannel.messages.at(-1);
  const core = await store.readCore();
  const directWorkItem = core.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));
  const intake = directWorkItem?.metadata.directSlashModeIntake as
    | { draft?: { localization?: { locale?: unknown } } }
    | undefined;

  assert.match(ackMessage?.body ?? '', /^Work 模式已啟用/u);
  assert.equal(begun.preparedTurn?.userMessage.body, '(no slash-command argument provided)');
  assert.equal(begun.preparedTurn?.userMessage.metadata.productIntentArgumentProvided, false);
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
  assert.equal(begun.preparedTurn?.userMessage.body, '(no slash-command argument provided)');
  assert.equal(begun.preparedTurn?.userMessage.metadata.productIntentArgumentProvided, false);
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

  const unknownChannel = requireChannel(begun.state, channelId);
  const userMessage = unknownChannel.messages.find((message) => message.senderKind === 'user');
  const ackMessage = unknownChannel.messages.at(-1);
  const postureChange = ackMessage?.metadata.directSlashModePostureChange as
    | { capabilityProfileKind?: unknown }
    | undefined;
  const directSlashMode = ackMessage?.metadata.directSlashMode as
    | { humanGate?: { kind?: unknown; capabilityProfileKind?: unknown; suggestedActions?: unknown } }
    | undefined;
  const core = await store.readCore();

  assert.match(ackMessage?.body ?? '', /^Work mode is active\./u);
  assert.equal(userMessage?.metadata.productIntentArgumentProvided, true);
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
  const userMessage = channel.messages.find((message) => message.senderKind === 'user');
  const ackMessage = channel.messages.at(-1);

  assert.equal(begun.preparedTurn, null);
  assert.equal(userMessage?.metadata.productIntentArgumentProvided, true);
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
      naturalProductIntentMode: 'heuristic_prefilter',
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
