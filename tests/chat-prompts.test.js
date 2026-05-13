import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  buildChannelView,
  createChannel as createChatChannel,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';
import {
  buildCatPrompt,
  buildOrchestratorPrompt,
  buildBoundedRecentContextInstructions,
  buildDefaultChatContinuityTransplantPackage,
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
      mode: 'chat_channel',
    },
    assignedCats: [
      {
        catId: 'cat-companion',
        name: 'Companion',
        status: 'active',
        roles: ['support'],
        skillProfile: null,
        mcpProfile: null,
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
    skillProfile: null,
    mcpProfile: null,
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

test('orchestrator prompt includes Cat tool profiles in the participant roster', () => {
  const channel = createChannel();
  channel.assignedCats[0].name = 'Work Planner';
  channel.assignedCats[0].roles = ['planner'];
  channel.assignedCats[0].mcpProfile = 'work-memory';
  const prompt = buildOrchestratorPrompt(
    channel,
    createOrchestrator(),
    createSourceMessage(),
    'Boss Cat',
    {
      reason: 'System routing selected you as the current turn owner.',
      recentMessages: [],
      transport: 'web',
    },
  );

  assert.match(prompt, /Work Planner \(claude \/ sonnet; roles: planner/u);
  assert.match(prompt, /tool profile: work-memory/u);
  assert.match(prompt, /work capabilities: capture\/propose Work Items/u);
  assert.match(prompt, /look up\/create Projects/u);
  assert.match(prompt, /update\/assign Work Items when phase policy allows/u);
});

test('orchestrator prompt includes the global orchestrator tool profile', () => {
  const orchestrator = createOrchestrator();
  orchestrator.mcpProfile = 'work-memory';
  const prompt = buildOrchestratorPrompt(
    createChannel(),
    orchestrator,
    createSourceMessage(),
    'Boss Cat',
    {
      reason: 'System routing selected you as the current turn owner.',
      recentMessages: [],
      transport: 'web',
    },
  );

  assert.match(prompt, /Global orchestrator tool profile: work-memory/u);
  assert.match(prompt, /work capabilities: capture\/propose Work Items/u);
  assert.match(prompt, /look up\/create Projects/u);
  assert.match(prompt, /update\/assign Work Items when phase policy allows/u);
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

test('default chat bootstrap instructions are absent without prior conversational messages', () => {
  assert.equal(buildBoundedRecentContextInstructions([]), null);
});

test('default chat bootstrap instructions include only earlier conversational context', () => {
  const instructions = buildBoundedRecentContextInstructions([
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

test('default chat continuity package compacts oversized transcripts into semantic transplant instructions', () => {
  const oversizedTranscript = Array.from({ length: 48 }, (_value, index) => ({
    senderKind: index % 2 === 0 ? 'user' : 'agent',
    senderName: index % 2 === 0 ? 'Kenny' : 'Orchestrator',
    body: `Oversized earlier turn ${index + 1}: ${'x'.repeat(420)}`,
  }));

  const continuityPackage = buildDefaultChatContinuityTransplantPackage(oversizedTranscript);

  assert.equal(continuityPackage.mode, 'semantic_transplant');
  assert.ok(continuityPackage.instructions);
  assert.match(continuityPackage.instructions, /Same conversation continuity package:/u);
  assert.match(continuityPackage.instructions, /Earlier continuity digest:/u);
  assert.match(continuityPackage.instructions, /Recent verbatim/u);
  assert.ok(continuityPackage.instructions.length <= 12_000);
});

test('semantic continuity digest keeps a representative middle snippet instead of only chunk edges', () => {
  const oversizedTranscript = Array.from({ length: 120 }, (_value, index) => ({
    senderKind: 'user',
    senderName: 'Kenny',
    body: index === 57
      ? 'Critical middle decision: keep the rollback path and preserve the migration flag.'
      : `Oversized user turn ${index + 1}: ${'x'.repeat(160)}`,
  }));

  const continuityPackage = buildDefaultChatContinuityTransplantPackage(oversizedTranscript);

  assert.equal(continuityPackage.mode, 'semantic_transplant');
  assert.match(
    continuityPackage.instructions ?? '',
    /Critical middle decision: keep the rollback path and preserve the migration flag\./u,
  );
});

test('default chat continuity transplant instructions keep the full earlier conversational transcript', () => {
  const continuityPackage = buildDefaultChatContinuityTransplantPackage([
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: 'Started session.',
    },
    ...Array.from({ length: 10 }, (_value, index) => ({
      senderKind: index % 2 === 0 ? 'user' : 'agent',
      senderName: index % 2 === 0 ? 'Kenny' : 'Orchestrator',
      body: `Earlier turn ${index + 1}`,
    })),
  ]);
  const instructions = continuityPackage.instructions;

  assert.ok(instructions);
  assert.equal(continuityPackage.mode, 'full_transplant');
  assert.match(instructions, /Same conversation continuity transcript:/u);
  assert.match(instructions, /\[user:Kenny\] Earlier turn 1/u);
  assert.match(instructions, /\[agent:Orchestrator\] Earlier turn 10/u);
  assert.ok(!instructions.includes('Runtime'));
});

test('default chat continuity transplant instructions preserve preceding tool labels for assistant turns', () => {
  const instructions = buildDefaultChatContinuityTransplantPackage([
    {
      senderKind: 'user',
      senderName: 'Kenny',
      body: 'Please inspect the repo state.',
      metadata: {},
    },
    {
      senderKind: 'agent',
      senderName: 'Orchestrator',
      body: 'I checked the relevant files and found the issue.',
      metadata: {
        precedingTools: [
          { toolName: 'search_repo', toolId: 'tool-search' },
          { toolName: 'read_file', toolId: 'tool-read' },
        ],
      },
    },
  ]).instructions;

  assert.ok(instructions);
  assert.match(
    instructions,
    /\[agent:Orchestrator\] \[tools: search_repo, read_file\] I checked the relevant files and found the issue\./u,
  );
});

test('default chat continuity transplant instructions fold segmented assistant turns into one line', () => {
  const instructions = buildDefaultChatContinuityTransplantPackage([
    {
      senderKind: 'user',
      senderName: 'Kenny',
      body: 'Summarize the findings.',
      metadata: {},
    },
    {
      senderKind: 'agent',
      senderName: 'Orchestrator',
      body: 'First segment. ',
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-1',
      },
    },
    {
      senderKind: 'agent',
      senderName: 'Orchestrator',
      body: 'Second segment.',
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-1',
        precedingTools: [{ toolName: 'search_repo', toolId: 'tool-search' }],
      },
    },
  ]).instructions;

  assert.ok(instructions);
  assert.match(
    instructions,
    /\[agent:Orchestrator\] \[tools: search_repo\] First segment\. Second segment\./u,
  );
  assert.equal(
    instructions.match(/\[agent:Orchestrator\]/gu)?.length ?? 0,
    1,
  );
});

test('default chat continuity transplant instructions preserve structured choice responses without body text', () => {
  const instructions = buildDefaultChatContinuityTransplantPackage([
    {
      id: 'message-choice-response',
      channelId: 'channel-1',
      senderKind: 'user',
      senderName: 'User',
      body: '',
      choiceResponse: {
        sourceMessageId: 'message-choice-source',
        status: 'submitted',
        answers: [
          {
            question: 'Which delivery mode should we use?',
            selectedOptionIds: ['minimal'],
            customText: 'Keep it shippable.',
          },
        ],
        submittedAt: '2026-04-17T00:00:00.000Z',
      },
      mentions: [],
      metadata: {},
      usage: null,
      executionProvider: null,
      executionModel: null,
      executionInstance: null,
      createdAt: '2026-04-17T00:00:00.000Z',
    },
  ]).instructions;

  assert.ok(instructions);
  assert.match(
    instructions,
    /\[user:User\] Q: Which delivery mode should we use\?\nA: minimal, Keep it shippable\./u,
  );
});

test('default chat does not re-bootstrap when the same runtime session is reused across lanes', () => {
  const now = new Date('2026-04-15T00:00:00.000Z');
  let state = createDefaultChatState();
  state = createChatChannel(state, {
    title: 'Default bootstrap lane test',
    topic: 'Keep bootstrap gated by lane identity.',
    originSurface: 'chat',
    entryKind: 'default',
    roomMode: 'chat_channel',
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

  assert.equal(prompt.instructions, null);
});

test('multi-participant cat routing emits a targeted handoff package for first-turn context', () => {
  const now = new Date('2026-04-15T00:00:00.000Z');
  let state = createDefaultChatState();
  state = createChatChannel(state, {
    title: 'Group handoff test',
    topic: 'Ensure a newly engaged participant receives bounded room context.',
    originSurface: 'chat',
    temporaryParticipants: [
      {
        name: 'Agent-1',
        provider: 'claude',
        model: 'claude-default',
      },
      {
        name: 'Agent-2',
        provider: 'gemini',
        model: 'gemini-default',
      },
    ],
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.channels[0].id;
  const activeParticipants = buildChannelView(state, channelId).assignedParticipants
    .filter((participant) => participant.status === 'active');
  const firstParticipant = activeParticipants[0];
  const secondParticipant = activeParticipants[1];

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Kenny',
      body: 'Need a quick review before we patch this.',
    },
    new Date('2026-04-15T00:00:01.000Z'),
  ).state;
  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: firstParticipant.name,
      body: 'I inspected the issue and think Agent-2 should validate the fix path.',
    },
    new Date('2026-04-15T00:00:02.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        targetKind: 'cat',
        targetId: firstParticipant.participantId,
        assistantTurnId: 'assistant-turn-agent-1',
      },
    },
  ).state;
  const routedTurn = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: firstParticipant.name,
      body: '@Agent-2 please double-check the plan.',
    },
    new Date('2026-04-15T00:00:03.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        targetKind: 'cat',
        targetId: firstParticipant.participantId,
        assistantTurnId: 'assistant-turn-agent-1',
      },
    },
  );
  state = routedTurn.state;

  const prompt = buildPromptForTarget(state, channelId, {
    turnId: 'turn-group-1',
    dispatchId: 'dispatch-group-1',
    targetStateId: 'target-group-1',
    parentCheckpointId: null,
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    sourceMessage: routedTurn.message,
    sourceParticipant: {
      participantKind: 'cat',
      participantId: firstParticipant.participantId,
      participantName: firstParticipant.name,
    },
    targets: [
      {
        participantKind: 'cat',
        participantId: secondParticipant.participantId,
        participantName: secondParticipant.name,
        laneId: null,
        sessionId: null,
      },
    ],
    unresolved: [],
    mentionNames: ['Agent-2'],
    trigger: 'continuation_mention',
    depth: 1,
    target: {
      participantKind: 'cat',
      participantId: secondParticipant.participantId,
      participantName: secondParticipant.name,
      laneId: null,
      sessionId: null,
    },
  });

  assert.equal(prompt.continuityMode, 'targeted_handoff');
  assert.equal(prompt.continuityDeliveryMode, 'turn_instructions');
  assert.match(prompt.instructions ?? '', /Targeted same-conversation handoff context:/u);
  assert.match(prompt.instructions ?? '', /Relevant recent room messages:/u);
  assert.match(prompt.instructions ?? '', /This handoff came from Agent-1\./u);
});

test('multi-participant cat routing keeps continuity metadata null when no handoff package is needed', () => {
  const now = new Date('2026-04-15T00:00:00.000Z');
  let state = createDefaultChatState();
  state = createChatChannel(state, {
    title: 'Fresh group handoff test',
    topic: 'No prior conversational context should not force continuity metadata.',
    originSurface: 'chat',
    temporaryParticipants: [
      {
        name: 'Agent-1',
        provider: 'claude',
        model: 'claude-default',
      },
      {
        name: 'Agent-2',
        provider: 'gemini',
        model: 'gemini-default',
      },
    ],
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.channels[0].id;
  const activeParticipants = buildChannelView(state, channelId).assignedParticipants
    .filter((participant) => participant.status === 'active');
  const firstParticipant = activeParticipants[0];
  const secondParticipant = activeParticipants[1];
  const routedTurn = appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: 'Wake Agent-2 now.',
    },
    new Date('2026-04-15T00:00:03.000Z'),
    {
      metadata: {
        event: 'assistant_turn_segment',
        targetKind: 'cat',
        targetId: firstParticipant.participantId,
        assistantTurnId: 'assistant-turn-agent-1',
      },
    },
  );
  state = routedTurn.state;

  const prompt = buildPromptForTarget(state, channelId, {
    turnId: 'turn-group-2',
    dispatchId: 'dispatch-group-2',
    targetStateId: 'target-group-2',
    parentCheckpointId: null,
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    sourceMessage: routedTurn.message,
    sourceParticipant: {
      participantKind: 'cat',
      participantId: firstParticipant.participantId,
      participantName: firstParticipant.name,
    },
    targets: [
      {
        participantKind: 'cat',
        participantId: secondParticipant.participantId,
        participantName: secondParticipant.name,
        laneId: null,
        sessionId: null,
      },
    ],
    unresolved: [],
    mentionNames: ['Agent-2'],
    trigger: 'continuation_mention',
    depth: 1,
    target: {
      participantKind: 'cat',
      participantId: secondParticipant.participantId,
      participantName: secondParticipant.name,
      laneId: null,
      sessionId: null,
    },
  });

  assert.equal(prompt.instructions ?? null, null);
  assert.equal(prompt.continuityMode ?? null, null);
  assert.equal(prompt.continuityDeliveryMode ?? null, null);
});
