import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { JSDOM } from 'jsdom';

import { resolveProjectPath } from './helpers/projectRoot.js';

import type {
  ConversationSidebarCat,
  ConversationSidebarChannel,
  ConversationSidebarHelpers,
} from '../src/app/renderer/productShell/ConversationSidebar.tsx';
import { ConversationSidebarMyCatsSection } from '../src/app/renderer/productShell/ConversationSidebarMyCats.tsx';
import {
  useWorkspaceAppNavigationActions,
  type WorkspaceNavigationPayloadLike,
} from '../src/products/shared/renderer/hooks/useWorkspaceAppNavigationActions.ts';
import {
  clearBusyState,
  createCatBusyState,
  createChannelBusyState,
  createConcurrentGroupBusyState,
  isConversationDeleteBusy,
  type WorkspaceBusyState,
} from '../src/shared/workspaceBusy.ts';

async function settle() { for (let turn = 0; turn < 5; turn++) await nextTurn(); }

/** Renders as a server would, without a DOM: an open overflow menu portals into any `document`. */
function renderWithoutDom(render: () => string): string {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  if (!descriptor) return render();
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true, writable: true });
  try {
    return render();
  } finally {
    Object.defineProperty(globalThis, 'document', descriptor);
  }
}

test('a chat or parallel-chat delete counts as the delete in flight; other mutations do not', () => {
  assert.equal(isConversationDeleteBusy(createChannelBusyState('delete', 'chat')), true);
  assert.equal(isConversationDeleteBusy(createConcurrentGroupBusyState('delete', 'group')), true);
  assert.equal(isConversationDeleteBusy(createChannelBusyState('rename', 'chat')), false);
  assert.equal(isConversationDeleteBusy(createConcurrentGroupBusyState('ungroup', 'group')), false);
  assert.equal(isConversationDeleteBusy(createCatBusyState('delete', 'cat')), false);
  assert.equal(isConversationDeleteBusy(clearBusyState()), false);
  assert.equal(isConversationDeleteBusy(null), false);
});

