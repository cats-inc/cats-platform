import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRuntimeMessageSegmentEntry,
  readRuntimeMessageResultSegments,
  readRuntimeMessageResultText,
} from '../src/runtime/messageSegments.ts';

test('normalizeRuntimeMessageSegmentEntry accepts text, output_text, tool_use, and tool_result shapes', () => {
  assert.deepEqual(
    normalizeRuntimeMessageSegmentEntry('Hello'),
    { kind: 'text', text: 'Hello', toolName: null, toolId: null },
  );
  assert.deepEqual(
    normalizeRuntimeMessageSegmentEntry({
      type: 'output_text',
      text: 'From output text',
    }),
    { kind: 'text', text: 'From output text', toolName: null, toolId: null },
  );
  assert.deepEqual(
    normalizeRuntimeMessageSegmentEntry({
      kind: 'tool_use',
      name: 'search',
      tool_use_id: 'tool-1',
      content: [{ text: 'running' }],
    }),
    { kind: 'tool_use', text: 'running', toolName: 'search', toolId: 'tool-1' },
  );
  assert.deepEqual(
    normalizeRuntimeMessageSegmentEntry({
      kind: 'tool_result',
      toolName: 'search',
      toolId: 'tool-1',
      text: 'done',
    }),
    { kind: 'tool_result', text: 'done', toolName: 'search', toolId: 'tool-1' },
  );
});

test('normalizeRuntimeMessageSegmentEntry rejects empty or unsupported entries', () => {
  assert.equal(normalizeRuntimeMessageSegmentEntry(''), null);
  assert.equal(normalizeRuntimeMessageSegmentEntry({ kind: 'text', text: '' }), null);
  assert.equal(normalizeRuntimeMessageSegmentEntry({ kind: 'unknown', text: 'nope' }), null);
  assert.equal(normalizeRuntimeMessageSegmentEntry(null), null);
});

test('readRuntimeMessageResultSegments finds the first non-empty candidate array across nested result shapes', () => {
  assert.deepEqual(
    readRuntimeMessageResultSegments({
      output: [
        {
          content: [
            { type: 'output_text', text: 'first' },
            { kind: 'tool_result', toolName: 'search', id: 'tool-2', content: 'second' },
          ],
        },
      ],
    }),
    [
      { kind: 'text', text: 'first', toolName: null, toolId: null },
      { kind: 'tool_result', text: 'second', toolName: 'search', toolId: 'tool-2' },
    ],
  );

  assert.deepEqual(
    readRuntimeMessageResultSegments({
      result: {
        contentBlocks: [
          { kind: 'text', content: 'nested text' },
        ],
      },
    }),
    [
      { kind: 'text', text: 'nested text', toolName: null, toolId: null },
    ],
  );
});

test('readRuntimeMessageResultText prefers top-level text/content before nested result values', () => {
  assert.equal(readRuntimeMessageResultText({ text: 'top-level' }), 'top-level');
  assert.equal(readRuntimeMessageResultText({ content: 'top-content' }), 'top-content');
  assert.equal(readRuntimeMessageResultText({ result: { text: 'nested-text' } }), 'nested-text');
  assert.equal(
    readRuntimeMessageResultText({ result: { content: 'nested-content' } }),
    'nested-content',
  );
  assert.equal(readRuntimeMessageResultText({ result: {} }), '');
});
