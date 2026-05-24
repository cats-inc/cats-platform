import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTranscriptMessageSpeaker } from '../src/products/chat/renderer/chatUtils.tsx';

test('default orchestrator replies use the stored execution label snapshot instead of recomputing from current catalog state', () => {
  const speaker = resolveTranscriptMessageSpeaker(
    {
      id: 'message-1',
      channelId: 'channel-1',
      senderKind: 'agent',
      senderName: 'Orchestrator',
      body: 'Hello.',
      mentions: [],
      metadata: {
        targetKind: 'orchestrator',
        executionLabelSnapshot: 'Antigravity-CLI',
      },
      usage: null,
      executionProvider: 'antigravity',
      executionModel: 'antigravity-default',
      executionInstance: 'flash',
      createdAt: '2026-03-27T00:00:00.000Z',
    },
    [],
  );

  assert.deepEqual(speaker, {
    kind: 'provider',
    label: 'Antigravity-CLI',
    cat: null,
  });
});

test('legacy default orchestrator replies do not surface the internal Chat placeholder as the speaker name', () => {
  const speaker = resolveTranscriptMessageSpeaker(
    {
      id: 'message-legacy',
      channelId: 'channel-1',
      senderKind: 'agent',
      senderName: 'Chat',
      body: 'Recovered reply.',
      mentions: [],
      metadata: {
        targetKind: 'orchestrator',
        executionLabelSnapshot: 'Claude-CLI',
      },
      usage: null,
      executionProvider: null,
      executionModel: null,
      executionInstance: null,
      createdAt: '2026-04-11T00:00:00.000Z',
    },
    [],
  );

  assert.deepEqual(speaker, {
    kind: 'provider',
    label: 'Claude-CLI',
    cat: null,
  });
});

test('default orchestrator replies do not surface the internal Orchestrator placeholder as the speaker name', () => {
  const speaker = resolveTranscriptMessageSpeaker(
    {
      id: 'message-modern',
      channelId: 'channel-1',
      senderKind: 'agent',
      senderName: 'Orchestrator',
      body: 'Recovered reply.',
      mentions: [],
      metadata: {
        targetKind: 'orchestrator',
        executionLabelSnapshot: 'Antigravity-CLI',
      },
      usage: null,
      executionProvider: 'antigravity',
      executionModel: null,
      executionInstance: 'native',
      createdAt: '2026-04-11T00:00:00.000Z',
    },
    [],
  );

  assert.deepEqual(speaker, {
    kind: 'provider',
    label: 'Antigravity-CLI',
    cat: null,
  });
});

test('cat-authored transcript messages resolve through the live cat id even after the cat is renamed or archived', () => {
  const speaker = resolveTranscriptMessageSpeaker(
    {
      id: 'message-1',
      channelId: 'channel-1',
      senderKind: 'agent',
      senderName: 'Old Name',
      body: 'Hello.',
      mentions: [],
      metadata: {
        targetKind: 'cat',
        targetId: 'cat-1',
      },
      usage: null,
      executionProvider: 'claude',
      executionModel: 'claude-opus-4-6',
      executionInstance: 'native',
      createdAt: '2026-03-27T00:00:00.000Z',
    },
    [
      {
        id: 'cat-1',
        name: 'Renamed Cat',
        roles: [],
        skillProfile: null,
        mcpProfile: null,
        status: 'archived',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-27T00:00:00.000Z',
        archivedAt: '2026-03-27T00:00:00.000Z',
        avatarColor: null,
        avatarUrl: null,
        defaultExecutionTarget: {
          provider: 'claude',
          model: 'claude-opus-4-6',
          instance: 'native',
        },
        defaultModelSelection: null,
        products: ['chat'],
        memory: {
          updatedAt: null,
          content: null,
        },
      },
    ],
  );

  assert.equal(speaker.kind, 'cat');
  assert.equal(speaker.label, 'Renamed Cat');
  assert.equal(speaker.cat?.id, 'cat-1');
});

test('deleted cat transcript messages fall back to a tombstone label instead of a provider tag', () => {
  const speaker = resolveTranscriptMessageSpeaker(
    {
      id: 'message-1',
      channelId: 'channel-1',
      senderKind: 'agent',
      senderName: 'Former Cat',
      body: 'Hello.',
      mentions: [],
      metadata: {
        targetKind: 'cat',
        targetId: 'deleted-cat',
      },
      usage: null,
      executionProvider: 'claude',
      executionModel: 'claude-opus-4-6',
      executionInstance: 'native',
      createdAt: '2026-03-27T00:00:00.000Z',
    },
    [],
  );

  assert.deepEqual(speaker, {
    kind: 'deleted_cat',
    label: 'Deleted Cat',
    cat: null,
  });
});
