import assert from 'node:assert/strict';
import test from 'node:test';

import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import {
  parseMessageBodyMarkdown,
  readMarkdownMention,
  selectMobileMessages,
  type MessageBodyMarkdownNode,
  type MobileChatMessage,
} from '../src/mobile/index.ts';
import { remarkMessageBodySegments } from '../src/products/shared/renderer/components/messageBodyMarkdownSegments.ts';
import { estimateTableColumnWidths } from '../mobile/src/renderer/markdownTableLayout.ts';

const cats = [{ name: 'Mochi', avatarColor: '#c9895b' }];

const REPLY = [
  '### 摘要',
  '請 **@Mochi** 看 `MessageBody.tsx`，見 https://example.com/a、再開 /work/tasks/task-1。',
  '單一換行',
  '保留',
  '',
  '1. 第一 [聲明](https://example.com/b)、[本機](C:/repo/a.ts)',
  '   - 巢狀',
  '- [x] 完成',
  '',
  '> 引用 ~~刪除~~ *強調*',
  '',
  '```ts',
  'const a = 1;',
  '```',
  '',
  '| 項目 | 狀態 |',
  '| --- | :---: |',
  '| a | <b>x</b> ![圖](https://example.com/d.png) |',
  '',
  'Email me@example.com or www.example.com.',
].join('\n');

function message(overrides: Partial<MobileChatMessage>): MobileChatMessage {
  return {
    id: 'message-1',
    channelId: 'channel-1',
    senderKind: 'agent',
    senderName: 'Codex-CLI',
    body: REPLY,
    mentions: [],
    createdAt: '2026-09-27T00:00:00.000Z',
    ...overrides,
  };
}

function findNodes(
  nodes: readonly MessageBodyMarkdownNode[],
  type: MessageBodyMarkdownNode['type'],
): MessageBodyMarkdownNode[] {
  const found: MessageBodyMarkdownNode[] = [];
  for (const node of nodes) {
    if (node.type === type) {
      found.push(node);
    }
    if ('children' in node) {
      found.push(...findNodes(node.children, type));
    }
  }
  return found;
}

test('parseMessageBodyMarkdown builds the same tree as the web remark pipeline', () => {
  const options = { cats, disabledMentionNames: ['Ghost'] };
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkMessageBodySegments, options);
  const webTree = processor.runSync(processor.parse(REPLY));

  assert.deepEqual(parseMessageBodyMarkdown(REPLY, options), webTree);
});

test('selectMobileMessages parses agent replies as markdown and keeps other senders plain', () => {
  const [agent, user, orchestrator] = selectMobileMessages(
    [
      message({ id: 'agent' }),
      message({ id: 'user', senderKind: 'user', body: '**not bold**' }),
      message({ id: 'orchestrator', senderKind: 'orchestrator', body: '**not bold**' }),
      message({ id: 'system', senderKind: 'system' }),
    ],
    cats,
  );

  assert.equal(agent.role, 'assistant');
  assert.deepEqual(agent.segments, []);
  assert.ok(agent.markdown);
  assert.equal(findNodes(agent.markdown.children, 'table').length, 1);
  assert.equal(findNodes(agent.markdown.children, 'break').length, 2);

  for (const plain of [user, orchestrator]) {
    assert.equal(plain.markdown, null);
    assert.deepEqual(plain.segments, [{ kind: 'text', value: '**not bold**' }]);
  }
});

test('mobile markdown keeps mention, link and CJK punctuation rules', () => {
  const [agent] = selectMobileMessages([message({})], cats);
  assert.ok(agent.markdown);
  const nodes = agent.markdown.children;

  const mentions = findNodes(nodes, 'text').flatMap((node) => {
    if (node.type !== 'text') {
      return [];
    }
    const mention = readMarkdownMention(node);
    return mention ? [{ value: node.value, ...mention }] : [];
  });
  assert.deepEqual(mentions, [{ value: '@Mochi', avatarColor: '#c9895b' }]);

  const links = findNodes(nodes, 'link').map((node) => (node.type === 'link' ? node.url : ''));
  assert.deepEqual(links, [
    'https://example.com/a',
    '/work/tasks/task-1',
    'https://example.com/b',
    'C:/repo/a.ts',
  ]);
  assert.equal(findNodes(nodes, 'html').length, 2);
  assert.equal(findNodes(nodes, 'image').length, 1);
});

test('estimateTableColumnWidths sizes columns by their widest cell with CJK counted double', () => {
  const [agent] = selectMobileMessages(
    [message({ body: '| a | 狀態欄位名稱很長 |\n| --- | --- |\n| b | ' + 'x'.repeat(80) + ' |' })],
    cats,
  );
  assert.ok(agent.markdown);
  const [table] = findNodes(agent.markdown.children, 'table');
  assert.ok(table?.type === 'table');

  assert.deepEqual(estimateTableColumnWidths(table), [64, 220]);

  const [narrow] = selectMobileMessages(
    [message({ body: '| 項目 | ab |\n| --- | --- |\n| 狀態欄位 | c |' })],
    cats,
  );
  assert.ok(narrow.markdown);
  const [narrowTable] = findNodes(narrow.markdown.children, 'table');
  assert.ok(narrowTable?.type === 'table');
  assert.deepEqual(estimateTableColumnWidths(narrowTable), [81, 64]);
});
