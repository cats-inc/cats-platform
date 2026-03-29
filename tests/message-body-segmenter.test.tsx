import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractAttachments,
  segmentMessageBody,
} from '../src/products/chat/renderer/components/messageBodySegmenter.ts';

const cats = [
  {
    id: 'cat-1',
    name: 'Mochi',
    avatarColor: '#c9895b',
  },
] as const;

test('segmentMessageBody keeps balanced trailing parentheses inside URLs', () => {
  const segments = segmentMessageBody(
    'See https://en.wikipedia.org/wiki/Function_(mathematics) now',
    [...cats],
  );

  assert.deepEqual(segments, [
    { kind: 'text', value: 'See ' },
    {
      kind: 'url',
      value: 'https://en.wikipedia.org/wiki/Function_(mathematics)',
      href: 'https://en.wikipedia.org/wiki/Function_(mathematics)',
    },
    { kind: 'text', value: ' now' },
  ]);
});

test('segmentMessageBody preserves URLs that intentionally end with a question mark', () => {
  const segments = segmentMessageBody(
    'Use https://example.com/search? for the landing page',
    [...cats],
  );

  assert.deepEqual(segments, [
    { kind: 'text', value: 'Use ' },
    {
      kind: 'url',
      value: 'https://example.com/search?',
      href: 'https://example.com/search?',
    },
    { kind: 'text', value: ' for the landing page' },
  ]);
});

test('segmentMessageBody trims prose punctuation and unmatched closing parens', () => {
  const segments = segmentMessageBody(
    'Open (https://example.com/docs).',
    [...cats],
  );

  assert.deepEqual(segments, [
    { kind: 'text', value: 'Open (' },
    {
      kind: 'url',
      value: 'https://example.com/docs',
      href: 'https://example.com/docs',
    },
    { kind: 'text', value: ').' },
  ]);
});

test('segmentMessageBody only emits mention pills for known cats', () => {
  const segments = segmentMessageBody(
    'Ask @Mochi but leave @Ghost alone',
    [...cats],
  );

  assert.deepEqual(segments, [
    { kind: 'text', value: 'Ask ' },
    {
      kind: 'mention',
      value: '@Mochi',
      avatarColor: '#c9895b',
    },
    { kind: 'text', value: ' but leave @Ghost alone' },
  ]);
});

test('segmentMessageBody can leave excluded direct-lane mentions as plain text', () => {
  const segments = segmentMessageBody(
    'Ask @Mochi but leave @Ghost alone',
    [...cats],
    ['Mochi'],
  );

  assert.deepEqual(segments, [
    { kind: 'text', value: 'Ask @Mochi but leave @Ghost alone' },
  ]);
});

test('extractAttachments only marks raster formats as inline images', () => {
  const { attachments, textBody } = extractAttachments(
    '[Attached files in working directory:]\n'
      + '- .cats-attachments/photo.png\n'
      + '- .cats-attachments/diagram.svg\n'
      + '- .cats-attachments/notes.txt\n'
      + '\n'
      + 'See attached',
  );

  assert.deepEqual(attachments, [
    {
      filename: 'photo.png',
      relativePath: '.cats-attachments/photo.png',
      isImage: true,
    },
    {
      filename: 'diagram.svg',
      relativePath: '.cats-attachments/diagram.svg',
      isImage: false,
    },
    {
      filename: 'notes.txt',
      relativePath: '.cats-attachments/notes.txt',
      isImage: false,
    },
  ]);
  assert.equal(textBody, 'See attached');
});
