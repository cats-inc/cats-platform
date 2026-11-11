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
  updateCatProducts,
} from '../src/products/chat/state/model/index.ts';
import { resolveConversationOriginRoute } from '../src/products/shared/renderer/crossSurfaceConversationNavigation.ts';
import { resolveConversationSelectSurface } from '../src/products/shared/renderer/hooks/useWorkspaceAppNavigationActions.ts';
import type { PlatformSurfaceId } from '../src/shared/platform-contract.ts';

// SPEC-141 FR-12 and FR-13 (PLAN-134 Phase 2) on Desktop: the sidebar lists a conversation under
// the product of its scope, and a conversation opened under another product goes there.

const NOW = new Date('2026-11-11T00:00:00.000Z');
const PRODUCTS: PlatformSurfaceId[] = ['chat', 'code', 'work'];

/** Where each conversation of the fixture lives: the product of its scope. */
const HOME: Record<string, PlatformSurfaceId> = {
  chat: 'chat',
  code: 'code',
  work: 'work',
  // Raised by the owner: a link made before the raise still arrives.
  raisedToCode: 'code',
  // S4: no recorded origin.
  noOrigin: 'chat',
  // S6: a lane created outside Chat, while it is a lane and after its Cat left Chat.
  laneFromCode: 'chat',
  formerLaneFromCode: 'chat',
};
const LANES = ['laneFromCode'];

function fixture() {
  let state = createDefaultChatState();
  for (const name of ['Milo', 'Kiki']) {
    state = createCat(state, { name, provider: 'claude', model: 'claude-sonnet-4', products: ['chat', 'code', 'work'] }, NOW);
  }
  const catId = (name: string) => state.cats.find((cat) => cat.name === name)!.id;
  const ids: Record<string, string> = {};
  const create = (key: string, input: Parameters<typeof createChannel>[1]) => {
    state = createChannel(state, input, NOW);
    ids[key] = state.selectedChannelId;
  };
  const room = (originSurface: PlatformSurfaceId, title: string) => ({ title, topic: '', originSurface });
  const lane = (name: string, originSurface: PlatformSurfaceId) => ({
    title: '',
    topic: 'Hello',
    originSurface,
    roomMode: 'direct_message' as const,
    defaultRecipientId: catId(name),
    participantCatIds: [catId(name)],
  });
  const forgetOrigin = (channelId: string) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId)!;
    channel.originSurface = null;
    delete channel.productScope;
  };

  create('chat', room('chat', 'Started on Chat'));
  create('code', room('code', 'Started on Code'));
  create('work', room('work', 'Started on Work'));
  create('raisedToCode', room('chat', 'Raised to Code'));
  state = raiseChannelProductScope(state, ids.raisedToCode!, 'code', NOW);
  create('noOrigin', room('work', 'No recorded origin'));
  forgetOrigin(ids.noOrigin!);
  create('laneFromCode', lane('Milo', 'code'));
  create('formerLaneFromCode', lane('Kiki', 'code'));
  state = updateCatProducts(state, catId('Kiki'), ['code']);

  const targets = [
    { provider: 'claude', instance: null, model: 'claude-opus-4-6', modelSelection: null },
    { provider: 'codex', instance: null, model: 'gpt-5.4', modelSelection: null },
  ];
  const group = (title: string, originSurface: PlatformSurfaceId) => {
    state = createParallelChatGroup(state, { title, originSurface, targets }, NOW);
    return state.parallelChatGroups[0]!;
  };
  // Started on Code.
  const codeGroup = group('Compare on Code', 'code');
  // Stored before origins were recorded: neither the group nor its members have one.
  const legacyGroup = group('Compare, no origin', 'work');
  legacyGroup.originSurface = null;
  legacyGroup.memberChannelIds.forEach(forgetOrigin);
  // Mixed stored data: a group without an origin whose members kept theirs, and the reverse.
  const groupWithoutOrigin = group('Compare, only the members have an origin', 'code');
  groupWithoutOrigin.originSurface = null;
  const membersWithoutOrigin = group('Compare, only the group has an origin', 'code');
  membersWithoutOrigin.memberChannelIds.forEach(forgetOrigin);

  return {
    ids,
    summary: summarizeState(state),
    groups: {
      code: codeGroup,
      legacy: legacyGroup,
      groupWithoutOrigin,
      membersWithoutOrigin,
    },
  };
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