/** Mounts the navigation actions in JSDOM with a Delete API that stays open until released. */
function createDeleteHarness() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const payload: WorkspaceNavigationPayloadLike = { chat: {
    channels: [{ id: 'chat-a', title: 'A' }, { id: 'chat-b', title: 'B' }, { id: 'lane-c', title: '' }],
    cats: [], parallelChatGroups: [{ id: 'group-g', title: 'G' }],
    selectedChannelId: null, selectedChannel: null,
  } } as WorkspaceNavigationPayloadLike;
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const calls = { confirms: 0, deletes: [] as string[] };
  const busyWrites: WorkspaceBusyState[] = [];
  let actions!: ReturnType<typeof useWorkspaceAppNavigationActions<unknown, WorkspaceNavigationPayloadLike>>;
  const noop = () => {};
  const unused = async () => { throw new Error('Unexpected navigation API'); };
  const hold = (id: string) => {
    calls.deletes.push(id);
    return new Promise<WorkspaceNavigationPayloadLike>((resolve, reject) => {
      pending.push({ resolve: () => resolve(payload), reject });
    });
  };
  function Harness() {
    actions = useWorkspaceAppNavigationActions<unknown, WorkspaceNavigationPayloadLike>({
      state: { status: 'ready', payload }, platformShellSurface: 'chat',
      setState: noop, navigate: noop,
      setBusy: (next) => { busyWrites.push(typeof next === 'function' ? next(clearBusyState()) : next); },
      setFeedback: noop, setComposerDraft: noop,
      setAccountMenuOpen: noop, setAddCatOpen: noop, setPlusMenuOpen: noop, setChannelPlusMenuOpen: noop,
      setDraftCwd: noop, setDraftCatIds: noop, setDraftHighlightedCatId: noop,
      setDraftCatExecutionTargetOverrides: noop, setDraftFiles: noop, setChannelFiles: noop,
      confirm: async () => { calls.confirms += 1; return true; },
      navigationApi: {
        deleteChatChannel: hold, deleteParallelChatGroup: hold,
        deleteGlobalCat: unused, renameChatChannel: unused,
        renameParallelChatGroup: unused, resetSetup: unused, ungroupParallelChatGroup: unused,
      },
    });
    return null;
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  act(() => { root.render(<Harness />); });
  return {
    calls,
    busyWrites,
    get actions() { return actions; },
    async settleFirst(outcome: 'resolve' | 'reject') {
      const first = pending.shift()!;
      // Synchronous act only: async act() falls back to a MessageChannel in this ESM
      // bundle and leaves its ports open, which keeps the test process alive.
      if (outcome === 'resolve') first.resolve(); else first.reject(new Error('Runtime refused'));
      await settle();
    },
    restore() {
      act(() => root.unmount());
      pending.splice(0).forEach((entry) => entry.resolve());
      dom.window.close();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('while one chat delete runs, every other delete is refused before its confirmation', async () => {
  const harness = createDeleteHarness();
  try {
    let first!: Promise<void>;
    first = harness.actions.onDeleteChannel('chat-a'); await settle();
    assert.deepEqual(harness.calls.deletes, ['chat-a']);
    assert.equal(harness.calls.confirms, 1);
    assert.deepEqual(harness.actions.deleteInFlight, createChannelBusyState('delete', 'chat-a'));

    // Not awaited: without the lock each would start, and wait on, its own DELETE.
    void harness.actions.onDeleteChannel('chat-b');
    void harness.actions.onDeleteParallelChatGroup('group-g');
    void harness.actions.onClearDirectLane('cat-c', 'lane-c');
    await settle();
    assert.deepEqual(harness.calls.deletes, ['chat-a'], 'no second DELETE starts');
    assert.equal(harness.calls.confirms, 1, 'no confirmation opens for a delete that cannot run');
    assert.deepEqual(harness.actions.deleteInFlight, createChannelBusyState('delete', 'chat-a'));

    await harness.settleFirst('resolve');
    await first;
    assert.equal(harness.actions.deleteInFlight, null);
    const next = harness.actions.onDeleteChannel('chat-b'); await settle();
    assert.deepEqual(harness.calls.deletes, ['chat-a', 'chat-b'], 'the next delete runs once the first settles');
    await harness.settleFirst('resolve');
    await next;
  } finally {
    harness.restore();
  }
});

test('a parallel-chat delete holds the same lock, and a failed delete releases it', async () => {
  const harness = createDeleteHarness();
  try {
    let first!: Promise<void>;
    first = harness.actions.onDeleteParallelChatGroup('group-g'); await settle();
    void harness.actions.onDeleteChannel('chat-a'); await settle();
    assert.deepEqual(harness.calls.deletes, ['group-g']);
    assert.deepEqual(harness.actions.deleteInFlight, createConcurrentGroupBusyState('delete', 'group-g'));

    await harness.settleFirst('reject');
    await first;
    assert.equal(harness.actions.deleteInFlight, null);
    assert.deepEqual(harness.busyWrites.at(-1), clearBusyState());
    const next = harness.actions.onDeleteChannel('chat-a'); await settle();
    assert.deepEqual(harness.calls.deletes, ['group-g', 'chat-a']);
    await harness.settleFirst('resolve');
    await next;
  } finally {
    harness.restore();
  }
});

const cats: ConversationSidebarCat[] = [{ id: 'cat-1', name: 'Mochi', status: 'active' } as ConversationSidebarCat];
const lane: ConversationSidebarChannel = { id: 'lane-1', title: '' };
const myCatHelpers: ConversationSidebarHelpers<ConversationSidebarCat, ConversationSidebarChannel> = {
  catInitials: (name) => name.slice(0, 2),
  presentChannelTitle: (title) => title,
  isVisibleCat: () => true,
  sortCatsForDisplay: (rows) => rows,
  isDirectLaneSummary: () => true,
  findDirectLaneForCat: () => lane,
  resolveMyCatStatusDot: () => 'idle',
  statusDotClassName: () => '',
  statusDotLabel: () => null,
};

function renderMyCats(terminalActionLocked: boolean): string {
  return renderWithoutDom(() => renderToStaticMarkup(
    <ConversationSidebarMyCatsSection
      cats={cats}
      payloadChannels={[lane]}
      activeMyCatId={null}
      telegramBoundCatIds={new Set()}
      helpers={myCatHelpers}
      overflowMenuOpenId="cat:cat-1"
      onOverflowMenuToggle={() => {}}
      onDirectChatCat={() => {}}
      onArchiveCat={() => {}}
      disableTerminalActionWhenDraft
      terminalActionLocked={terminalActionLocked}
    />,
  ));
}

test('a direct message row cannot Clear its chat while another chat delete runs', () => {
  const terminal = /<button type="button"( disabled="")?>[^<]+<\/button><\/div>/u;
  assert.equal(terminal.exec(renderMyCats(false))?.[1], undefined);
  assert.equal(terminal.exec(renderMyCats(true))?.[1], ' disabled=""');
});

test('a disabled overflow action looks and reacts disabled', () => {
  const css = readFileSync(resolveProjectPath(import.meta.url, 'src/products/shared/renderer/styles/chat-thread-base.css'), 'utf8');
  const rule = (selector: string) => new RegExp(`${selector.replace(/\./gu, '\\.')}\\s*\\{([^}]*)\\}`, 'u').exec(css)?.[1] ?? '';
  assert.match(rule('.recentOverflowMenu button:disabled'), /cursor:\s*default/u);
  assert.match(rule('.recentOverflowMenu button:disabled'), /opacity:\s*0\.35/u);
  assert.match(rule('.recentOverflowMenu button:disabled:hover'), /background:\s*transparent/u);
});
