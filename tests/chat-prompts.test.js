import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  createChannel as createChatChannel,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';
import {
  buildCatPrompt,
  buildOrchestratorPrompt,
  buildSoloChatBootstrapInstructions,
} from '../build/server/products/chat/state/prompts.js';
import { buildPromptForTarget } from '../build/server/products/chat/state/runtimeTargeting.js';
import { buildChatLaneId } from '../build/server/shared/chatCoreIds.js';

function createChannel() {
  return {
    id: 'channel-1',
    title: 'Telegram inbox',
    topic: 'Route Telegram turns',
    status: 'active',
    formationMode: 'manual',
    repoPath: null,
    chatCwd: null,
    language: 'TypeScript',
    skillProfile: null,
    mcpProfile: null,
    responseLanguage: 'en',
    roomRouting: {
      mode: 'boss_chat',
    },
    assignedCats: [
      {
        catId: 'cat-companion',
        name: 'Companion',
        status: 'active',
        roles: ['support'],
        skillProfile: null,
        memory: {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
        execution: {
          target: {
            provider: 'claude',
            instance: null,
            model: 'sonnet',
          },
        },
      },
    ],
    messages: [],
  };
}

function createOrchestrator() {
  return {
    systemPrompt: 'Be helpful.',
    executionTarget: {
      provider: 'claude',
      instance: null,
      model: 'sonnet',
    },
    memory: {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    },
  };
}

function createSourceMessage() {
  return {
    senderKind: 'user',
    senderName: 'Kenny',
    body: 'hello from web',
  };
}

test('orchestrator prompt omits blank transport sections for non-telegram turns', () => {
  const prompt = buildOrchestratorPrompt(
    createChannel(),
    createOrchestrator(),
    createSourceMessage(),
    'Boss Cat',
    {
      reason: 'System routing selected you as the current turn owner.',
      recentMessages: [],
      transport: 'web',
    },
  );

  assert.ok(!prompt.includes('\n\n\n'));
});

test('cat prompt omits blank transport sections when no transport context is provided', () => {
  const channel = createChannel();
  const prompt = buildCatPrompt(
    channel,
    createOrchestrator(),
    channel.assignedCats[0],
    createSourceMessage(),
    {
      reason: 'System routing selected you for the current turn.',
      recentMessages: [],
    },
  );

  assert.ok(!prompt.includes('\n\n\n'));
});

test('solo chat bootstrap instructions are absent without prior conversational messages', () => {
  assert.equal(buildSoloChatBootstrapInstructions([]), null);
});

test('solo chat bootstrap instructions include only earlier conversational context', () => {
  const instructions = buildSoloChatBootstrapInstructions([
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: 'Started session.',
    },
    {
      senderKind: 'user',
      senderName: 'Kenny',
      body: 'First turn',
    },
    {
      senderKind: 'agent',
      senderName: 'Orchestrator',
      body: 'First reply',
    },
  ]);
  assert.ok(instructions);
  assert.match(instructions, /Earlier chat context:/u);
  assert.match(instructions, /\[user:Kenny\] First turn/u);
  assert.match(instructions, /\[agent:Orchestrator\] First reply/u);
  assert.ok(!instructions.includes('Runtime'));
  assert.ok(!instructions.includes('AGENTS.md'));
  assert.ok(!instructions.includes('Telegram'));
  assert.ok(!instructions.includes('Respond in English'));
});

test('solo chat bootstrap instructions ignore stale same-session replies from a different lane', () => {
  const now = new Date('2026-04-15T00:00:00.000Z');
  let state = createDefaultChatState();
  state = createChatChannel(state, {
    title: 'Solo bootstrap lane test',
    topic: 'Keep bootstrap gated by lane identity.',
    entryKind: 'solo',
    roomMode: 'boss_chat',
  }, now);
  const channelId = state.channels[0].id;
  const reusedSessionId = 'session-orchestrator-reused';
  const staleLaneId = buildChatLaneId('turn-stale', 'target-stale', 'orchestrator');
  const activeLaneId = buildChatLaneId('turn-active', 'target-active', 'orchestrator');

  state = setChannelOrchestratorLease(state, channelId, {
    status: 'ready',
    sessionId: reusedSessionId,
    laneId: activeLaneId,
  }, now);
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Kenny',
      body: 'Earlier context',
    },
    new Date('2026-04-15T00:00:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: 'Orchestrator',
      body: 'Older reply from a stale lane',
    },
    new Date('2026-04-15T00:00:02.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        sessionId: reusedSessionId,
        laneId: staleLaneId,
        targetKind: 'orchestrator',
        assistantTurnId: 'assistant-turn-stale',
        turnId: 'turn-stale',
        terminal: true,
      },
    },
  ).state;
  const currentTurn = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Kenny',
      body: 'Current turn',
    },
    new Date('2026-04-15T00:00:03.000Z'),
  );
  state = currentTurn.state;

  const prompt = buildPromptForTarget(state, channelId, {
    turnId: 'turn-active',
    dispatchId: 'dispatch-active',
    targetStateId: 'target-active',
    parentCheckpointId: null,
    branchStrategy: null,
    handoffReason: null,
    sourceMessage: currentTurn.message,
    sourceParticipant: null,
    targets: [
      {
        participantKind: 'orchestrator',
        participantId: 'orchestrator',
        participantName: 'Orchestrator',
        laneId: activeLaneId,
        sessionId: reusedSessionId,
      },
    ],
    unresolved: [],
    mentionNames: [],
    trigger: 'room_default',
    depth: 0,
    target: {
      participantKind: 'orchestrator',
      participantId: 'orchestrator',
      participantName: 'Orchestrator',
      laneId: activeLaneId,
      sessionId: reusedSessionId,
    },
  });

  assert.ok(prompt.instructions);
  assert.match(prompt.instructions, /Earlier chat context:/u);
});
