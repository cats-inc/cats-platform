import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { appendMessage, createChannel } from '../src/products/chat/state/model/index.ts';
import { resolveMentionRoute } from '../src/products/chat/state/mentionRouter.ts';
import { prepareDispatchTurn } from '../src/products/chat/state/runtime-dispatch/turn.ts';

function createGroupState() {
  const now = new Date('2026-04-28T00:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Routing room',
      topic: 'Routing',
      originSurface: 'chat',
      roomMode: 'boss_chat',
      temporaryParticipants: [
        {
          participantId: 'participant-reviewer',
          name: 'RuntimeReviewer',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
        {
          participantId: 'participant-verifier',
          name: 'RuntimeVerifier',
          provider: 'codex',
          instance: 'default',
          model: 'gpt-5.4',
        },
      ],
    },
    now,
  );
  return {
    state,
    channelId: state.channels[0]!.id,
  };
}

test('explicit mention routing remains Chat-owned deterministic behavior', () => {
  const { state, channelId } = createGroupState();

  const route = resolveMentionRoute(
    state,
    channelId,
    'Please ask @RuntimeVerifier to check this.',
    {
      allowDefaultTarget: true,
      explicitTrigger: 'explicit_mention',
    },
  );

  assert.equal(route.trigger, 'explicit_mention');
  assert.equal(route.routingMode, 'explicit_single');
  assert.deepEqual(route.targets.map((target) => target.participantId), ['participant-verifier']);
  assert.deepEqual(route.unresolvedMentions, []);
});

test('current-turn audience cap is enforced before provider-agent observation', () => {
  const created = createGroupState();
  const stateWithCap = {
    ...created.state,
    capabilities: {
      ...created.state.capabilities,
      maxAudienceParticipants: 1,
    },
  };
  const appended = appendMessage(
    stateWithCap,
    created.channelId,
    {
      senderKind: 'user',
      senderName: 'User',
      body: 'Route to selected audience.',
    },
    new Date('2026-04-28T00:01:00.000Z'),
  );

  const prepared = prepareDispatchTurn(
    appended.state,
    created.channelId,
    {
      body: 'Route to selected audience.',
      messageMetadata: {
        recipientParticipantIds: ['participant-reviewer', 'participant-verifier'],
      },
    },
    new Date('2026-04-28T00:01:00.000Z'),
  );

  assert.deepEqual(
    prepared.initialResolution.targets.map((target) => target.participantId),
    ['participant-reviewer'],
  );
  assert.equal(
    prepared.providerAgentObservation?.summaries.find((summary) =>
      summary.key === 'routing_target_count')?.value,
    1,
  );
});

test('deterministic routing modules do not call provider-agent runtime adapters', () => {
  const files = [
    'src/products/chat/state/mentionRouter.ts',
    'src/products/chat/state/room-routing/runtime.ts',
  ];

  for (const file of files) {
    const source = readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.equal(source.includes('requestProviderAgentDecision'), false, file);
    assert.equal(source.includes('providerAgentAdapter'), false, file);
    assert.equal(source.includes('runtimeClient.'), false, file);
  }
});

test('dispatch turn consumes a Chat-owned deterministic routing plan shape', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/products/chat/state/runtime-dispatch/turn.ts'),
    'utf8',
  );

  assert.equal(source.includes('OrchestratorTurnPlan'), false);
  assert.equal(source.includes('platform/orchestration/contracts'), false);
  assert.equal(source.includes('DeterministicChatRoutingPlan'), true);
});

test('Chat runtime dispatch API no longer accepts old platform plans', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/products/chat/state/runtime-dispatch/routing.ts'),
    'utf8',
  );

  assert.equal(source.includes('OrchestratorTurnPlan'), false);
  assert.equal(source.includes('platform/orchestration/contracts'), false);
  assert.equal(source.includes('orchestratorPlan?:'), false);
  assert.equal(source.includes('deterministicRoutingPlan?: DeterministicChatRoutingPlan'), true);
});

test('Telegram bridge routes through Chat dispatch without building old platform plans', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/products/chat/state/telegramBridgeAdapter.ts'),
    'utf8',
  );

  assert.equal(source.includes('buildOrchestratorTurnPlan'), false);
  assert.equal(source.includes('orchestratorPlannerSurface'), false);
});

test('parallel chat dispatch derives summaries from Chat dispatch state, not old platform plans', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/products/chat/api/resources/parallelChatGroupDispatch.ts'),
    'utf8',
  );

  assert.equal(source.includes('buildOrchestratorTurnPlan'), false);
  assert.equal(source.includes('orchestratorPlannerSurface'), false);
  assert.equal(source.includes('buildChannelDispatchOrchestratorSummaryFromBegun'), true);
});

test('channel message routes acknowledge Chat dispatch without building old platform plans', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/products/chat/api/resources/channelRoutes.ts'),
    'utf8',
  );

  assert.equal(source.includes('buildOrchestratorTurnPlan'), false);
  assert.equal(source.includes('buildChannelMessageOrchestratorPlanState'), false);
  assert.equal(source.includes('buildChannelDispatchAcknowledgementFromBegun'), true);
});

test('channel message routes expose the provider-agent decision requester seam', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/products/chat/api/resources/channelRoutes.ts'),
    'utf8',
  );

  assert.equal(
    source.includes('providerAgentDecisionRequester: context.dependencies.providerAgentDecisionRequester'),
    true,
  );
});
