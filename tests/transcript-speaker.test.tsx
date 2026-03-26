import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTranscriptMessageSpeaker } from '../src/products/chat/renderer/chatUtils.tsx';

test('solo orchestrator replies use the stored execution label snapshot instead of recomputing from current catalog state', () => {
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
        executionLabelSnapshot: 'Gemini-CLI',
      },
      usage: null,
      executionProvider: 'gemini',
      executionModel: 'gemini-3-flash-preview',
      executionInstance: 'flash',
      createdAt: '2026-03-27T00:00:00.000Z',
    },
    [],
  );

  assert.deepEqual(speaker, {
    kind: 'provider',
    label: 'Gemini-CLI',
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
