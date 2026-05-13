import assert from 'node:assert/strict';
import test from 'node:test';

import { PROVIDER_AGENT_DECISION_CONTRACT_VERSION } from '../src/platform/orchestration/index.js';
import type { RuntimeClient } from '../src/platform/runtime/client.js';
import { createChatTelegramRoomBridge } from '../src/products/chat/state/telegramBridgeAdapter.js';
import { createDefaultChatState } from '../src/products/chat/state/defaults.js';
import { MemoryCompanionBoxStore } from '../src/products/chat/state/companion-box/index.js';
import { MemoryChatStore } from '../src/products/chat/state/store.js';
import {
  buildChannelView,
  createChannel,
} from '../src/products/chat/state/model/index.js';
import {
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
} from '../src/products/work/shared/workToolSurface.js';
import { WORK_MCP_PROFILE_ID } from '../src/products/work/shared/workToolIntent.js';
import { buildTelegramBotTransportBindingId } from '../src/shared/chatCoreIds.js';

const strongClaudeNativeBootstrapConfig = {
  version: 1 as const,
  profiles: [
    {
      id: 'claude-native-sonnet-strong',
      selector: {
        provider: 'claude',
        instance: 'native',
        model: 'sonnet',
        control: 'default',
      },
      initialTreatment: 'strong_agent' as const,
      confidenceLevel: 'catalog_only' as const,
      reason: 'Telegram bridge fixture treats Claude native Sonnet as a strong Cat.',
    },
  ],
};

function createRuntimeStub(): RuntimeClient {
  let nextSession = 1;
  return {
    async createSession(input) {
      const sessionId = `session-telegram-work-${nextSession++}`;
      return {
        id: sessionId,
        provider: input.provider,
        model: input.model ?? null,
        status: 'ready',
        cwd: input.cwd ?? null,
      };
    },
    async sendMessage() {
      return {
        segments: [
          { kind: 'text', text: 'Work intake proposal prepared.', toolName: null, toolId: null },
        ],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
  } as unknown as RuntimeClient;
}

test('Telegram room bridge passes provider tool decisions into Work intake sidecars', async () => {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'Telegram Work Intake',
      topic: 'Route Telegram todos into Cats Work.',
      originSurface: 'chat',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Work',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
          roles: ['planner'],
          skillProfile: 'companion',
          mcpProfile: WORK_MCP_PROFILE_ID,
        },
      ],
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const roomId = state.selectedChannelId;
  assert.ok(roomId);

  const chatStore = new MemoryChatStore(state);
  const companionStore = new MemoryCompanionBoxStore();
  let observedToolNames: string[] = [];
  const bridge = createChatTelegramRoomBridge({
    chatStore,
    companionStore,
    naturalProductIntentMode: 'cat_tool',
    providerCapabilityBootstrapConfig: strongClaudeNativeBootstrapConfig,
    providerAgentDecisionRequester: async ({ observation }) => {
      observedToolNames = observation.availableTools.map((tool) => tool.manifest.name);
      return {
        contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
        kind: 'tool_request',
        decisionId: 'decision-telegram-work-intake-1',
        confidence: 'high',
        toolName: WORK_ITEM_PROPOSE_SPLIT_TOOL,
        target: {
          kind: 'worker_tool',
          toolName: WORK_ITEM_PROPOSE_SPLIT_TOOL,
        },
        input: {
          maxItems: 2,
          defaultKind: 'todo',
          defaultPriority: 'medium',
        },
        rationaleSummary: 'Propose structured Work Items from the Telegram owner message.',
      };
    },
  });

  const routed = await bridge.routeRoomMessage({
    state,
    roomId,
    body: 'Draft the MCP adapter contract; Add Telegram Work intake coverage',
    senderName: 'Kenneth',
    bindingId: 'bot-binding-1',
    runtimeClient: createRuntimeStub(),
    timestamp: new Date('2026-05-13T00:01:00.000Z'),
  });

  assert.equal(observedToolNames.includes(WORK_ITEM_PROPOSE_SPLIT_TOOL), true);
  assert.equal(routed.results[0]?.status, 'sent');

  const channel = buildChannelView(routed.state, roomId);
  const proposalMessage = channel.messages.find((message) =>
    message.metadata.event === 'work_intake_proposal_created');
  const proposal = proposalMessage?.metadata.workIntakeProposal;

  assert.equal(proposalMessage?.senderName, 'Cats Work');
  assert.equal(
    proposalMessage?.choices?.[0]?.options.some((option) =>
      option.id === 'capture_work_items' && option.style === 'primary'),
    true,
  );
  assert.deepEqual(
    proposal?.candidates?.map((candidate) => candidate.title),
    [
      'Draft the MCP adapter contract',
      'Add Telegram Work intake coverage',
    ],
  );
  assert.equal(proposal?.source?.surface, 'telegram');
  assert.equal(
    proposal?.source?.transportBindingId,
    buildTelegramBotTransportBindingId('bot-binding-1'),
  );

  const core = await chatStore.readCore();
  assert.equal(
    core.workItems.filter((candidate) => Boolean(candidate.metadata.workIntake)).length,
    0,
  );
});
