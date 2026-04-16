import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  createParallelChatGroup,
  sendParallelChatMessage,
} from '../src/products/shared/renderer/api/chat.ts';

test('parallel chat client uses canonical parallel-chat-groups endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];

  globalThis.fetch = async (input, init = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? 'GET',
    });

    if (requests.length === 1) {
      return new Response(JSON.stringify({
        appShell: { chat: { selectedChannelId: 'channel-1' } },
        group: {
          id: 'group-1',
          memberChannelIds: ['channel-1', 'channel-2'],
          members: [],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      appShell: { chat: { selectedChannelId: 'channel-1' } },
      groupId: 'group-1',
      phase: 'acknowledged',
      results: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await createParallelChatGroup({
      title: 'Peer Code',
      targets: [
        { provider: 'claude', instance: null, model: null, modelSelection: null },
        { provider: 'codex', instance: null, model: null, modelSelection: null },
      ],
    });
    await sendParallelChatMessage('group-1', {
      activeChannelId: 'channel-1',
      body: 'hi',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { url: '/api/parallel-chat-groups', method: 'POST' },
    { url: '/api/parallel-chat-groups/group-1/messages', method: 'POST' },
  ]);
});

test('parallel chat resource route keeps the legacy concurrent-groups alias', () => {
  const source = readFileSync(
    path.join(
      process.cwd(),
      'src/products/chat/api/resources/parallelChatGroupRoutes.ts',
    ),
    'utf8',
  );

  assert.match(source, /\/api\/parallel-chat-groups/u);
  assert.match(source, /\/api\/concurrent-groups/u);
  assert.match(source, /\(\?:parallel-chat-groups\|concurrent-groups\)/u);
});
