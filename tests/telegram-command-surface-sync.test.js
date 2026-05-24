import assert from 'node:assert/strict';
import test from 'node:test';

import { createCatActorId } from '../build/server/core/actors.js';
import {
  createTelegramCommandSurfaceSync,
} from '../build/server/app/server/telegramCommandSurfaceSync.js';

function createChatState() {
  return {
    bossCatId: 'cat-boss',
    cats: [
      {
        id: 'cat-boss',
        name: 'Boss Cat',
        status: 'active',
        products: ['chat'],
      },
      {
        id: 'cat-companion',
        name: 'Companion',
        status: 'active',
        products: ['chat'],
      },
      {
        id: 'cat-disabled',
        name: 'Disabled',
        status: 'archived',
        products: ['chat'],
      },
    ],
  };
}

function createCoreState() {
  return {
    botBindings: [
      {
        id: 'binding-default-boss',
        platform: 'telegram',
        botName: 'boss_bot',
        orchestratorActorId: 'actor-orchestrator',
        catActorId: createCatActorId('cat-boss'),
        bossCatActorId: createCatActorId('cat-boss'),
        botToken: null,
        webhookSecret: null,
        inboundMode: 'webhook',
        roomMode: 'direct_message',
        status: 'active',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
      {
        id: 'binding-explicit-companion',
        platform: 'telegram',
        botName: 'companion_bot',
        orchestratorActorId: 'actor-orchestrator',
        catActorId: createCatActorId('cat-companion'),
        bossCatActorId: null,
        botToken: 'explicit-token',
        webhookSecret: null,
        inboundMode: 'polling',
        roomMode: 'direct_message',
        status: 'active',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
      {
        id: 'binding-disabled',
        platform: 'telegram',
        botName: 'disabled_bot',
        orchestratorActorId: 'actor-orchestrator',
        catActorId: createCatActorId('cat-disabled'),
        bossCatActorId: null,
        botToken: 'ignored-token',
        webhookSecret: null,
        inboundMode: 'polling',
        roomMode: 'direct_message',
        status: 'disabled',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
    ],
  };
}

test('telegram command surface sync applies commands and menu button for active bot tokens', async () => {
  const calls = [];
  const sync = createTelegramCommandSurfaceSync({
    chatStore: {
      async read() {
        return createChatState();
      },
      async readCore() {
        return createCoreState();
      },
    },
    defaultBotToken: 'default-token',
    resolveClient(botToken) {
      return {
        async setMyCommands(request) {
          calls.push({ botToken, operation: 'setMyCommands', request });
          return { ok: true };
        },
        async deleteMyCommands(request) {
          calls.push({ botToken, operation: 'deleteMyCommands', request });
          return { ok: true };
        },
        async setChatMenuButton(request) {
          calls.push({ botToken, operation: 'setChatMenuButton', request });
          return { ok: true };
        },
      };
    },
  });

  await sync.reconcile();

  assert.equal(calls.length, 8);
  assert.deepEqual(
    calls.map((call) => `${call.botToken}:${call.operation}`),
    [
      'default-token:setMyCommands',
      'default-token:setMyCommands',
      'default-token:setChatMenuButton',
      'explicit-token:setMyCommands',
      'explicit-token:setMyCommands',
      'explicit-token:setChatMenuButton',
      'ignored-token:deleteMyCommands',
      'ignored-token:deleteMyCommands',
    ],
  );
  assert.equal(calls[0].request.scope.type, 'default');
  assert.equal(calls[0].request.languageCode, null);
  assert.equal(calls[1].request.languageCode, 'zh');
  assert.ok(calls[0].request.commands.some((command) => command.command === 'mode'));
  assert.ok(calls[0].request.commands.some((command) => command.command === 'work'));
  assert.ok(calls[0].request.commands.some((command) => command.command === 'code'));
  assert.deepEqual(calls[2].request, {
    menuButton: { type: 'commands' },
  });
  assert.deepEqual(calls[6].request, {
    scope: { type: 'default' },
    languageCode: null,
  });
  assert.deepEqual(calls[7].request, {
    scope: { type: 'default' },
    languageCode: 'zh',
  });
});

test('telegram command surface sync skips reconciliation when no bot token is available', async () => {
  let callCount = 0;
  const sync = createTelegramCommandSurfaceSync({
    chatStore: {
      async read() {
        return createChatState();
      },
      async readCore() {
        return {
          botBindings: [
            {
              ...createCoreState().botBindings[0],
              botToken: null,
            },
          ],
        };
      },
    },
    resolveClient() {
      callCount += 1;
      return {
        async setMyCommands() {
          return { ok: true };
        },
        async deleteMyCommands() {
          return { ok: true };
        },
        async setChatMenuButton() {
          return { ok: true };
        },
      };
    },
  });

  await sync.reconcile();

  assert.equal(callCount, 0);
});

test('telegram command surface sync clears stale bot tokens that disappeared from active bindings', async () => {
  const calls = [];
  const sync = createTelegramCommandSurfaceSync({
    chatStore: {
      async read() {
        return createChatState();
      },
      async readCore() {
        return {
          botBindings: [],
        };
      },
    },
    resolveClient(botToken) {
      return {
        async setMyCommands(request) {
          calls.push({ botToken, operation: 'setMyCommands', request });
          return { ok: true };
        },
        async deleteMyCommands(request) {
          calls.push({ botToken, operation: 'deleteMyCommands', request });
          return { ok: true };
        },
        async setChatMenuButton(request) {
          calls.push({ botToken, operation: 'setChatMenuButton', request });
          return { ok: true };
        },
      };
    },
  });

  await sync.reconcile({
    staleBotTokens: ['stale-token'],
  });

  assert.deepEqual(calls, [
    {
      botToken: 'stale-token',
      operation: 'deleteMyCommands',
      request: { scope: { type: 'default' }, languageCode: null },
    },
    {
      botToken: 'stale-token',
      operation: 'deleteMyCommands',
      request: { scope: { type: 'default' }, languageCode: 'zh' },
    },
  ]);
});
