import assert from 'node:assert/strict';
import test from 'node:test';

import { CatsRuntimeClient } from '../build/server/runtime/client.js';

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

test('runtime setup scan and apply use the extended setup timeout budget', async () => {
  const timeoutCalls = [];
  const originalFetch = globalThis.fetch;
  const originalAbortSignalTimeout = AbortSignal.timeout;

  AbortSignal.timeout = (ms) => {
    timeoutCalls.push(ms);
    return new AbortController().signal;
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);

    if (url.endsWith('/setup-scan')) {
      return new Response(JSON.stringify({ status: 'completed' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    if (url.endsWith('/setup-apply')) {
      return new Response(JSON.stringify({ status: 'completed' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    if (url.endsWith('/setup-state')) {
      return new Response(JSON.stringify({
        bootstrapRequired: true,
        state: {
          status: 'ready',
          lastScanAt: '2026-03-31T03:31:21.504Z',
          lastManualScanAt: '2026-03-31T03:31:21.504Z',
          appliedAt: null,
          appliedConfigPath: null,
          error: null,
        },
        repair: {
          status: 'ready',
          summary: 'Ready providers are available.',
          preferredScan: {
            source: 'manualScan',
            scannedAt: '2026-03-31T03:31:21.504Z',
            providerCount: 1,
            availableCount: 1,
            unavailableCount: 0,
            remediationCount: 0,
          },
          providersReadyToApply: [
            {
              provider: 'claude',
              family: 'Claude Code CLI',
            },
          ],
          providersNeedingAttention: [],
        },
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
    await client.scanSetup({ manual: true });
    await client.applySetup(['claude']);
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalAbortSignalTimeout;
  }

  assert.deepEqual(timeoutCalls, [120000, 5000, 120000, 5000]);
});

test('runtime client returns truthful provider diagnostics for selector reads', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'http://runtime.test/diagnostics/providers?probe=light') {
      return new Response(JSON.stringify({
        probe: 'light',
        providers: [
          {
            provider: 'claude',
            backend: 'cli',
            instance: 'native',
            availability: {
              status: 'ok',
              summary: 'CLI ready',
              attentionCodes: [],
            },
          },
          {
            provider: 'codex',
            backend: 'agent',
            instance: 'bridge',
            availability: {
              status: 'degraded',
              summary: 'Bridge ready with warnings',
              attentionCodes: ['probe_degraded'],
            },
          },
        ],
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
    const diagnostics = await client.getProviderDiagnostics();
    assert.deepEqual(diagnostics, {
      probe: 'light',
      providers: [
        {
          provider: 'claude',
          backend: 'cli',
          instance: 'native',
          availability: {
            status: 'ok',
            summary: 'CLI ready',
            attentionCodes: [],
          },
        },
        {
          provider: 'codex',
          backend: 'agent',
          instance: 'bridge',
          availability: {
            status: 'degraded',
            summary: 'Bridge ready with warnings',
            attentionCodes: ['probe_degraded'],
          },
        },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime client does not fall back to static advanced catalogs on upstream errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'http://runtime.test/providers/codex/models/advanced') {
      return new Response(JSON.stringify({
        error: 'advanced catalog unavailable',
      }), {
        status: 503,
        headers: {
          'content-type': 'application/json',
        },
      });
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(
      () => client.getAdvancedProviderModels('codex'),
      /advanced catalog unavailable/u,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime client preserves the runtime-sanitized modelSelection returned from session creation', async () => {
  const requests = [];
  let session;
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
        providerName: 'codex',
        model: 'gpt-5.4',
        modelSelection: {
          entryMode: 'auto',
          entryId: 'gpt-5.4',
          controls: {
            'openai.reasoning_effort': 'high',
          },
        },
        modelResolution: {
          entryId: 'gpt-5.4',
          model: 'gpt-5.4',
          entryMode: 'auto',
          controls: {
            'openai.reasoning_effort': 'high',
          },
          supportTier: 'entry_only',
          warnings: [
            'Preset \'deep_reasoning\' is no longer available for codex/api/main; continuing without it.',
          ],
        },
        status: 'ready',
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

    session = await client.createSession({
      provider: 'codex',
      instance: 'main',
      model: 'gpt-5.4',
      modelSelection: {
        entryMode: 'auto',
        entryId: 'gpt-5.4',
        presetId: 'deep_reasoning',
        controls: {
          'openai.reasoning_effort': 'high',
        },
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, {
    provider: 'codex',
    permissionMode: 'skip',
    instance: 'main',
    model: 'gpt-5.4',
    modelSelection: {
      entryMode: 'auto',
      entryId: 'gpt-5.4',
      presetId: 'deep_reasoning',
      controls: {
        'openai.reasoning_effort': 'high',
      },
    },
  });
  assert.deepEqual(session.modelSelection, {
    entryMode: 'auto',
    entryId: 'gpt-5.4',
    controls: {
      'openai.reasoning_effort': 'high',
    },
  });
  assert.deepEqual(session.modelResolution, {
    entryId: 'gpt-5.4',
    model: 'gpt-5.4',
    entryMode: 'auto',
    controls: {
      'openai.reasoning_effort': 'high',
    },
    supportTier: 'entry_only',
    warnings: [
      'Preset \'deep_reasoning\' is no longer available for codex/api/main; continuing without it.',
    ],
  });
});
