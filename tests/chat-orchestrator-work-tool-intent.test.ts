import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.js';
import { buildOrchestratorTurnPlan } from '../src/products/chat/api/orchestratorPlan.js';
import { createDefaultChatState } from '../src/products/chat/state/defaults.js';
import {
  buildChannelView,
  createChannel,
  setCatGroup,
} from '../src/products/chat/state/model/index.js';
import { chatDeterministicPlannerSurface } from '../src/products/chat/state/deterministicRouterAdapter.js';
import {
  WORK_EXTERNAL_IMPORT_ISSUE_TOOL,
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
} from '../src/products/work/shared/workToolSurface.js';
import { WORK_MCP_PROFILE_ID } from '../src/products/work/shared/workToolIntent.js';

function createWorkMemoryPlan(body: string, options: { bossCat?: boolean } = {}) {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'Work Memory Direct Chat',
      topic: 'Plan Work tool intent.',
      originSurface: 'chat',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Planner Cat',
          provider: 'antigravity',
          roles: ['planner', 'companion'],
          mcpProfile: WORK_MCP_PROFILE_ID,
        },
      ],
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const channelId = state.selectedChannelId;
  assert.ok(channelId);
  const catId = buildChannelView(state, channelId).assignedCats[0]?.catId;
  assert.ok(catId);
  assert.equal(buildChannelView(state, channelId).assignedCats[0]?.mcpProfile, WORK_MCP_PROFILE_ID);
  if (options.bossCat) {
    state = setCatGroup(state, catId, 'admin');
  }

  return buildOrchestratorTurnPlan(
    state,
    createDefaultCoreState(),
    {
      channelId,
      body,
      transport: 'web',
    },
    chatDeterministicPlannerSurface,
  );
}

test('Chat orchestrator projects Work triage tool intent for work-memory Cats', () => {
  const plan = createWorkMemoryPlan('Create project Cat Ops and update work-item-alpha.');
  const target = plan.routing.initialTargets[0];

  assert.ok(target);
  assert.deepEqual(target.toolIntent?.allowedTools, [
    WORK_ITEM_ASSIGN_PROJECT_TOOL,
    WORK_ITEM_UPDATE_TOOL,
    WORK_PROJECT_CREATE_TOOL,
    WORK_PROJECT_LOOKUP_TOOL,
  ]);
  assert.deepEqual(
    target.toolIntent?.toolDescriptions?.map((tool) => tool.name),
    target.toolIntent?.allowedTools,
  );
  assert.ok(
    target.toolIntent?.toolDescriptions?.some((tool) =>
      tool.name === WORK_ITEM_UPDATE_TOOL
      && tool.description.includes('Apply bounded triage updates')),
  );
  assert.deepEqual(target.toolIntent?.requiredCapabilities, [
    'work.phase.triage',
    'work.capability.strong_agent',
    'work.tool_scope.narrow_write',
  ]);
  assert.equal(target.toolIntent?.strict, true);
});

test('Chat orchestrator projects Boss Cat execution-preparation tool intent', () => {
  const plan = createWorkMemoryPlan('Start work-item-alpha.', { bossCat: true });
  const target = plan.routing.initialTargets[0];

  assert.ok(target);
  assert.deepEqual(target.toolIntent?.allowedTools, [
    WORK_ITEM_PREPARE_EXECUTION_TOOL,
    WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  ]);
  assert.deepEqual(target.toolIntent?.requiredCapabilities, [
    'work.phase.execution_preparation',
    'work.capability.boss_cat',
    'work.tool_scope.narrow_write',
  ]);
  assert.equal(target.toolIntent?.strict, true);
});

test('Chat orchestrator projects read-only Work intake intent for work-memory Cats', () => {
  const plan = createWorkMemoryPlan('Boss Cat 幫我記一個待辦：整理 Telegram 匯入');
  const target = plan.routing.initialTargets[0];

  assert.ok(target);
  assert.deepEqual(target.toolIntent?.allowedTools, [
    WORK_ITEM_PROPOSE_SPLIT_TOOL,
  ]);
  assert.deepEqual(target.toolIntent?.requiredCapabilities, [
    'work.phase.intake',
    'work.capability.strong_agent',
    'work.tool_scope.read_only',
  ]);
  assert.equal(target.toolIntent?.strict, true);
});

