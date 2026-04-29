import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CatsRuntimeClient,
  DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS,
  DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS,
  resolveDefaultSessionCreateSlowWarningMs,
} from '../build/server/runtime/client.js';

function createTimeoutSignalRecorder() {
  const calls = [];
  return {
    calls,
    createTimeoutSignal(ms) {
      calls.push(ms);
      return new AbortController().signal;
    },
  };
}

function createIdleTimeoutRecorder() {
  const calls = [];
  const controllers = [];
  return {
    calls,
    controllers,
    createIdleTimeoutController(ms) {
      calls.push(ms);
      const controller = new AbortController();
      const record = {
        resetCalls: 0,
        clearCalls: 0,
      };
      controllers.push(record);
      return {
        signal: controller.signal,
        reset() {
          record.resetCalls += 1;
        },
        clear() {
          record.clearCalls += 1;
        },
      };
    },
  };
}

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

test('runtime client synthesizes a text segment from coarse result-only delivery', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/messages')) {
      return new Response(
        '{"type":"result","text":"final coarse reply","usage":{"inputTokens":2,"outputTokens":3}}\n',
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      );
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test');
    const result = await client.sendMessage('session-1', 'hello');

    assert.deepEqual(result, {
      segments: [{ kind: 'text', text: 'final coarse reply', toolName: null, toolId: null }],
      inputTokens: 2,
      outputTokens: 3,
      tokensUsed: 5,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime client keeps the standard request timeout separate from message stream idle timeout', async () => {
  const idleTimeout = createIdleTimeoutRecorder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/messages')) {
      assert.ok(init.signal);
      return new Response(
        '{"type":"text","text":"ok"}\n{"type":"result","usage":{"inputTokens":1,"outputTokens":1}}\n',
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      );
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test', {
      timeoutMs: 12_345,
      createIdleTimeoutController: idleTimeout.createIdleTimeoutController,
    });
    await client.sendMessage('session-1', 'hello');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(idleTimeout.calls, [DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS]);
  assert.equal(idleTimeout.controllers[0]?.clearCalls, 1);
});