function viewModelOn(
  surface: PlatformSurfaceId,
  input: ReturnType<typeof fixture>,
  recentEntries?: ReturnType<typeof recentsOn>['entries'],
) {
  return buildConversationSidebarViewModel({
    payload: {
      runtime: { baseUrl: 'http://localhost:8484', reachable: true, status: 'ok' },
      chat: { cats: [], channels: input.summary.channels, botBindings: [] },
    },
    helpers: {
      isVisibleCat: () => true,
      isDirectLaneSummary: (channel) => channel.channelKind === 'direct_message',
    },
    recentEntries,
    shellSurface: surface,
    currentPath: `/${surface}`,
  });
}

const sorted = (values: readonly string[]) => [...values].sort();

test('the sidebar lists a conversation under the product of its scope', () => {
  const input = fixture();
  const { ids, groups } = input;
  const rooms = Object.keys(HOME).filter((key) => !LANES.includes(key));
  for (const surface of PRODUCTS) {
    const listed = recentsOn(surface, input);
    const wanted = rooms.filter((key) => HOME[key] === surface).map((key) => ids[key]!);
    // Members of a group that is not listed as one are listed on their own, by their scope.
    if (surface === 'code') wanted.push(...groups.groupWithoutOrigin.memberChannelIds);
    if (surface === 'chat') wanted.push(...groups.membersWithoutOrigin.memberChannelIds);
    assert.deepEqual(sorted(listed.channels), sorted(wanted), `Recents on ${surface}`);
    assert.equal(listed.channels.includes(ids.laneFromCode!), false, 'a lane is not in Recents');
  }
});

test('a parallel group stays under its own origin, and one without an origin is under Chat', () => {
  const input = fixture();
  const { groups } = input;
  assert.deepEqual(recentsOn('code', input).groups, [groups.code.id]);
  assert.deepEqual(recentsOn('chat', input).groups, [groups.legacy.id]);
  assert.deepEqual(recentsOn('work', input).groups, []);

  // A group is listed as one only where its own product and its members' product agree. The
  // two mixed groups are listed nowhere as a group; the test above finds their members.
  for (const surface of PRODUCTS) {
    const listed = recentsOn(surface, input).groups;
    assert.equal(listed.includes(groups.groupWithoutOrigin.id), false);
    assert.equal(listed.includes(groups.membersWithoutOrigin.id), false);
  }
});

test("the sidebar's own surface filter agrees with the entries built for a product", () => {
  const input = fixture();
  for (const surface of PRODUCTS) {
    const { entries } = recentsOn(surface, input);
    assert.equal(
      viewModelOn(surface, input, entries).resolvedRecentEntries.length,
      entries.length,
      `nothing is dropped on ${surface}`,
    );
    for (const other of PRODUCTS.filter((candidate) => candidate !== surface)) {
      assert.equal(
        viewModelOn(other, input, entries).resolvedRecentEntries.length,
        0,
        `${surface}'s entries are hidden on ${other}`,
      );
    }
  }
});

test('without prepared entries the sidebar lists every conversation of the scope', () => {
  const input = fixture();
  const { ids, summary } = input;
  const laneIds = new Set(LANES.map((key) => ids[key]!));
  for (const surface of PRODUCTS) {
    const listed = viewModelOn(surface, input).resolvedRecentEntries
      .flatMap((entry) => (entry.kind === 'channel' ? [entry.channel.id] : []));
    const wanted = summary.channels
      .filter((channel) => !laneIds.has(channel.id) && channel.productScope === surface)
      .map((channel) => channel.id);
    assert.deepEqual(sorted(listed), sorted(wanted), `Recents on ${surface}`);
    assert.ok(wanted.length > 0, `the fixture has conversations on ${surface}`);
  }
  // The scope the summaries carry is the one this file expects.
  for (const [key, home] of Object.entries(HOME)) {
    assert.equal(summary.channels.find((channel) => channel.id === ids[key])?.productScope, home, key);
  }
});

test('selecting a conversation opens it under the product of its scope', () => {
  const { ids, summary } = fixture();
  const summaryOf = (key: string) => summary.channels.find((channel) => channel.id === ids[key])!;
  for (const [key, home] of Object.entries(HOME)) {
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
  const { ids, summary } = fixture();
  const summaryOf = (key: string) => summary.channels.find((channel) => channel.id === ids[key])!;
  const redirect = (key: string, sourceSurface: PlatformSurfaceId) => resolveConversationOriginRoute({
    sourceSurface,
    currentPath: `/${sourceSurface}/chats/${ids[key]}/canvas/artifact-1?mode=preview`,
    channel: summaryOf(key),
  });
  for (const [key, home] of Object.entries(HOME)) {
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
  // A conversation the payload does not list is left where it is.
  assert.equal(resolveConversationOriginRoute({
    sourceSurface: 'code',
    currentPath: '/code/chats/unknown',
    channel: undefined,
  }), null);
});
