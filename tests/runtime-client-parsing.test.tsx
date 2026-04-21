import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRuntimeProviderConfigRegistry,
  normalizeRuntimeProviderDiagnosticsPayload,
  readRuntimeErrorText,
} from '../src/runtime/clientParsing.ts';

test('readRuntimeErrorText prefers parsed error payloads and falls back to trimmed raw text', () => {
  assert.equal(readRuntimeErrorText('', 'fallback'), 'fallback');
  assert.equal(readRuntimeErrorText('   ', 'fallback'), 'fallback');
  assert.equal(
    readRuntimeErrorText(JSON.stringify({ error: 'runtime offline' }), 'fallback'),
    'runtime offline',
  );
  assert.equal(
    readRuntimeErrorText(JSON.stringify({ message: 'ignored' }), 'fallback'),
    '{"message":"ignored"}',
  );
  assert.equal(readRuntimeErrorText(' raw failure ', 'fallback'), 'raw failure');
});

test('normalizeRuntimeProviderConfigRegistry keeps valid providers and instances while dropping malformed entries', () => {
  const registry = normalizeRuntimeProviderConfigRegistry({
    providers: {
      claude: {
        defaultInstance: 'native',
        defaultBackend: 'cli',
        instances: [
          {
            id: ' native ',
            target: 'cli/native',
            backend: 'cli',
            command: 'claude',
            args: ['--chrome'],
            runner: 'pty',
            runtime: 'cats-runtime',
            transport: 'stdio',
            model: 'opus',
            eventCapabilities: {
              normalizedStream: {
                text: { mode: 'chunk', stepwise: true },
                toolUse: 'native',
                toolResult: 'derived',
                progress: 'native',
                reasoning: 'none',
              },
              transcript: { contentBlocks: 'native' },
              presentation: { recommended: 'content_blocks' },
              notes: ['ok'],
            },
          },
          {
            id: '   ',
          },
          null,
        ],
      },
      codex: 'invalid',
    },
  });

  assert.deepEqual(registry, {
    claude: {
      defaultInstance: 'native',
      defaultBackend: 'cli',
      instances: [
        {
          id: 'native',
          target: 'cli/native',
          backend: 'cli',
          command: 'claude',
          args: ['--chrome'],
          runner: 'pty',
          runtime: 'cats-runtime',
          transport: 'stdio',
          model: 'opus',
          eventCapabilities: {
            normalizedStream: {
              text: { mode: 'chunk', stepwise: true },
              toolUse: 'native',
              toolResult: 'derived',
              progress: 'native',
              reasoning: 'none',
            },
            transcript: { contentBlocks: 'native' },
            presentation: { recommended: 'content_blocks' },
            notes: ['ok'],
          },
        },
      ],
    },
  });
});

test('normalizeRuntimeProviderConfigRegistry warns when provider args are malformed', () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };

  try {
    const registry = normalizeRuntimeProviderConfigRegistry({
      providers: {
        claude: {
          instances: [
            {
              id: 'native',
              args: ['--chrome', '', 12],
            },
          ],
        },
      },
    });

    assert.deepEqual(registry.claude?.instances[0]?.args, ['--chrome']);
    assert.deepEqual(warnings, [
      '[runtime-client] Ignored 2 invalid provider args entries.',
    ]);
  } finally {
    console.warn = originalWarn;
  }
});

test('normalizeRuntimeProviderDiagnosticsPayload preserves valid entries and falls back unknown availability to safe defaults', () => {
  const payload = normalizeRuntimeProviderDiagnosticsPayload({
    probe: 'deep',
    providers: [
      {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultTarget: true,
        availability: {
          status: 'OK',
          summary: 'reachable',
          attentionCodes: ['warmup', '', 42],
        },
      },
      {
        provider: 'codex',
        availability: {
          status: 'mystery',
        },
      },
      {
        provider: '   ',
      },
    ],
  });

  assert.deepEqual(payload, {
    probe: 'deep',
    providers: [
      {
        provider: 'claude',
        backend: 'cli',
        instance: 'native',
        defaultTarget: true,
        availability: {
          status: 'ok',
          summary: 'reachable',
          attentionCodes: ['warmup'],
        },
      },
      {
        provider: 'codex',
        backend: null,
        instance: null,
        defaultTarget: false,
        availability: {
          status: 'unknown',
          summary: null,
          attentionCodes: [],
        },
      },
    ],
  });
});
