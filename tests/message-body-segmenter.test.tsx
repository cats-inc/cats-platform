import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { MemoryRouter } from 'react-router-dom';

import { MessageBody } from '../src/products/chat/renderer/components/MessageBody.tsx';
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

test('segmentMessageBody linkifies internal product routes without prose punctuation', () => {
  const segments = segmentMessageBody(
    'Review /work/tasks/task-work-1, then open /code/chats/channel-1.',
    [...cats],
  );

  assert.deepEqual(segments, [
    { kind: 'text', value: 'Review ' },
    {
      kind: 'route',
      value: '/work/tasks/task-work-1',
      href: '/work/tasks/task-work-1',
    },
    { kind: 'text', value: ', then open ' },
    {
      kind: 'route',
      value: '/code/chats/channel-1',
      href: '/code/chats/channel-1',
    },
    { kind: 'text', value: '.' },
  ]);
});

test('segmentMessageBody ends links at CJK punctuation that directly follows them', () => {
  const segments = segmentMessageBody(
    '見（https://example.com/a）、https://example.com/b、再開 /work/tasks/task-1。',
    [...cats],
  );

  assert.deepEqual(segments, [
    { kind: 'text', value: '見（' },
    { kind: 'url', value: 'https://example.com/a', href: 'https://example.com/a' },
    { kind: 'text', value: '）、' },
    { kind: 'url', value: 'https://example.com/b', href: 'https://example.com/b' },
    { kind: 'text', value: '、再開 ' },
    { kind: 'route', value: '/work/tasks/task-1', href: '/work/tasks/task-1' },
    { kind: 'text', value: '。' },
  ]);
});

test('segmentMessageBody keeps CJK letters that are part of a URL path', () => {
  const segments = segmentMessageBody('https://zh.wikipedia.org/wiki/貓 很可愛', [...cats]);

  assert.deepEqual(segments, [
    {
      kind: 'url',
      value: 'https://zh.wikipedia.org/wiki/貓',
      href: 'https://zh.wikipedia.org/wiki/貓',
    },
    { kind: 'text', value: ' 很可愛' },
  ]);
});

test('MessageBody renders internal product routes as same-window links', () => {
  const markup = renderWithoutRouterServerWarnings(
    <MemoryRouter>
      <MessageBody
        body="Review /work/tasks/task-work-1"
        cats={[]}
        channelId="channel-1"
      />
    </MemoryRouter>,
  );

  assert.match(markup, /href="\/work\/tasks\/task-work-1"/u);
  assert.doesNotMatch(markup, /target="_blank"/u);
});

function renderWithoutRouterServerWarnings(element: React.ReactElement): string {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = String(args[0] ?? '');
    if (message.includes('useLayoutEffect does nothing on the server')) {
      return;
    }
    originalError(...args);
  };
  try {
    return renderToStaticMarkup(element);
  } finally {
    console.error = originalError;
  }
}

function renderMessageBody(
  body: string,
  format: 'plain' | 'markdown',
  disabledMentionNames?: string[],
): string {
  return renderWithoutRouterServerWarnings(
    <MemoryRouter>
      <MessageBody
        body={body}
        cats={[...cats]}
        channelId="channel-1"
        disabledMentionNames={disabledMentionNames}
        format={format}
      />
    </MemoryRouter>,
  );
}

test('MessageBody renders agent markdown emphasis, lists and links', () => {
  const markup = renderMessageBody(
    '今天是 **9 月 27 日**：\n\n'
      + '- **第一則。** 詳見 [聲明](https://example.com/a)、[訪談](https://example.com/b)\n'
      + '- 第二則',
    'markdown',
  );

  assert.doesNotMatch(markup, /\*\*/u);
  assert.match(markup, /<strong>9 月 27 日<\/strong>/u);
  assert.match(markup, /<ul>\s*<li><strong>第一則。<\/strong>/u);
  assert.match(
    markup,
    /<a class="messageBodyLink" href="https:\/\/example\.com\/a" target="_blank"[^>]*>聲明<\/a>、/u,
  );
  assert.match(markup, /、<a[^>]+href="https:\/\/example\.com\/b"[^>]*>訪談<\/a>/u);
});

