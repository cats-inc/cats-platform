import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCatPrompt,
  buildOrchestratorPrompt,
  buildSoloChatBootstrapInstructions,
} from '../build/server/products/chat/state/prompts.js';

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

