import assert from 'node:assert/strict';
import test from 'node:test';

import { buildConversationSidebarRecentEntries } from '../src/app/renderer/productShell/conversationSidebarRecentEntries.tsx';
import { buildConversationSidebarViewModel } from '../src/app/renderer/productShell/conversationSidebarViewModel.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  createCat,
  createChannel,
  createParallelChatGroup,
  raiseChannelProductScope,
  summarizeState,
} from '../src/products/chat/state/model/index.ts';
import { resolveConversationOriginRoute } from '../src/products/shared/renderer/crossSurfaceConversationNavigation.ts';
import { resolveConversationSelectSurface } from '../src/products/shared/renderer/hooks/useWorkspaceAppNavigationActions.ts';
import type { PlatformSurfaceId } from '../src/shared/platform-contract.ts';

// SPEC-141 FR-12 and FR-13 (PLAN-134 Phase 2) on Desktop: the sidebar lists a conversation under
// the product of its scope, and a conversation opened under another product goes there.

const NOW = new Date('2026-11-11T00:00:00.000Z');
const PRODUCTS: PlatformSurfaceId[] = ['chat', 'code', 'work'];

function fixture() {
  let state = createCat(
    createDefaultChatState(),
    { name: 'Milo', provider: 'claude', model: 'claude-sonnet-4', products: ['chat', 'code', 'work'] },
    NOW,
  );
  const catId = state.cats[0]!.id;
  const ids: Record<string, string> = {};
  const create = (key: string, input: Parameters<typeof createChannel>[1]) => {
    state = createChannel(state, input, NOW);
    ids[key] = state.selectedChannelId;
  };
  const room = (originSurface: PlatformSurfaceId, title: string) => ({ title, topic: '', originSurface });

  create('chat', room('chat', 'Started on Chat'));
  create('code', room('code', 'Started on Code'));
  create('work', room('work', 'Started on Work'));
  create('raisedToCode', room('chat', 'Raised to Code'));
  state = raiseChannelProductScope(state, ids.raisedToCode!, 'code', NOW);
  create('noOrigin', room('work', 'No recorded origin'));
  const legacy = state.channels.find((channel) => channel.id === ids.noOrigin)!;
  legacy.originSurface = null;
  delete legacy.productScope;
  create('laneFromCode', {
    title: '',
    topic: 'Hello',
    originSurface: 'code',
    roomMode: 'direct_message',
    defaultRecipientId: catId,
    participantCatIds: [catId],
  });

  // A parallel group started on Code, and one stored before origins were recorded.
  const targets = [
    { provider: 'claude', instance: null, model: 'claude-opus-4-6', modelSelection: null },
    { provider: 'codex', instance: null, model: 'gpt-5.4', modelSelection: null },
  ];
  state = createParallelChatGroup(state, { title: 'Compare on Code', originSurface: 'code', targets }, NOW);
  const codeGroup = state.parallelChatGroups[0]!;
  state = createParallelChatGroup(state, { title: 'Compare, no origin', originSurface: 'work', targets }, NOW);
  const legacyGroup = state.parallelChatGroups[0]!;
  legacyGroup.originSurface = null;
  for (const memberId of legacyGroup.memberChannelIds) {
    const member = state.channels.find((channel) => channel.id === memberId)!;
    member.originSurface = null;
    delete member.productScope;
  }

  const summary = summarizeState(state);
  return { ids, summary, codeGroupId: codeGroup.id, legacyGroupId: legacyGroup.id };
}

function recentsOn(surface: PlatformSurfaceId, input: ReturnType<typeof fixture>) {
  const entries = buildConversationSidebarRecentEntries({
    channels: input.summary.channels,
    parallelChatGroups: input.summary.parallelChatGroups,
    activeSurface: surface,
    routeChannelId: null,
    isDirectLaneSummary: () => false,
    onSelect: () => {},
  });
  return {
    channels: entries.flatMap((entry) => (entry.kind === 'channel' ? [entry.channel.id] : [])),
    groups: entries.flatMap((entry) => (entry.kind === 'group' ? [entry.key] : [])),
    entries,
  };
}

