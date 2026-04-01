import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCatPrompt,
  buildOrchestratorPrompt,
  buildSoloChatTurnInstructions,
} from '../dist-server/products/chat/state/prompts.js';

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

test('solo chat turn instructions contain only system prompt, language, and no persona', () => {
  const channel = {
    ...createChannel(),
    composerMode: 'solo',
  };
  const instructions = buildSoloChatTurnInstructions(
    channel,
    createOrchestrator(),
    { reason: '', recentMessages: [], transport: 'web' },
  );

  assert.ok(instructions);
  assert.match(instructions, /Be helpful\./u);
  assert.match(instructions, /Respond in English/u);
  assert.ok(!instructions.includes('hidden chat assistant'));
  assert.ok(!instructions.includes('Boss Cat'));
  assert.ok(!instructions.includes('routing'));
  assert.ok(!instructions.includes('room assistant'));
  assert.ok(!instructions.includes('Recent messages'));
});

test('solo chat turn instructions include AGENTS.md guidance when cwd is set', () => {
  const channel = {
    ...createChannel(),
    composerMode: 'solo',
    chatCwd: '/workspace/project',
  };
  const instructions = buildSoloChatTurnInstructions(
    channel,
    createOrchestrator(),
  );

  assert.ok(instructions);
  assert.match(instructions, /AGENTS\.md/u);
});

test('solo chat turn instructions omit AGENTS.md guidance when no cwd', () => {
  const channel = {
    ...createChannel(),
    composerMode: 'solo',
    repoPath: null,
    chatCwd: null,
  };
  const instructions = buildSoloChatTurnInstructions(
    channel,
    createOrchestrator(),
  );

  assert.ok(instructions);
  assert.ok(!instructions.includes('AGENTS.md'));
});

test('solo chat turn instructions include telegram guidance when transport is telegram', () => {
  const channel = {
    ...createChannel(),
    composerMode: 'solo',
  };
  const instructions = buildSoloChatTurnInstructions(
    channel,
    createOrchestrator(),
    { reason: '', recentMessages: [], transport: 'telegram' },
  );

  assert.ok(instructions);
  assert.match(instructions, /Telegram/u);
});
