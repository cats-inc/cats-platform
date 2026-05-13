import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.js';
import { executeDispatch } from '../src/products/chat/state/runtime-dispatch/execution.js';
import { createDefaultChatState } from '../src/products/chat/state/defaults.js';
import {
  appendMessage,
  buildChannelView,
  createChannel,
  setChannelCatLease,
  setChannelOrchestratorLease,
} from '../src/products/chat/state/model/index.js';
import type { DispatchRequest } from '../src/products/chat/state/room-routing/runtime.js';
import type { RuntimeClient } from '../src/platform/runtime/client.js';
import {
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
} from '../src/products/work/shared/workToolSurface.js';
import { WORK_MCP_PROFILE_ID } from '../src/products/work/shared/workToolIntent.js';

function usage(content: string) {
  return {
    segments: [{ kind: 'text' as const, text: content, toolName: null, toolId: null }],
    inputTokens: 1,
    outputTokens: 1,
    tokensUsed: 2,
  };
}

function createRuntimeStub() {
  const sentMessages: Array<{
    sessionId: string;
    content: string;
    input: Parameters<RuntimeClient['sendMessage']>[2];
  }> = [];
  return {
    sentMessages,
    async sendMessage(
      sessionId: string,
      content: string,
      input: Parameters<RuntimeClient['sendMessage']>[2],
    ) {
      sentMessages.push({ sessionId, content, input });
      return usage('Done.');
    },
  } as unknown as RuntimeClient & { sentMessages: typeof sentMessages };
}

function createDispatchHarness(body: string) {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'Runtime Work Intent',
      topic: 'Forward Work tool intent to runtime metadata.',
      originSurface: 'chat',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Planner Cat',
          provider: 'gemini',
          roles: ['planner'],
          skillProfile: 'companion',
          mcpProfile: WORK_MCP_PROFILE_ID,
        },
      ],
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const channelId = state.selectedChannelId;
  assert.ok(channelId);
  const channel = buildChannelView(state, channelId);
  const cat = channel.assignedCats[0];
  assert.ok(cat);
  state = setChannelCatLease(
    state,
    channelId,
    cat.catId,
    {
      laneId: 'lane-work',
      sessionId: 'session-work',
      status: 'ready',
      attachedAt: '2026-05-13T00:00:01.000Z',
      lastUsedAt: '2026-05-13T00:00:01.000Z',
    },
    new Date('2026-05-13T00:00:01.000Z'),
  );
  const appended = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body,
    },
    new Date('2026-05-13T00:00:02.000Z'),
  );
  state = appended.state;

  const target = {
    participantKind: 'cat' as const,
    participantId: cat.participantId,
    participantName: cat.name,
    laneId: 'lane-work',
    sessionId: 'session-work',
  };
  const request: DispatchRequest = {
    sourceMessage: appended.message,
    sourceParticipant: null,
    targets: [target],
    unresolved: [],
    mentionNames: [],
    trigger: 'room_default',
    depth: 0,
    turnId: 'turn-work',
    target,
    dispatchId: 'dispatch-work',
    targetStateId: 'target-work',
    parentCheckpointId: null,
    branchStrategy: null,
    handoffReason: null,
  };

  return { state, channelId, request };
}

function createOrchestratorDispatchHarness(body: string) {
  let state = createDefaultChatState();
  state.globalOrchestrator.mcpProfile = WORK_MCP_PROFILE_ID;
  state = createChannel(
    state,
    {
      title: 'Global Runtime Work Intent',
      topic: 'Forward Boss Work tool intent to runtime metadata.',
      originSurface: 'chat',
      roomMode: 'chat_channel',
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const channelId = state.selectedChannelId;
  assert.ok(channelId);
  state = setChannelOrchestratorLease(
    state,
    channelId,
    {
      laneId: 'lane-orchestrator-work',
      sessionId: 'session-orchestrator-work',
      status: 'ready',
      attachedAt: '2026-05-13T00:00:01.000Z',
      lastUsedAt: '2026-05-13T00:00:01.000Z',
    },
    new Date('2026-05-13T00:00:01.000Z'),
  );
  const appended = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body,
    },
    new Date('2026-05-13T00:00:02.000Z'),
  );
  state = appended.state;

  const target = {
    participantKind: 'orchestrator' as const,
    participantId: 'orchestrator',
    participantName: 'Boss Cat',
    laneId: 'lane-orchestrator-work',
    sessionId: 'session-orchestrator-work',
  };
  const request: DispatchRequest = {
    sourceMessage: appended.message,
    sourceParticipant: null,
    targets: [target],
    unresolved: [],
    mentionNames: [],
    trigger: 'room_default',
    depth: 0,
    turnId: 'turn-orchestrator-work',
    target,
    dispatchId: 'dispatch-orchestrator-work',
    targetStateId: 'target-orchestrator-work',
    parentCheckpointId: null,
    branchStrategy: null,
    handoffReason: null,
  };

  return { state, channelId, request };
}