test('MessageBody keeps single newlines in agent markdown as line breaks', () => {
  const markup = renderMessageBody('已完成：\nsrc/a.ts\nsrc/b.ts', 'markdown');

  assert.match(markup, /<p>已完成：<br\/>\s*src\/a\.ts<br\/>\s*src\/b\.ts<\/p>/u);
});

test('MessageBody applies plain-text link and mention rules inside agent markdown', () => {
  const markup = renderMessageBody(
    '**@Mochi** 看 https://example.com/a、然後開 /work/tasks/task-1。'
      + '`@Mochi` [@Mochi](https://example.com/c)',
    'markdown',
  );

  assert.match(
    markup,
    /<strong><span class="messageBodyMention"[^>]*style="background:#c9895b">@Mochi<\/span>/u,
  );
  assert.match(markup, /href="https:\/\/example\.com\/a" target="_blank"[^>]*>[^<]+<\/a>、然後開/u);
  assert.match(markup, /<a[^>]+href="\/work\/tasks\/task-1"[^>]*>\/work\/tasks\/task-1<\/a>。/u);
  assert.match(markup, /<code>@Mochi<\/code>/u);
  assert.match(markup, /href="https:\/\/example\.com\/c"[^>]*>@Mochi<\/a>/u);
  assert.equal(markup.match(/messageBodyMention/gu)?.length, 1);
});

test('MessageBody leaves excluded mentions as text in agent markdown', () => {
  const markup = renderMessageBody('Ask @Mochi', 'markdown', ['Mochi']);

  assert.doesNotMatch(markup, /messageBodyMention/u);
  assert.match(markup, /<p>Ask @Mochi<\/p>/u);
});

test('MessageBody keeps markdown links to internal routes in the app window', () => {
  const markup = renderMessageBody('[任務](/work/tasks/task-1)', 'markdown');

  assert.match(markup, /<a class="messageBodyLink" href="\/work\/tasks\/task-1"[^>]*>任務<\/a>/u);
  assert.doesNotMatch(markup, /target="_blank"/u);
});

test('MessageBody does not make non-web markdown links clickable', () => {
  const markup = renderMessageBody(
    '[main.ts](C:/repo/src/main.ts) [x](javascript:alert(1)) [top](#top)',
    'markdown',
  );

  assert.doesNotMatch(markup, /<a /u);
  assert.equal(markup.match(/class="messageBodyInertLink"/gu)?.length, 3);
});

test('MessageBody shows raw HTML and remote images in agent markdown as text or links', () => {
  const markup = renderMessageBody(
    '<img src="x" onerror="alert(1)"> ![diagram](https://example.com/d.png)',
    'markdown',
  );

  assert.doesNotMatch(markup, /<img/u);
  assert.match(markup, /&lt;img src=&quot;x&quot; onerror=&quot;alert\(1\)&quot;&gt;/u);
  assert.match(markup, /<a[^>]+href="https:\/\/example\.com\/d\.png"[^>]*>diagram<\/a>/u);
});

test('MessageBody wraps agent markdown tables for horizontal scrolling', () => {
  const markup = renderMessageBody('| a | b |\n| --- | --- |\n| 1 | 2 |', 'markdown');

  assert.match(markup, /<div class="messageBodyTableScroll"><table><thead>/u);
});

test('MessageBody shows plain-format bodies literally', () => {
  const markup = renderMessageBody('**not bold** in C:\\Users\\me\\.cats', 'plain');

  assert.match(markup, /<span>\*\*not bold\*\* in C:\\Users\\me\\\.cats<\/span>/u);
  assert.doesNotMatch(markup, /<strong>/u);
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
