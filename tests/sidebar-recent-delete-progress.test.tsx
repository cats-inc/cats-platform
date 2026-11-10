import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import type {
  ConversationSidebarCat,
  ConversationSidebarChannel,
  ConversationSidebarHelpers,
  ConversationSidebarPayload,
  ConversationSidebarRecentEntry,
} from '../src/app/renderer/productShell/ConversationSidebar.tsx';
import { ConversationSidebarRecentsSection } from '../src/app/renderer/productShell/ConversationSidebarRecents.tsx';
import {
  clearBusyState,
  createChannelBusyState,
  createConcurrentGroupBusyState,
  type WorkspaceBusyState,
} from '../src/shared/workspaceBusy.ts';

const channels: ConversationSidebarChannel[] = [
  { id: 'channel-a', title: 'Alpha' },
  { id: 'channel-b', title: 'Beta' },
  { id: 'channel-c', title: 'Gamma' },
];

const payload: ConversationSidebarPayload = {
  ownerDisplayName: 'Owner',
  ownerAvatarUrl: null,
  runtime: { baseUrl: 'http://127.0.0.1:0' },
  chat: { cats: [], channels },
};

const helpers: ConversationSidebarHelpers<ConversationSidebarCat, ConversationSidebarChannel> = {
  catInitials: (name) => name.slice(0, 2),
  presentChannelTitle: (title) => title,
  isVisibleCat: () => true,
  sortCatsForDisplay: (cats) => cats,
  isDirectLaneSummary: () => false,
  findDirectLaneForCat: () => null,
  resolveMyCatStatusDot: () => 'idle',
  statusDotClassName: () => '',
  statusDotLabel: () => null,
};

const channelEntries: ConversationSidebarRecentEntry<ConversationSidebarChannel>[] = channels.map(
  (channel) => ({ kind: 'channel', channel }),
);

const groupEntries: ConversationSidebarRecentEntry<ConversationSidebarChannel>[] = [
  {
    kind: 'group',
    key: 'group-1',
    title: 'Parallel',
    overflowKey: 'group:group-1',
    onSelect: () => {},
    onDelete: () => {},
    deleteBusyKey: 'concurrent-group:delete:group-1',
    channels: [{ channel: channels[0]! }, { channel: channels[1]! }],
  },
  { kind: 'channel', channel: channels[2]! },
];

function renderRecents(input: {
  busy: WorkspaceBusyState;
  entries?: ConversationSidebarRecentEntry<ConversationSidebarChannel>[];
  overflowMenuOpenId?: string | null;
}): string {
  return renderToStaticMarkup(
    <ConversationSidebarRecentsSection
      entries={input.entries ?? channelEntries}
      payload={payload}
      helpers={helpers}
      routeChannelId={null}
      busy={input.busy}
      overflowMenuOpenId={input.overflowMenuOpenId ?? null}
      onSelect={() => {}}
      onDeleteChannel={() => {}}
      onRenameChannel={() => {}}
      onOverflowMenuToggle={() => {}}
    />,
  );
}

/** One markup chunk per row, keyed by the row's visible title. */
function rowsByTitle(markup: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const chunk of markup.split('<article').slice(1)) {
    const title = /<strong>([^<]+)<\/strong>/u.exec(chunk)?.[1];
    assert.ok(title, `row without a title: ${chunk}`);
    rows.set(title, chunk);
  }
  return rows;
}

function countMatches(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0;
}

test('a recent being deleted swaps its overflow button for a spinner and stops selecting', () => {
  const rows = rowsByTitle(renderRecents({ busy: createChannelBusyState('delete', 'channel-b') }));
  const deleting = rows.get('Beta')!;

  assert.match(deleting, /class="recentItemCard recentItemDeleting"/u);
  assert.match(deleting, /aria-busy="true"/u);
  assert.match(deleting, /class="recentDeletingSpinner" role="status" aria-label="Deleting\.\.\."/u);
  assert.doesNotMatch(deleting, /recentOverflowButton/u);
  assert.match(deleting, /<button class="recentSelectButton" disabled=""/u);

  for (const title of ['Alpha', 'Gamma']) {
    const idle = rows.get(title)!;
    assert.doesNotMatch(idle, /recentItemDeleting|recentDeletingSpinner|aria-busy/u);
    assert.match(idle, /recentOverflowButton/u);
    assert.doesNotMatch(idle, /recentSelectButton" disabled/u);
  }
});

test('a deleting row keeps its overflow menu closed even if it was left open', () => {
  const markup = renderRecents({
    busy: createChannelBusyState('delete', 'channel-a'),
    overflowMenuOpenId: 'channel-a',
  });

  assert.doesNotMatch(markup, /recentOverflowMenu/u);
  assert.doesNotMatch(markup, /recentItemOverflowOpen/u);
});

test('Delete stays disabled on other recents until the delete in flight settles', () => {
  const deleteButton = /<button type="button"( disabled="")?>Delete<\/button>/u;

  const idleMenu = renderRecents({ busy: clearBusyState(), overflowMenuOpenId: 'channel-c' });
  assert.equal(deleteButton.exec(idleMenu)?.[1], undefined);

  for (const busy of [
    createChannelBusyState('delete', 'channel-a'),
    createConcurrentGroupBusyState('delete', 'group-elsewhere'),
  ]) {
    const lockedMenu = renderRecents({ busy, overflowMenuOpenId: 'channel-c' });
    assert.equal(deleteButton.exec(lockedMenu)?.[1], ' disabled=""', JSON.stringify(busy));
  }

  const renamingElsewhere = renderRecents({
    busy: createChannelBusyState('rename', 'channel-a'),
    overflowMenuOpenId: 'channel-c',
  });
  assert.equal(deleteButton.exec(renamingElsewhere)?.[1], undefined);
});

test('deleting a parallel group shows one spinner on its header and locks its member rows', () => {
  const markup = renderRecents({
    busy: createConcurrentGroupBusyState('delete', 'group-1'),
    entries: groupEntries,
  });
  const rows = rowsByTitle(markup);

  assert.equal(countMatches(markup, /recentDeletingSpinner/gu), 1);
  assert.match(rows.get('Parallel')!, /recentDeletingSpinner/u);
  assert.match(rows.get('Parallel')!, /aria-busy="true"/u);

  for (const member of ['Alpha', 'Beta']) {
    const row = rows.get(member)!;
    assert.match(row, /recentItemDeleting/u);
    assert.doesNotMatch(row, /recentOverflowButton|aria-busy/u);
    assert.match(row, /recentSelectButton" disabled=""/u);
  }

  const outside = rows.get('Gamma')!;
  assert.doesNotMatch(outside, /recentItemDeleting/u);
  assert.match(outside, /recentOverflowButton/u);
});

test('an idle group header keeps its parallel glyph and overflow button', () => {
  const rows = rowsByTitle(renderRecents({ busy: clearBusyState(), entries: groupEntries }));
  const header = rows.get('Parallel')!;

  assert.match(header, /recentParallelGlyph/u);
  assert.match(header, /recentOverflowButton/u);
  assert.doesNotMatch(header, /recentDeletingSpinner|recentItemDeleting/u);
});
