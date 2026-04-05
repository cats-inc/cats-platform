import assert from 'node:assert/strict';
import test from 'node:test';

import { chunkTelegramReply } from '../build/server/platform/transports/telegram/chunking.js';

test('returns single chunk for short text', () => {
  const result = chunkTelegramReply('Hello world', 4096);
  assert.deepStrictEqual(result, ['Hello world']);
});

test('splits at paragraph boundary', () => {
  const text = 'First paragraph.\n\nSecond paragraph.';
  const result = chunkTelegramReply(text, 25);
  assert.equal(result.length, 2);
  assert.equal(result[0], 'First paragraph.');
  assert.equal(result[1], 'Second paragraph.');
});

test('splits at line boundary when no paragraph break', () => {
  const text = 'Line one.\nLine two.\nLine three.';
  const result = chunkTelegramReply(text, 22);
  assert.ok(result.length >= 2);
  assert.ok(result[0].endsWith('Line one.') || result[0].endsWith('Line two.'));
});

test('splits long text without breaking words', () => {
  const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
  const text = words.join(' ');
  const result = chunkTelegramReply(text, 30);
  assert.ok(result.length > 1);
  for (const chunk of result) {
    assert.ok(chunk.length <= 30, `chunk too long: ${chunk.length}`);
  }
});

test('handles empty text', () => {
  const result = chunkTelegramReply('', 4096);
  assert.equal(result.length, 1);
  assert.equal(result[0], '');
});

test('preserves fenced code blocks when possible', () => {
  const code = '```\nfunction foo() {\n  return 1;\n}\n```';
  const text = `Before code.\n\n${code}\n\nAfter code.`;
  const result = chunkTelegramReply(text, text.length + 10);
  assert.equal(result.length, 1);
  assert.ok(result[0].includes('```'));
});

test('handles text at exact limit', () => {
  const text = 'A'.repeat(100);
  const result = chunkTelegramReply(text, 100);
  assert.deepStrictEqual(result, [text]);
});

test('handles text just over limit', () => {
  const text = 'A'.repeat(101);
  const result = chunkTelegramReply(text, 100);
  assert.equal(result.length, 2);
});

