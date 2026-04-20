import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRuntimeContentBlock } from '../src/shared/runtimeContentBlocks.ts';

test('normalizeRuntimeContentBlock preserves non-empty block strings verbatim and keeps structured metadata', () => {
  const block = normalizeRuntimeContentBlock({
    block: {
      id: ' block-1 ',
      index: 3,
      kind: 'tool',
      status: 'streaming',
      title: ' Tool output ',
      text: ' partial result ',
      toolName: ' search ',
      toolId: ' tool-1 ',
      metadata: { attempt: 2 },
    },
  });

  assert.deepEqual(block, {
    id: ' block-1 ',
    index: 3,
    kind: 'tool',
    status: 'streaming',
    title: ' Tool output ',
    text: ' partial result ',
    toolName: ' search ',
    toolId: ' tool-1 ',
    metadata: { attempt: 2 },
  });
});

test('normalizeRuntimeContentBlock falls back to an empty text body when text is blank or missing', () => {
  assert.deepEqual(
    normalizeRuntimeContentBlock({
      block: {
        id: 'block-1',
        index: 0,
        kind: 'status',
        status: 'complete',
        text: '   ',
      },
    }),
    {
      id: 'block-1',
      index: 0,
      kind: 'status',
      status: 'complete',
      title: null,
      text: '',
      toolName: null,
      toolId: null,
      metadata: null,
    },
  );

  assert.equal(
    normalizeRuntimeContentBlock({
      block: {
        id: 'block-2',
        index: 1,
        kind: 'text',
        status: 'streaming',
      },
    })?.text,
    '',
  );
});

test('normalizeRuntimeContentBlock rejects malformed or incomplete block envelopes', () => {
  assert.equal(normalizeRuntimeContentBlock({}), null);
  assert.equal(
    normalizeRuntimeContentBlock({
      block: {
        id: '',
        index: 0,
        kind: 'text',
        status: 'streaming',
      },
    }),
    null,
  );
  assert.equal(
    normalizeRuntimeContentBlock({
      block: {
        id: 'block-1',
        index: Number.NaN,
        kind: 'text',
        status: 'streaming',
      },
    }),
    null,
  );
  assert.equal(
    normalizeRuntimeContentBlock({
      block: {
        id: 'block-1',
        index: 0,
        kind: 'unknown',
        status: 'streaming',
      },
    }),
    null,
  );
  assert.equal(
    normalizeRuntimeContentBlock({
      block: {
        id: 'block-1',
        index: 0,
        kind: 'text',
        status: 'pending',
      },
    }),
    null,
  );
});
