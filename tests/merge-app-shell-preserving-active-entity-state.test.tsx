import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeAppShellPreservingActiveEntityState,
} from '../src/products/shared/renderer/mergeAppShellPreservingActiveEntityState.js';

function group(input: {
  id: string;
  title: string;
  memberChannelIds: string[];
  members?: Array<{ channelId: string; title: string; provider?: string; model?: string | null }>;
  updatedAt?: string;
  lastMessageAt?: string | null;
}) {
  return {
    id: input.id,
    title: input.title,
    mode: 'parallel' as const,
    status: 'active' as const,
    memberCount: input.memberChannelIds.length,
    memberChannelIds: input.memberChannelIds,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-21T00:00:00.000Z',
    lastMessageAt: input.lastMessageAt ?? null,
    members: (input.members ?? input.memberChannelIds.map((channelId, index) => ({
      channelId,
      title: channelId,
      index,
      provider: input.members?.[index]?.provider ?? 'openai',
      instance: null,
      model: input.members?.[index]?.model ?? 'gpt-5',
      modelSelection: null,
      lastMessageAt: null,
    }))).map((member, index) => ({
      index,
      instance: null,
      modelSelection: null,
      lastMessageAt: null,
      provider: 'openai',
      model: 'gpt-5',
      ...member,
    })),
  };
}

function payload(input: {
  selectedChannelId: string;
  selectedChannelTitle: string;
  selectedMessages: string[];
  groups?: ReturnType<typeof group>[];
  cats?: Array<{ id: string; name: string }>;
}) {
  return {
    metadata: { generatedAt: '2026-04-21T00:00:00.000Z' },
    runtime: { reachable: true },
    chat: {
      id: 'chat',
      name: 'Chat',
      selectedChannelId: input.selectedChannelId,
      selectedChannel: {
        id: input.selectedChannelId,
        title: input.selectedChannelTitle,
        messages: input.selectedMessages.map((id) => ({ id })),
      },
      parallelChatGroups: input.groups ?? [],
      cats: input.cats ?? [],
      channels: [],
      bossCatId: null,
    },
  };
}

test('no active subscription keeps full-replace behavior', () => {
  const current = payload({
    selectedChannelId: 'channel-a',
    selectedChannelTitle: 'Current',
    selectedMessages: ['local-message'],
  });
  const next = payload({
    selectedChannelId: 'channel-b',
    selectedChannelTitle: 'Next',
    selectedMessages: ['next-message'],
  });

  assert.equal(
    mergeAppShellPreservingActiveEntityState(current, next, []),
    next,
  );
});

test('active subscription preserves selectedChannelId and selectedChannel together', () => {
  const current = payload({
    selectedChannelId: 'channel-a',
    selectedChannelTitle: 'Subscribed',
    selectedMessages: ['subscription-message'],
  });
  const next = payload({
    selectedChannelId: 'channel-b',
    selectedChannelTitle: 'Refetched',
    selectedMessages: ['refetch-message'],
    cats: [{ id: 'cat-1', name: 'Fresh cat' }],
  });

  const merged = mergeAppShellPreservingActiveEntityState(current, next, ['channel-a']);

  assert.equal(merged.chat.selectedChannelId, 'channel-a');
  assert.equal(merged.chat.selectedChannel?.id, 'channel-a');
  assert.deepEqual(merged.chat.selectedChannel?.messages, [{ id: 'subscription-message' }]);
  assert.deepEqual(merged.chat.cats, [{ id: 'cat-1', name: 'Fresh cat' }]);
});

test('compare group merge preserves subscribed membership but flows sibling metadata', () => {
  const current = payload({
    selectedChannelId: 'channel-a',
    selectedChannelTitle: 'Subscribed',
    selectedMessages: [],
    groups: [
      group({
        id: 'group-1',
        title: 'Old title',
        memberChannelIds: ['channel-a'],
        members: [{ channelId: 'channel-a', title: 'A old' }],
      }),
    ],
  });
  const next = payload({
    selectedChannelId: 'channel-a',
    selectedChannelTitle: 'Refetched',
    selectedMessages: [],
    groups: [
      group({
        id: 'group-1',
        title: 'Fresh title',
        memberChannelIds: ['channel-b'],
        updatedAt: '2026-04-21T00:00:01.000Z',
        lastMessageAt: '2026-04-21T00:00:01.000Z',
        members: [
          {
            channelId: 'channel-b',
            title: 'B fresh',
            provider: 'anthropic',
            model: 'claude',
          },
        ],
      }),
    ],
  });

  const merged = mergeAppShellPreservingActiveEntityState(current, next, ['channel-a']);
  const mergedGroup = merged.chat.parallelChatGroups[0];

  assert.equal(mergedGroup.title, 'Fresh title');
  assert.equal(mergedGroup.updatedAt, '2026-04-21T00:00:01.000Z');
  assert.deepEqual(mergedGroup.memberChannelIds, ['channel-a', 'channel-b']);
  assert.equal(mergedGroup.memberCount, 2);
  assert.equal(
    mergedGroup.members.find((member) => member.channelId === 'channel-b')?.title,
    'B fresh',
  );
  assert.equal(
    mergedGroup.members.find((member) => member.channelId === 'channel-a')?.title,
    'A old',
  );
});

test('next-only sibling groups flow through while dropped subscribed groups are kept', () => {
  const current = payload({
    selectedChannelId: 'channel-a',
    selectedChannelTitle: 'Subscribed',
    selectedMessages: [],
    groups: [
      group({
        id: 'group-1',
        title: 'Subscribed group',
        memberChannelIds: ['channel-a', 'channel-b'],
      }),
      group({
        id: 'group-old-sibling',
        title: 'Old sibling',
        memberChannelIds: ['channel-c', 'channel-d'],
      }),
    ],
  });
  const next = payload({
    selectedChannelId: 'channel-a',
    selectedChannelTitle: 'Refetched',
    selectedMessages: [],
    groups: [
      group({
        id: 'group-new-sibling',
        title: 'New sibling',
        memberChannelIds: ['channel-e', 'channel-f'],
      }),
    ],
  });

  const merged = mergeAppShellPreservingActiveEntityState(current, next, ['channel-a']);

  assert.deepEqual(
    merged.chat.parallelChatGroups.map((candidate) => candidate.id),
    ['group-new-sibling', 'group-1'],
  );
});
