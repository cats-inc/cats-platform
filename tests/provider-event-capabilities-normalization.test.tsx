import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeProductProviderEventCapabilities } from '../src/shared/providerCatalog.ts';

test('normalizeProductProviderEventCapabilities preserves supported stream, transcript, and validation fields', () => {
  const capabilities = normalizeProductProviderEventCapabilities({
    normalizedStream: {
      text: {
        mode: 'chunk',
        stepwise: true,
      },
      toolUse: 'native',
      toolResult: 'derived',
      progress: 'native',
      reasoning: 'none',
    },
    transcript: {
      contentBlocks: 'native',
    },
    presentation: {
      recommended: 'content_blocks',
    },
    notes: ['streaming ok'],
    validation: {
      artifactId: 'artifact-1',
      capturedAt: '2026-04-20T00:00:00.000Z',
      transport: 'runtime-stream',
      runtimeMode: 'direct',
      executionStatus: 'failed',
      observed: {
        incrementalText: true,
        toolUse: true,
        toolResult: false,
        progress: true,
        finalResult: true,
      },
    },
  });

  assert.deepEqual(capabilities, {
    normalizedStream: {
      text: {
        mode: 'chunk',
        stepwise: true,
      },
      toolUse: 'native',
      toolResult: 'derived',
      progress: 'native',
      reasoning: 'none',
    },
    transcript: {
      contentBlocks: 'native',
    },
    presentation: {
      recommended: 'content_blocks',
    },
    notes: ['streaming ok'],
    validation: {
      artifactId: 'artifact-1',
      capturedAt: '2026-04-20T00:00:00.000Z',
      transport: 'runtime-stream',
      runtimeMode: 'direct',
      executionStatus: 'failed',
      observed: {
        incrementalText: true,
        toolUse: true,
        toolResult: false,
        progress: true,
        finalResult: true,
      },
    },
  });
});

test('normalizeProductProviderEventCapabilities falls back unknown or malformed fields to safe defaults', () => {
  const capabilities = normalizeProductProviderEventCapabilities({
    normalizedStream: {
      text: {
        mode: 'weird-mode',
        stepwise: 'yes',
      },
      toolUse: 'bogus',
      toolResult: 'bogus',
      progress: 'bogus',
      reasoning: 'bogus',
    },
    transcript: {
      contentBlocks: 'bogus',
    },
    presentation: {
      recommended: 'bogus',
    },
    notes: ['kept', 42, null],
    validation: {
      artifactId: 1,
      capturedAt: null,
      transport: false,
      executionStatus: 'completed',
      observed: {
        incrementalText: 'yes',
        toolUse: 1,
        toolResult: true,
        progress: false,
        finalResult: true,
      },
    },
  });

  assert.deepEqual(capabilities, {
    normalizedStream: {
      text: {
        mode: 'unknown',
        stepwise: false,
      },
      toolUse: 'unknown',
      toolResult: 'unknown',
      progress: 'unknown',
      reasoning: 'unknown',
    },
    transcript: {
      contentBlocks: 'unknown',
    },
    presentation: {
      recommended: 'unknown',
    },
    notes: ['kept'],
    validation: {
      artifactId: '',
      capturedAt: '',
      transport: '',
      executionStatus: 'completed',
      observed: {
        incrementalText: false,
        toolUse: false,
        toolResult: true,
        progress: false,
        finalResult: true,
      },
    },
  });
});

test('normalizeProductProviderEventCapabilities returns null for non-record inputs', () => {
  assert.equal(normalizeProductProviderEventCapabilities(null), null);
  assert.equal(normalizeProductProviderEventCapabilities([]), null);
});
