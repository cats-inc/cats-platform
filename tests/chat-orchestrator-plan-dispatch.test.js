import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  assignCatToChannel,
  createCat,
  createChannel,
  requireChannel,
} from '../build/server/products/chat/state/model/index.js';
import {
  beginChannelMessageDispatch,
} from '../build/server/products/chat/state/runtimeActions.js';
import {
  buildChannelDispatchOrchestratorSummary,
} from '../build/server/products/chat/api/orchestratorDispatchResponse.js';

function createRuntimeStub() {
  return {
    async closeSession() {},
  };
}

function buildPlanTargetingParticipant(channelId, participant) {
  return {
    planId: 'orch-plan-test',
    channelId,
    routing: {
      trigger: 'room_default',
      unresolvedMentions: [],
      mentionNames: [],
      resolution: {
        routingMode: 'room_default',
        selectionKind: 'default_target',
        defaultTarget: {
          participantKind: 'cat',
          participantId: participant.participantId,
          participantName: participant.name,
        },
        defaultTargetReason: 'boss_chat_default',
        fallbackTarget: null,
        blockedReason: null,
        note: null,
      },
      initialTargets: [
        {
          targetKind: 'cat',
          targetId: participant.participantId,
          targetName: participant.name,
          laneId: null,
          sessionId: null,
          trigger: 'room_default',
          plannedDepth: 0,
          branchStrategy: 'fresh_no_parent',
          handoffReason: 'room_default',
          skillProfile: null,
          mcpProfile: null,
          runtimeSkills: null,
          toolIntent: null,
        },
      ],
    },
    execution: {
      planner: 'dynamic_room_workflow',
      loopMode: 'agent_driven',
    },
    executionLoop: {
      dispatchBoundary: 'supervised_runtime_boundary',
    },
    runtimeToolPlane: {
      boundary: 'runtime_mcp_facade',
    },
  };
}

test('Chat dispatch consumes orchestrator plan targets instead of recomputing defaults', async () => {
  const now = new Date('2026-04-25T00:00:00.000Z');
  let state = createDefaultChatState();
  state = createCat(state, {
    name: 'Plan Cat',
    provider: 'claude',
  }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    title: 'Plan-routed chat',
    topic: 'Default routing would choose the orchestrator without the injected plan.',
    originSurface: 'chat',
    roomMode: 'boss_chat',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, {
    catId,
    provider: 'claude',
  }, now);
  const participant = requireChannel(state, channelId).catAssignments[0];
  assert.ok(participant);

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: 'No mention here.',
    },
    createRuntimeStub(),
    now,
    {
      orchestratorPlan: buildPlanTargetingParticipant(channelId, participant),
    },
  );

  assert.equal(begun.preparedTurn?.initialResolution.targets[0]?.participantKind, 'cat');
  assert.equal(
    begun.preparedTurn?.initialResolution.targets[0]?.participantId,
    participant.participantId,
  );
  assert.equal(
    begun.preparedTurn?.activeTurn.targetStatuses[0]?.participant.participantId,
    participant.participantId,
  );
  assert.equal(begun.userMessage.metadata.orchestratorPlanId, 'orch-plan-test');
  assert.equal(begun.userMessage.metadata.orchestratorDispatchBoundary, 'supervised_runtime_boundary');
});

test('dispatch acknowledgement summaries expose only the public target projection', () => {
  const channelId = 'channel-summary';
  const plan = buildPlanTargetingParticipant(channelId, {
    participantId: 'participant-summary',
    name: 'Summary Cat',
  });

  const summary = buildChannelDispatchOrchestratorSummary(plan);
  assert.deepEqual(summary.initialTargets, [
    {
      targetKind: 'cat',
      targetId: 'participant-summary',
      targetName: 'Summary Cat',
      laneId: null,
      sessionId: null,
      trigger: 'room_default',
      plannedDepth: 0,
    },
  ]);
  assert.equal('branchStrategy' in summary.initialTargets[0], false);
  assert.equal('toolIntent' in summary.initialTargets[0], false);
});