test('runtime dispatch forwards Work tool intent metadata for explicit Work turns', async () => {
  const harness = createDispatchHarness('Create project Cat Ops and update work-item-alpha.');
  const runtimeClient = createRuntimeStub();

  await executeDispatch(
    harness.state,
    harness.channelId,
    harness.request,
    runtimeClient,
    new Date('2026-05-13T00:00:03.000Z'),
    'web',
    null,
    undefined,
    createDefaultCoreState(),
  );

  const toolIntent = runtimeClient.sentMessages[0]?.input?.context?.metadata?.toolIntent as
    | {
        allowedTools?: string[];
        requiredCapabilities?: string[];
        strict?: boolean;
        toolDescriptions?: Array<{ name: string; description: string }>;
      }
    | undefined;
  assert.ok(toolIntent);
  assert.deepEqual(toolIntent.allowedTools, [
    WORK_ITEM_ASSIGN_PROJECT_TOOL,
    WORK_ITEM_UPDATE_TOOL,
    WORK_PROJECT_CREATE_TOOL,
    WORK_PROJECT_LOOKUP_TOOL,
  ]);
  assert.deepEqual(
    toolIntent.toolDescriptions?.map((tool) => tool.name),
    toolIntent.allowedTools,
  );
  assert.ok(
    toolIntent.toolDescriptions?.some((tool) =>
      tool.name === WORK_PROJECT_CREATE_TOOL
      && tool.description.includes('Create one Cats Work Project')),
  );
  assert.deepEqual(toolIntent.requiredCapabilities, [
    'work.phase.triage',
    'work.capability.strong_agent',
    'work.tool_scope.narrow_write',
  ]);
  assert.equal(toolIntent.strict, true);
});

test('runtime dispatch treats the global orchestrator as Boss Cat for execution-preparation intent', async () => {
  const harness = createOrchestratorDispatchHarness('Start work-item-alpha.');
  const runtimeClient = createRuntimeStub();

  await executeDispatch(
    harness.state,
    harness.channelId,
    harness.request,
    runtimeClient,
    new Date('2026-05-13T00:00:03.000Z'),
    'web',
    null,
    undefined,
    createDefaultCoreState(),
  );

  const toolIntent = runtimeClient.sentMessages[0]?.input?.context?.metadata?.toolIntent as
    | {
        allowedTools?: string[];
        requiredCapabilities?: string[];
        strict?: boolean;
        context?: { participantKind?: string };
      }
    | undefined;
  assert.ok(toolIntent);
  assert.deepEqual(toolIntent.allowedTools, [
    WORK_ITEM_PREPARE_EXECUTION_TOOL,
    WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  ]);
  assert.deepEqual(toolIntent.requiredCapabilities, [
    'work.phase.execution_preparation',
    'work.capability.boss_cat',
    'work.tool_scope.narrow_write',
  ]);
  assert.equal(toolIntent.context?.participantKind, 'orchestrator');
  assert.equal(toolIntent.strict, true);
});

test('runtime dispatch omits Work tool intent metadata for unmatched work-memory turns', async () => {
  const harness = createDispatchHarness('Tell me about work-item-alpha.');
  const runtimeClient = createRuntimeStub();

  await executeDispatch(
    harness.state,
    harness.channelId,
    harness.request,
    runtimeClient,
    new Date('2026-05-13T00:00:03.000Z'),
    'web',
    null,
    undefined,
    createDefaultCoreState(),
  );

  assert.equal(
    runtimeClient.sentMessages[0]?.input?.context?.metadata?.toolIntent,
    undefined,
  );
});