test('runtime client uses an extended default timeout for session creation', async () => {
  const timeoutSignals = createTimeoutSignalRecorder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/sessions')) {
      return new Response(JSON.stringify({
        id: 'session-1',
        providerName: 'claude',
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
    const client = new CatsRuntimeClient('http://runtime.test', {
      timeoutMs: 12_345,
      createTimeoutSignal: timeoutSignals.createTimeoutSignal,
    });
    await client.createSession({ provider: 'claude' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(timeoutSignals.calls, [DEFAULT_RUNTIME_SESSION_CREATE_TIMEOUT_MS]);
});

test('runtime client lets callers override the session-create timeout separately', async () => {
  const timeoutSignals = createTimeoutSignalRecorder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/sessions')) {
      return new Response(JSON.stringify({
        id: 'session-1',
        providerName: 'claude',
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
    const client = new CatsRuntimeClient('http://runtime.test', {
      sessionCreateTimeoutMs: 45_000,
      timeoutMs: 5_000,
      createTimeoutSignal: timeoutSignals.createTimeoutSignal,
    });
    await client.createSession({ provider: 'claude' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(timeoutSignals.calls, [45_000]);
});

test('runtime client uses an extended default idle timeout for message streams', async () => {
  const idleTimeout = createIdleTimeoutRecorder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/messages')) {
      return new Response(
        '{"type":"text","text":"ok"}\n{"type":"result","usage":{"inputTokens":1,"outputTokens":1}}\n',
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      );
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test', {
      createIdleTimeoutController: idleTimeout.createIdleTimeoutController,
    });
    await client.sendMessage('session-1', 'hello');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(idleTimeout.calls, [DEFAULT_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS]);
  assert.equal(idleTimeout.controllers[0]?.resetCalls >= 1, true);
  assert.equal(idleTimeout.controllers[0]?.clearCalls, 1);
});

test('runtime client lets callers override the message stream idle timeout separately', async () => {
  const idleTimeout = createIdleTimeoutRecorder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/messages')) {
      return new Response(
        '{"type":"text","text":"ok"}\n{"type":"result","usage":{"inputTokens":1,"outputTokens":1}}\n',
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      );
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test', {
      messageIdleTimeoutMs: 60_000,
      timeoutMs: 5_000,
      createIdleTimeoutController: idleTimeout.createIdleTimeoutController,
    });
    await client.sendMessage('session-1', 'hello');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(idleTimeout.calls, [60_000]);
  assert.equal(idleTimeout.controllers[0]?.clearCalls, 1);
});

test('resolveDefaultSessionCreateSlowWarningMs scales with the session-create budget', () => {
  assert.equal(resolveDefaultSessionCreateSlowWarningMs(60_000), 10_000);
  assert.equal(resolveDefaultSessionCreateSlowWarningMs(180_000), 30_000);
  assert.equal(resolveDefaultSessionCreateSlowWarningMs(6_000), 2_000);
  assert.equal(resolveDefaultSessionCreateSlowWarningMs(12_000), 2_000);
});

test('runtime client emits slow-session diagnostic via DI hook instead of console.warn', async () => {
  const diagnostics = [];
  const originalFetch = globalThis.fetch;
  let warnCalls = 0;
  const originalWarn = console.warn;
  console.warn = () => {
    warnCalls += 1;
  };

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/sessions')) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(JSON.stringify({
        id: 'session-slow',
        providerName: 'claude',
        status: 'ready',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test', {
      sessionCreateSlowWarningMs: 5,
      onClientDiagnostic: (event) => diagnostics.push(event),
      now: () => new Date('2026-04-29T10:00:00.000Z'),
    });
    await client.createSession({ provider: 'claude' });
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }

  assert.equal(warnCalls, 0);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.kind, 'slow_session_create');
  assert.equal(diagnostics[0]?.provider, 'claude');
  assert.equal(diagnostics[0]?.sessionId, 'session-slow');
  assert.equal(diagnostics[0]?.thresholdMs, 5);
  assert.equal(diagnostics[0]?.observedAt, '2026-04-29T10:00:00.000Z');
  assert.equal(typeof diagnostics[0]?.elapsedMs, 'number');
  assert.equal(diagnostics[0]?.elapsedMs >= 5, true);
});

test('runtime client does not emit slow-session diagnostic when create is fast', async () => {
  const diagnostics = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/sessions')) {
      return new Response(JSON.stringify({
        id: 'session-fast',
        providerName: 'claude',
        status: 'ready',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test', {
      sessionCreateSlowWarningMs: 60_000,
      onClientDiagnostic: (event) => diagnostics.push(event),
    });
    await client.createSession({ provider: 'claude' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(diagnostics, []);
});

test('runtime client synthesizes a text segment from content-array result delivery', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/messages')) {
      return new Response(
        [
          JSON.stringify({
            type: 'result',
            content: [{ type: 'output_text', text: 'final content-array reply' }],
            usage: { inputTokens: 4, outputTokens: 6 },
          }),
          '',
        ].join('\n'),
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      );
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test');
    const result = await client.sendMessage('session-1', 'hello');

    assert.deepEqual(result, {
      segments: [{ kind: 'text', text: 'final content-array reply', toolName: null, toolId: null }],
      inputTokens: 4,
      outputTokens: 6,
      tokensUsed: 10,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime client appends final result text after tool-only delivery events', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/messages')) {
      return new Response(
        [
          '{"type":"tool_use","toolName":"search_repo","toolId":"tool-1"}',
          '{"type":"result","text":"completed after tool call","usage":{"inputTokens":5,"outputTokens":8}}',
          '',
        ].join('\n'),
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      );
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test');
    const result = await client.sendMessage('session-1', 'hello');

    assert.deepEqual(result, {
      segments: [
        { kind: 'tool_use', text: '', toolName: 'search_repo', toolId: 'tool-1' },
        { kind: 'text', text: 'completed after tool call', toolName: null, toolId: null },
      ],
      inputTokens: 5,
      outputTokens: 8,
      tokensUsed: 13,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime client normalizes streaming tool_result content arrays into tool_result segments', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/messages')) {
      return new Response(
        [
          JSON.stringify({
            type: 'tool_result',
            toolName: 'read_file',
            toolId: 'tool-stream-1',
            content: [{ type: 'output_text', text: 'streamed nested tool result' }],
          }),
          JSON.stringify({
            type: 'result',
            usage: { inputTokens: 3, outputTokens: 4 },
          }),
          '',
        ].join('\n'),
        {
          status: 200,
          headers: {
            'content-type': 'application/x-ndjson',
          },
        },
      );
    }

    throw new Error(`Unexpected runtime client request: ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test');
    const result = await client.sendMessage('session-1', 'hello');

    assert.deepEqual(result, {
      segments: [
        {
          kind: 'tool_result',
          text: 'streamed nested tool result',
          toolName: 'read_file',
          toolId: 'tool-stream-1',
        },
      ],
      inputTokens: 3,
      outputTokens: 4,
      tokensUsed: 7,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runtime setup summary reads still use the standard runtime timeout budget', async () => {
  const timeoutSignals = createTimeoutSignalRecorder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);

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
    const client = new CatsRuntimeClient('http://runtime.test', {
      createTimeoutSignal: timeoutSignals.createTimeoutSignal,
    });
    const payload = await client.getSetupState();
    assert.equal(payload.bootstrapRequired, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(timeoutSignals.calls, [5000]);
});

test('runtime client returns truthful provider diagnostics for filtered selector reads', async () => {
  const timeoutSignals = createTimeoutSignalRecorder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (
      url.origin === 'http://runtime.test'
      && url.pathname === '/diagnostics/providers'
      && url.searchParams.get('probe') === 'light'
      && url.searchParams.get('scope') === 'availability'
      && url.searchParams.get('provider') === 'claude'
    ) {
      return new Response(JSON.stringify({
        probe: 'light',
        providers: [
          {
            provider: 'claude',
            backend: 'cli',
            instance: 'native',
            defaultTarget: true,
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
            defaultTarget: false,
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

    throw new Error(`Unexpected runtime client request: ${url.toString()}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test', {
      createTimeoutSignal: timeoutSignals.createTimeoutSignal,
    });
    const diagnostics = await client.getProviderDiagnostics({
      provider: 'claude',
      scope: 'availability',
    });
    assert.deepEqual(diagnostics, {
      probe: 'light',
      providers: [
        {
          provider: 'claude',
          backend: 'cli',
          instance: 'native',
          defaultTarget: true,
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
          defaultTarget: false,
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

  assert.deepEqual(timeoutSignals.calls, [8000]);
});

test('runtime client uses the extended provider-registry timeout for provider config reads', async () => {
  const timeoutSignals = createTimeoutSignalRecorder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'http://runtime.test/providers/config') {
      return new Response(JSON.stringify({
        providers: {
          claude: {
            defaultInstance: 'native',
            defaultBackend: 'cli',
            instances: [
              {
                id: 'native',
                target: 'cli/native',
                backend: 'cli',
              },
            ],
          },
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
    const client = new CatsRuntimeClient('http://runtime.test', {
      createTimeoutSignal: timeoutSignals.createTimeoutSignal,
    });
    const registry = await client.getProviderConfig();
    assert.equal(registry.claude?.defaultInstance, 'native');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(timeoutSignals.calls, [10000]);
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

test('runtime client forwards explicit workspace access and permission policy on session creation', async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const body = typeof init.body === 'string'
      ? JSON.parse(init.body)
      : null;
    requests.push({ url, body });

    if (url.endsWith('/sessions')) {
      return new Response(JSON.stringify({
        id: 'session-1',
        providerName: 'claude',
        status: 'ready',
        cwd: 'C:/repo/cats-platform',
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
      provider: 'claude',
      cwd: 'C:/repo/cats-platform',
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests[0]?.body, {
    provider: 'claude',
    permissionMode: 'default',
    cwd: 'C:/repo/cats-platform',
    workspaceKind: 'worktree',
    workspaceAccess: 'read_only',
  });
});
