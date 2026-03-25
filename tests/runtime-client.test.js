import assert from 'node:assert/strict';
import test from 'node:test';

import { CatsRuntimeClient } from '../dist-server/runtime/client.js';

test('runtime client reuses the shared execution-request serializer for outbound payloads', async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const body = typeof init.body === 'string'
      ? JSON.parse(init.body)
      : null;

    requests.push({
      url,
      method: init.method ?? 'GET',
      body,
    });

    if (url.endsWith('/sessions')) {
      return new Response(JSON.stringify({
        id: 'session-1',
        providerName: 'openai',
        status: 'ready',
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    if (url.endsWith('/messages')) {
      return new Response(
        '{"type":"text","text":"ok"}\n{"type":"result","usage":{"inputTokens":1,"outputTokens":2}}\n',
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      );
    }

    if (url.endsWith('/wakeups')) {
      return new Response(JSON.stringify({
        request: {
          id: 'wakeup-1',
        },
        coalesced: false,
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test');

    await client.createSession({
      provider: 'openai',
      requestedStrategy: '  react  ',
      acceptanceCriteria: '  Finish it  ',
      strategyContext: {},
      correlation: {},
    });
    await client.sendMessage('session-1', 'hello', {
      requestedStrategy: '  react  ',
      acceptanceCriteria: '   ',
      strategyContext: {
        phase: 'execute',
      },
      correlation: {
        taskId: '  task-123  ',
        conversationId: ' ',
        product: 'chat',
      },
    });
    await client.createWakeup({
      reason: 'resume task',
      target: {
        sessionId: 'session-1',
      },
      requestedStrategy: '  react  ',
      acceptanceCriteria: '  Finish it  ',
      strategyContext: {},
      correlation: {
        taskId: '  task-123  ',
        workItemId: '  work-1  ',
        product: 'chat',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests.map((request) => request.body), [
    {
      provider: 'openai',
      permissionMode: 'skip',
      requestedStrategy: 'react',
      acceptanceCriteria: 'Finish it',
    },
    {
      message: 'hello',
      requestedStrategy: 'react',
      strategyContext: {
        phase: 'execute',
      },
      correlation: {
        taskId: 'task-123',
        product: 'chat',
      },
    },
    {
      reason: 'resume task',
      target: {
        sessionId: 'session-1',
      },
      requestedStrategy: 'react',
      acceptanceCriteria: 'Finish it',
      correlation: {
        taskId: 'task-123',
        workItemId: 'work-1',
        product: 'chat',
      },
    },
  ]);
});
