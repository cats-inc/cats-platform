import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.js';
import { buildOrchestratorTurnPlan } from '../src/products/chat/api/orchestratorPlan.js';
import { createDefaultChatState } from '../src/products/chat/state/defaults.js';
import {
  buildChannelView,
  createChannel,
} from '../src/products/chat/state/model/index.js';
import { chatDeterministicPlannerSurface } from '../src/products/chat/state/deterministicRouterAdapter.js';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
} from '../src/products/work/shared/workToolSurface.js';
import { WORK_MCP_PROFILE_ID } from '../src/products/work/shared/workToolIntent.js';

function createWorkMemoryPlan(body: string) {
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
  assert.equal(buildChannelView(state, channelId).assignedCats[0]?.mcpProfile, WORK_MCP_PROFILE_ID);

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
  assert.deepEqual(target.toolIntent?.requiredCapabilities, [
    'work.phase.triage',
    'work.capability.strong_agent',
    'work.tool_scope.narrow_write',
  ]);
  assert.equal(target.toolIntent?.strict, true);
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

test('Chat orchestrator suppresses generic runtime intent for unmatched work-memory turns', () => {
  const plan = createWorkMemoryPlan('Tell me about work-item-alpha.');
  const target = plan.routing.initialTargets[0];

  assert.ok(target);
  assert.equal(target.toolIntent, null);
});