test('Chat orchestrator is never a Boss Cat by role alone for Work execution intent', () => {
  // Planner Cat coordinates the room but is a standard cat, so coordinating grants no Boss Cat work.
  const plan = createRoomWorkMemoryPlan('@Planner Cat start work-item-alpha.', null);
  const target = plan.routing.initialTargets[0];

  assert.ok(target);
  assert.equal(target.targetKind, 'cat');
  assert.equal(target.toolIntent?.requiredCapabilities
    ?.includes('work.capability.boss_cat') ?? false, false);
});

function createRoomWorkMemoryPlan(body: string, bossCatName: string | null) {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'Work Memory Room',
      topic: 'Plan Work tool intent.',
      originSurface: 'chat',
      roomMode: 'chat_channel',
      cats: ['Planner Cat', 'Helper Cat'].map((name) => ({
        name,
        provider: 'antigravity',
        roles: ['planner'],
        mcpProfile: WORK_MCP_PROFILE_ID,
      })),
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const channelId = state.selectedChannelId;
  if (bossCatName) {
    const boss = buildChannelView(state, channelId).assignedCats.find((cat) => cat.name === bossCatName);
    assert.ok(boss);
    state = setCatGroup(state, boss.catId, 'admin');
  }

  return buildOrchestratorTurnPlan(
    state,
    createDefaultCoreState(),
    { channelId, body, transport: 'web' },
    chatDeterministicPlannerSurface,
  );
}

test('Chat Boss Cat work belongs to a room coordinator that is an admin cat', () => {
  // The first participant, Planner Cat, coordinates the room.
  const coordinatorPlan = createRoomWorkMemoryPlan('@Planner Cat start work-item-alpha.', 'Planner Cat');
  assert.deepEqual(coordinatorPlan.routing.initialTargets[0]?.toolIntent?.requiredCapabilities, [
    'work.phase.execution_preparation',
    'work.capability.boss_cat',
    'work.tool_scope.narrow_write',
  ]);

  const workerPlan = createRoomWorkMemoryPlan('@Helper Cat start work-item-alpha.', 'Helper Cat');
  assert.equal(workerPlan.routing.initialTargets[0]?.toolIntent?.requiredCapabilities
    ?.includes('work.capability.boss_cat') ?? false, false);
});

test('Chat orchestrator projects Work external tracker tool intent for explicit binding turns', () => {
  const plan = createWorkMemoryPlan(
    'Link work-item-alpha to https://github.com/cats-inc/platform/issues/42.',
  );
  const target = plan.routing.initialTargets[0];

  assert.ok(target);
  assert.deepEqual(target.toolIntent?.allowedTools, [
    WORK_EXTERNAL_LINK_ISSUE_TOOL,
    WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  ]);
  assert.deepEqual(target.toolIntent?.requiredCapabilities, [
    'work.phase.external_tracker_binding',
    'work.capability.strong_agent',
    'work.tool_scope.narrow_write',
  ]);
  assert.equal(target.toolIntent?.context?.participantKind, 'cat');
  assert.equal(target.toolIntent?.context?.transport, 'web');
});

test('Chat orchestrator projects Work external import tool intent for issue import turns', () => {
  const plan = createWorkMemoryPlan(
    'Import https://github.com/cats-inc/platform/issues/42 into Cats Work.',
  );
  const target = plan.routing.initialTargets[0];

  assert.ok(target);
  assert.deepEqual(target.toolIntent?.allowedTools, [
    WORK_EXTERNAL_IMPORT_ISSUE_TOOL,
  ]);
  assert.deepEqual(
    target.toolIntent?.toolDescriptions?.map((tool) => tool.name),
    target.toolIntent?.allowedTools,
  );
  assert.deepEqual(target.toolIntent?.requiredCapabilities, [
    'work.phase.external_tracker_binding',
    'work.capability.strong_agent',
    'work.tool_scope.narrow_write',
  ]);
  assert.equal(target.toolIntent?.context?.participantKind, 'cat');
  assert.equal(target.toolIntent?.context?.transport, 'web');
});

test('Chat orchestrator suppresses generic runtime intent for unmatched work-memory turns', () => {
  const plan = createWorkMemoryPlan('Tell me about work-item-alpha.');
  const target = plan.routing.initialTargets[0];

  assert.ok(target);
  assert.equal(target.toolIntent, null);
});