test('the sidebar lists a conversation under the product of its scope', () => {
  const input = fixture();
  const { ids } = input;
  const expected: Record<PlatformSurfaceId, string[]> = {
    chat: [ids.chat!, ids.noOrigin!],
    code: [ids.code!, ids.raisedToCode!],
    work: [ids.work!],
  };
  for (const surface of PRODUCTS) {
    const listed = recentsOn(surface, input);
    assert.deepEqual([...listed.channels].sort(), [...expected[surface]].sort(), `Recents on ${surface}`);
    assert.equal(listed.channels.includes(ids.laneFromCode!), false, 'a lane is not in Recents');
  }
});

test('a parallel group stays under its own origin, and one without an origin is under Chat', () => {
  const input = fixture();
  assert.deepEqual(recentsOn('code', input).groups, [input.codeGroupId]);
  assert.deepEqual(recentsOn('chat', input).groups, [input.legacyGroupId]);
  assert.deepEqual(recentsOn('work', input).groups, []);

  // The same entries pass the view model's own surface filter.
  for (const surface of PRODUCTS) {
    const { entries } = recentsOn(surface, input);
    const viewModel = buildConversationSidebarViewModel({
      payload: {
        runtime: { baseUrl: 'http://localhost:8484', reachable: true, status: 'ok' },
        chat: { cats: [], channels: input.summary.channels, botBindings: [] },
      },
      helpers: { isVisibleCat: () => true, isDirectLaneSummary: () => false },
      recentEntries: entries,
      shellSurface: surface,
      currentPath: `/${surface}`,
    });
    assert.equal(viewModel.resolvedRecentEntries.length, entries.length, `nothing is dropped on ${surface}`);
    // An entry built for one product is not shown on another.
    for (const other of PRODUCTS.filter((candidate) => candidate !== surface)) {
      const elsewhere = buildConversationSidebarViewModel({
        payload: {
          runtime: { baseUrl: 'http://localhost:8484', reachable: true, status: 'ok' },
          chat: { cats: [], channels: input.summary.channels, botBindings: [] },
        },
        helpers: { isVisibleCat: () => true, isDirectLaneSummary: () => false },
        recentEntries: entries,
        shellSurface: other,
        currentPath: `/${other}`,
      });
      assert.equal(elsewhere.resolvedRecentEntries.length, 0, `${surface}'s entries are hidden on ${other}`);
    }
  }
});

test('selecting a conversation opens it under the product of its scope', () => {
  const { ids, summary } = fixture();
  const summaryOf = (key: string) => summary.channels.find((channel) => channel.id === ids[key])!;
  const expected: Record<string, PlatformSurfaceId> = {
    chat: 'chat',
    code: 'code',
    work: 'work',
    raisedToCode: 'code',
    noOrigin: 'chat',
    laneFromCode: 'chat',
  };
  for (const [key, home] of Object.entries(expected)) {
    for (const surface of PRODUCTS) {
      assert.equal(resolveConversationSelectSurface(summaryOf(key), surface), home, `${key} selected on ${surface}`);
    }
  }
  // Not in the payload yet: it opens where the owner is.
  for (const surface of PRODUCTS) {
    assert.equal(resolveConversationSelectSurface(null, surface), surface);
  }
});

test('a conversation opened under another product goes to the product of its scope', () => {
  const input = fixture();
  const { ids, summary } = input;
  const summaryOf = (key: string) => summary.channels.find((channel) => channel.id === ids[key])!;
  const redirect = (key: string, sourceSurface: PlatformSurfaceId) => resolveConversationOriginRoute({
    sourceSurface,
    currentPath: `/${sourceSurface}/chats/${ids[key]}/canvas/artifact-1?mode=preview`,
    channel: summaryOf(key),
  });
  const expected: Record<string, PlatformSurfaceId> = {
    chat: 'chat',
    code: 'code',
    work: 'work',
    // Raised: a link made before the raise still arrives.
    raisedToCode: 'code',
    // S4 and S6.
    noOrigin: 'chat',
    laneFromCode: 'chat',
  };
  for (const [key, home] of Object.entries(expected)) {
    for (const surface of PRODUCTS) {
      const target = redirect(key, surface);
      if (surface === home) {
        assert.equal(target, null, `${key} stays on ${surface}`);
      } else {
        assert.deepEqual(target, {
          surface: home,
          path: `/${home}/chats/${ids[key]}/canvas/artifact-1?mode=preview`,
        }, `${key} opened on ${surface} goes to ${home}`);
      }
    }
  }
});
