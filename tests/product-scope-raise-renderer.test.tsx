import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { JSDOM } from 'jsdom';

import { createTranslator } from '../src/shared/i18n/index.ts';
import type { ProductScope } from '../src/shared/productScope.ts';
import {
  ProductScopeRaiseError,
  type ProductScopeRaiseView,
} from '../src/products/shared/renderer/api/productScope.ts';
import {
  buildProductScopeRaiseConfirmation,
  describeProductScopeRaiseFailure,
  productScopeRaiseMenuLevels,
  type ProductScopeRaiseControl,
} from '../src/products/shared/renderer/productScopeRaise.ts';
import { ComposerSurfaceChip } from '../src/products/shared/renderer/components/ComposerSurfaceChip.tsx';
import { ConversationScopeChip } from '../src/products/shared/renderer/components/ConversationScopeChip.tsx';
import { useProductScopeRaise } from '../src/products/shared/renderer/hooks/useProductScopeRaise.ts';
import {
  postRaiseNotice,
  resetRaiseNoticesForTests,
} from '../src/products/shared/renderer/productScopeRaiseNotices.ts';
import { stageCrossSurfaceConversationNavigationHandoff } from '../src/products/shared/renderer/crossSurfaceConversationNavigation.ts';
import {
  clearCrossSurfaceNavigationHandoff,
  peekCrossSurfaceNavigationHandoffForMatch,
} from '../src/products/shared/renderer/crossSurfaceNavigationHandoff.ts';

const en = createTranslator('en');
const zh = createTranslator('zh-TW');

async function settle() { for (let turn = 0; turn < 5; turn++) await nextTurn(); }

test.beforeEach(() => resetRaiseNoticesForTests());

function view(overrides: Partial<ProductScopeRaiseView> = {}): ProductScopeRaiseView {
  return {
    channelId: 'chat-a',
    scope: 'chat',
    origin: 'chat',
    canRaise: true,
    refusal: null,
    widerLevels: ['code', 'work'],
    participants: [{ id: 'p1', name: 'Mochi', kind: 'cat' }, { id: 'p2', name: 'Codex', kind: 'adhoc' }],
    workspace: {
      repoPath: 'C:/repo/app',
      chatCwd: null,
      workspaceKind: 'folder',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
      executionPolicy: null,
    },
    livePreviewsEnabled: false,
    revision: 'rev-1',
    ...overrides,
  };
}

/** Mounts a tree in JSDOM; `fetch` answers from `respond`. */
function mount(node: () => React.ReactElement, respond?: (url: string, init?: RequestInit) => Response) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string, init?: RequestInit) => {
      if (!respond) throw new Error('Unexpected fetch');
      return respond(url, init);
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  let mounted = true;
  act(() => { root.render(node()); });
  return {
    document: dom.window.document,
    rerender() { act(() => { root.render(node()); }); },
    click(element: Element | null | undefined) {
      assert.ok(element, 'element to click');
      act(() => { (element as HTMLElement).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    },
    unmount() {
      if (mounted) act(() => root.unmount());
      mounted = false;
    },
    restore() {
      if (mounted) act(() => root.unmount());
      mounted = false;
      dom.window.close();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

function control(overrides: Partial<ProductScopeRaiseControl> = {}) {
  const calls = { raises: [] as Array<[string, ProductScope, string]>, reports: [] as string[] };
  const value: ProductScopeRaiseControl = {
    pendingChannelId: null,
    raise: async (channelId, target, revision) => { calls.raises.push([channelId, target, revision]); },
    report: (message) => { calls.reports.push(message); },
    ...overrides,
  };
  return { value, calls };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('the menu offers the wider levels only, and none to a lane, a parallel member or an archived conversation', () => {
  assert.deepEqual(productScopeRaiseMenuLevels({ channel: { originSurface: 'chat' }, parallelMember: false }), ['code', 'work']);
  assert.deepEqual(productScopeRaiseMenuLevels({ channel: { productScope: 'code', originSurface: 'chat' }, parallelMember: false }), ['work']);
  assert.deepEqual(productScopeRaiseMenuLevels({ channel: { productScope: 'work' }, parallelMember: false }), []);
  assert.deepEqual(productScopeRaiseMenuLevels({ channel: { channelKind: 'direct_message' }, parallelMember: false }), []);
  assert.deepEqual(productScopeRaiseMenuLevels({ channel: { roomMode: 'direct_message', productScope: 'code' }, parallelMember: false }), []);
  assert.deepEqual(productScopeRaiseMenuLevels({ channel: { originSurface: 'chat' }, parallelMember: true }), []);
  assert.deepEqual(productScopeRaiseMenuLevels({ channel: { originSurface: 'chat', status: 'archived' }, parallelMember: false }), []);
});

test('the confirmation names what a raise to Code adds, who gains it, what stays and that it is permanent', () => {
  const content = buildProductScopeRaiseConfirmation(view(), 'code', en);
  assert.equal(content.title, 'Move this conversation to Code?');
  assert.equal(content.confirmLabel, 'Move to Code');
  assert.deepEqual(content.adds, [
    "From their next turn, its agents get Code's tools to declare artifacts and show them in the canvas.",
    'Live previews stay off until you let Cats run preview servers in Settings › Code.',
    "Code's conversation parts: the canvas and its preview button, the work areas panel, and the folder and permission chips.",
  ]);
  assert.equal(content.participants, 'Mochi, Codex, from their next turn. Anyone added later works at this level too.');
  assert.deepEqual(content.unchanged, ['Folder: C:/repo/app', 'CLI permission: Read only']);
  assert.equal(content.moves, "It moves to Code's Recents and opens with Code's view and preferences.");
  assert.match(content.permanent, /can't be undone/u);
});

test('a raise to Work says no Work tool is added yet, from Chat and from Code', () => {
  const fromChat = buildProductScopeRaiseConfirmation(view({ livePreviewsEnabled: true }), 'work', en);
  assert.equal(fromChat.adds.length, 5);
  assert.match(fromChat.adds[1]!, /so they can run live previews too/u);
  assert.equal(fromChat.adds.at(-2), "Work lists the conversation's Work Item as its own.");
  assert.equal(fromChat.adds.at(-1), 'No Work tool is added to its agents yet.');
  const fromCode = buildProductScopeRaiseConfirmation(view({
    scope: 'code',
    widerLevels: ['work'],
    participants: [],
    // A sandbox conversation's chatCwd is Runtime's sandbox, which the owner did not choose.
    workspace: { repoPath: null, chatCwd: 'C:/Users/o/.cats/runtime/sessions/s1', workspaceKind: 'sandbox', workspaceAccess: 'read_write', permissionMode: 'skip', executionPolicy: null },
  }), 'work', en);
  assert.deepEqual(fromCode.adds, [
    "Code's tools and conversation parts stay as they are.",
    "Work lists the conversation's Work Item as its own.",
    'No Work tool is added to its agents yet.',
  ]);
  assert.equal(fromCode.participants, 'No one has joined yet. Anyone added later works at this level.');
  assert.deepEqual(fromCode.unchanged, ['Folder: a sandbox, with no folder of yours', 'CLI permission: Workspace write (legacy)']);
  assert.equal(fromCode.moves, "It moves to Work's Recents and opens with Work's view and preferences.");
});

test('the confirmation and refusals exist in zh-TW, for each transition', () => {
  const toCode = buildProductScopeRaiseConfirmation(view(), 'code', zh);
  assert.equal(toCode.title, '要把這個對話移到 Code 嗎？');
  assert.equal(toCode.adds[0], '從下一輪起，它的 agent 會取得 Code 的工具，可以宣告產物並顯示在畫布中。');
  assert.deepEqual(toCode.unchanged, ['資料夾：C:/repo/app', 'CLI 權限：唯讀']);
  const content = buildProductScopeRaiseConfirmation(view(), 'work', zh);
  assert.equal(content.title, '要把這個對話移到 Work 嗎？');
  assert.equal(content.adds.at(-1), '目前還不會為它的 agent 新增 Work 的工具。');
  assert.match(content.permanent, /無法復原/u);
  const fromCode = buildProductScopeRaiseConfirmation(view({ scope: 'code', widerLevels: ['work'] }), 'work', zh);
  assert.deepEqual(fromCode.adds, [
    'Code 的工具與對話元件維持不變。',
    'Work 會把這個對話的工作項目列為自己的。',
    '目前還不會為它的 agent 新增 Work 的工具。',
  ]);
  for (const line of [...toCode.adds, ...content.adds, toCode.participants, toCode.moves]) {
    assert.doesNotMatch(line, /shared\.productScopeRaise/u, 'every line has zh-TW copy');
  }
  assert.equal(describeProductScopeRaiseFailure(new ProductScopeRaiseError('owner_required', 'x'), zh), '只有擁有者可以把對話移到其他產品。');
});

test('each refusal code reads as its own reason, and anything else as a generic failure', () => {
  const reason = (code: string | null) => describeProductScopeRaiseFailure(new ProductScopeRaiseError(code, 'server text'), en);
  assert.equal(reason('owner_required'), 'Only the owner can move a conversation to another product.');
  assert.equal(reason('archived'), "An archived conversation can't be moved.");
  assert.equal(reason('direct_lane'), 'A direct conversation with a Cat stays in Chat.');
  assert.equal(reason('parallel_member'), "A conversation in a parallel group can't be moved.");
  assert.equal(reason('not_wider'), 'This conversation is already in that product or a wider one.');
  assert.match(reason('revision_stale'), /changed after the confirmation was shown/u);
  assert.equal(reason('channel_not_found'), 'This conversation no longer exists.');
  assert.match(reason('E_CSRF_MISMATCH'), /^Couldn't move the conversation/u);
  // No refusal at all: the request may have reached the server, so the move is only unconfirmed.
  assert.match(reason(null), /^Couldn't confirm the move/u);
  assert.match(describeProductScopeRaiseFailure(new Error('offline'), en), /^Couldn't confirm the move/u);
});

test('an existing conversation chip is never dismissable; a draft chip still is', () => {
  const chat = control();
  const raisable = renderToStaticMarkup(
    <ConversationScopeChip channel={{ id: 'chat-a', originSurface: 'chat' }} parallelMember={false} control={chat.value} />,
  );
  assert.match(raisable, /<button[^>]*aria-haspopup="menu"/u);
  assert.match(raisable, /composerSurfaceChipChat/u);
  assert.doesNotMatch(raisable, /composerChipClose/u);
  const lane = renderToStaticMarkup(
    <ConversationScopeChip channel={{ id: 'lane', channelKind: 'direct_message' }} parallelMember={false} control={chat.value} />,
  );
  assert.doesNotMatch(lane, /<button/u);
  assert.match(lane, /Chat conversation\./u);
  const work = renderToStaticMarkup(
    <ConversationScopeChip channel={{ id: 'w', productScope: 'work' }} parallelMember={false} control={chat.value} />,
  );
  assert.doesNotMatch(work, /<button/u);
  assert.match(work, /composerSurfaceChipWork/u);
  const noControl = renderToStaticMarkup(
    <ConversationScopeChip channel={{ id: 'chat-a', originSurface: 'chat' }} parallelMember={false} />,
  );
  assert.doesNotMatch(noControl, /<button/u);
  const draft = renderToStaticMarkup(<ComposerSurfaceChip surface="code" onDismiss={() => {}} />);
  assert.match(draft, /composerChipClose/u);
});

test('choosing a level reads the route, shows the confirmation and raises with its revision', async () => {
  const chat = control();
  const requests: string[] = [];
  const harness = mount(
    () => <ConversationScopeChip channel={{ id: 'chat a', originSurface: 'chat' }} parallelMember={false} control={chat.value} />,
    (url, init) => { requests.push(`${init?.method ?? 'GET'} ${url}`); return json(200, view({ channelId: 'chat a', revision: 'rev-9' })); },
  );
  try {
    const doc = harness.document;
    harness.click(doc.querySelector('button.conversationScopeChip'));
    const items = [...doc.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
    assert.deepEqual(items, ['Move to Code', 'Move to Work']);
    harness.click(doc.querySelectorAll('[role="menuitem"]')[0]);
    await settle();
    assert.deepEqual(requests, ['GET /api/channels/chat%20a/product-scope']);
    const dialog = doc.querySelector('[role="dialog"]');
    assert.ok(dialog, 'the confirmation opens');
    assert.equal(dialog.parentElement?.parentElement, doc.body, 'portaled out of the composer');
    assert.match(dialog.textContent ?? '', /Move this conversation to Code\?/u);
    assert.match(dialog.textContent ?? '', /Mochi, Codex/u);
    assert.match(dialog.textContent ?? '', /Folder: C:\/repo\/app/u);
    assert.equal(doc.activeElement?.className, 'confirmCancelButton', 'Cancel is focused first');
    harness.click(doc.querySelector('.confirmPrimaryButton'));
    assert.deepEqual(chat.calls.raises, [['chat a', 'code', 'rev-9']]);
    assert.equal(doc.querySelector('[role="dialog"]'), null);
    assert.deepEqual(chat.calls.reports, []);
  } finally {
    harness.restore();
  }
});

test('a refusal from the read route or a failed read shows its reason and no confirmation', async () => {
  for (const [respond, expected] of [
    [() => json(200, view({ canRaise: false, refusal: 'parallel_member', widerLevels: [] })), "A conversation in a parallel group can't be moved."],
    [() => json(200, view({ widerLevels: ['work'] })), 'This conversation is already in that product or a wider one.'],
    [() => json(403, { error: { code: 'owner_required', message: 'Only the owner…' } }), 'Only the owner can move a conversation to another product.'],
    [() => new Response('gateway down', { status: 502 }), "Couldn't move the conversation. It stays where it was; try again."],
  ] as Array<[() => Response, string]>) {
    const chat = control();
    const harness = mount(
      () => <ConversationScopeChip channel={{ id: 'chat-a', originSurface: 'chat' }} parallelMember={false} control={chat.value} />,
      respond,
    );
    try {
      harness.click(harness.document.querySelector('button.conversationScopeChip'));
      harness.click(harness.document.querySelectorAll('[role="menuitem"]')[0]);
      await settle();
      assert.equal(harness.document.querySelector('[role="dialog"]'), null);
      assert.deepEqual(chat.calls.reports, [expected]);
      assert.deepEqual(chat.calls.raises, []);
    } finally {
      harness.restore();
    }
  }
});

test('while a raise is in flight the chip is disabled and opens nothing', () => {
  const chat = control({ pendingChannelId: 'chat-b' });
  const harness = mount(
    () => <ConversationScopeChip channel={{ id: 'chat-a', originSurface: 'chat' }} parallelMember={false} control={chat.value} />,
  );
  try {
    const button = harness.document.querySelector<HTMLButtonElement>('button.conversationScopeChip');
    assert.equal(button?.disabled, true);
    assert.equal(button?.title, 'Moving this conversation…');
    harness.click(button);
    assert.equal(harness.document.querySelector('[role="menu"]'), null);
  } finally {
    harness.restore();
  }
});

/** Mounts the raise hook with a raise request that stays open until settled. */
function createRaiseHarness(initialRoute: string | null = 'chat-a', surface: ProductScope = 'chat') {
  const toasts: string[] = [];
  let refreshes = 0;
  let routeChannelId: string | null = initialRoute;
  const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  const requests: Array<[string, ProductScope, string]> = [];
  let hook!: ReturnType<typeof useProductScopeRaise>;
  const raise = (channelId: string, target: ProductScope, revision: string) => {
    requests.push([channelId, target, revision]);
    return new Promise<never>((resolve, reject) => {
      pending.push({ resolve: () => resolve(view() as never), reject });
    });
  };
  function Harness() {
    hook = useProductScopeRaise({
      routeChannelId,
      surface,
      refreshAppShell: () => { refreshes += 1; },
      showToast: (message) => { toasts.push(message); },
      t: en,
      raise: raise as never,
    });
    return null;
  }
  const harness = mount(() => <Harness />);
  return {
    toasts,
    requests,
    get refreshes() { return refreshes; },
    get hook() { return hook; },
    moveTo(channelId: string | null) { routeChannelId = channelId; harness.rerender(); },
    unmount() { harness.unmount(); },
    async settleFirst(outcome: 'resolve' | Error) {
      const first = pending.shift()!;
      if (outcome === 'resolve') first.resolve(); else first.reject(outcome);
      await settle();
    },
    restore() { pending.splice(0).forEach((entry) => entry.resolve()); harness.restore(); },
  };
}

test('a raise hands its toast to the redirect, whichever of the response and the update event comes first', async () => {
  const responseFirst = createRaiseHarness();
  try {
    let done!: Promise<void>;
    act(() => { done = responseFirst.hook.control.raise('chat-a', 'code', 'rev-1'); });
    assert.equal(responseFirst.hook.control.pendingChannelId, 'chat-a');
    await responseFirst.settleFirst('resolve');
    await done;
    // The update event's subscription patch brings the redirect; the refresh updates the rest.
    assert.equal(responseFirst.refreshes, 1);
    assert.deepEqual(responseFirst.toasts, [], 'the destination shows the toast, not this app');
    assert.equal(responseFirst.hook.takeRedirectNotice('chat-a', 'work'), undefined, 'only the raised product');
    assert.equal(responseFirst.hook.takeRedirectNotice('chat-b', 'code'), undefined, 'only the raised conversation');
    assert.equal(responseFirst.hook.takeRedirectNotice('chat-a', 'code'), 'This conversation moved to Code.');
    assert.equal(responseFirst.hook.takeRedirectNotice('chat-a', 'code'), undefined, 'handed over once');
    assert.equal(responseFirst.hook.control.pendingChannelId, null);
  } finally {
    responseFirst.restore();
  }

  const eventFirst = createRaiseHarness();
  try {
    act(() => { void eventFirst.hook.control.raise('chat-a', 'work', 'rev-1'); });
    assert.equal(eventFirst.hook.takeRedirectNotice('chat-a', 'work'), 'This conversation moved to Work.');
    await eventFirst.settleFirst('resolve');
    assert.deepEqual(eventFirst.toasts, [], 'no second toast once the redirect carried it');
  } finally {
    eventFirst.restore();
  }
});

test('an owner who left the conversation gets the toast where they are and is not pulled back', async () => {
  const harness = createRaiseHarness();
  try {
    act(() => { void harness.hook.control.raise('chat-a', 'code', 'rev-1'); });
    harness.moveTo('chat-z');
    await harness.settleFirst('resolve');
    assert.deepEqual(harness.toasts, ['This conversation moved to Code.']);
    assert.equal(harness.hook.takeRedirectNotice('chat-a', 'code'), undefined);
  } finally {
    harness.restore();
  }
});

test('a refused raise shows its reason, hands nothing to a redirect and unlocks', async () => {
  const harness = createRaiseHarness();
  try {
    act(() => { void harness.hook.control.raise('chat-a', 'code', 'rev-1'); });
    await harness.settleFirst(new ProductScopeRaiseError('revision_stale', 'changed'));
    assert.deepEqual(harness.toasts, ['The conversation changed after the confirmation was shown. Nothing moved; try again.']);
    assert.equal(harness.hook.takeRedirectNotice('chat-a', 'code'), undefined);
    assert.equal(harness.refreshes, 0);
    assert.equal(harness.hook.control.pendingChannelId, null);
  } finally {
    harness.restore();
  }
});

test('one raise at a time, whatever the buttons show', async () => {
  const harness = createRaiseHarness();
  try {
    act(() => {
      void harness.hook.control.raise('chat-a', 'code', 'rev-1');
      void harness.hook.control.raise('chat-b', 'work', 'rev-2');
    });
    assert.deepEqual(harness.requests, [['chat-a', 'code', 'rev-1']]);
    await harness.settleFirst('resolve');
    act(() => { void harness.hook.control.raise('chat-b', 'work', 'rev-2'); });
    assert.equal(harness.requests.length, 2);
  } finally {
    harness.restore();
  }
});

test('the redirect handoff carries the toast to the destination', () => {
  try {
    const route = stageCrossSurfaceConversationNavigationHandoff({
      sourceSurface: 'chat',
      targetSurface: 'code',
      channelId: 'chat-a',
      destinationPath: '/code/chats/chat-a',
      notice: 'This conversation moved to Code.',
    });
    assert.deepEqual(route, { surface: 'code', path: '/code/chats/chat-a' });
    const bundle = peekCrossSurfaceNavigationHandoffForMatch({ surface: 'code', path: '/code/chats/chat-a' });
    assert.equal(bundle?.optimisticState?.notice, 'This conversation moved to Code.');
    stageCrossSurfaceConversationNavigationHandoff({
      sourceSurface: 'chat', targetSurface: 'code', channelId: 'chat-b', destinationPath: '/code/chats/chat-b',
    });
    assert.equal(
      Object.hasOwn(peekCrossSurfaceNavigationHandoffForMatch({ surface: 'code', path: '/code/chats/chat-b' })?.optimisticState ?? {}, 'notice'),
      false,
    );
  } finally {
    clearCrossSurfaceNavigationHandoff();
  }
});

test('a raise whose app is gone tells the next product app, which shows another conversation', async () => {
  const first = createRaiseHarness();
  let next: ReturnType<typeof createRaiseHarness> | null = null;
  try {
    act(() => { void first.hook.control.raise('chat-a', 'code', 'rev-1'); });
    // The owner opens Settings or the Lobby while the raise waits on a running turn.
    first.unmount();
    await first.settleFirst('resolve');
    next = createRaiseHarness('chat-z');
    assert.deepEqual(next.toasts, ['This conversation moved to Code.'], 'shown by the next app to mount');
    assert.equal(next.hook.takeRedirectNotice('chat-a', 'code'), undefined, 'and not again on a later redirect');
  } finally {
    next?.restore();
    first.restore();
  }
});

test('back on the same conversation, the toast waits for its redirect, and a second raise waits its turn', async () => {
  const first = createRaiseHarness();
  let back: ReturnType<typeof createRaiseHarness> | null = null;
  try {
    act(() => { void first.hook.control.raise('chat-a', 'code', 'rev-1'); });
    first.unmount();
    // The owner reopens the conversation in a new instance of the app before the raise settles.
    back = createRaiseHarness('chat-a');
    act(() => { void back!.hook.control.raise('chat-a', 'code', 'rev-2'); });
    assert.deepEqual(back.requests, [], 'one raise at a time across apps');
    assert.deepEqual(back.toasts, ['Moving this conversation…']);
    await first.settleFirst('resolve');
    assert.deepEqual(back.toasts, ['Moving this conversation…'], 'no toast before the redirect');
    assert.equal(back.hook.takeRedirectNotice('chat-a', 'code'), 'This conversation moved to Code.',
      'the redirect carries it');
  } finally {
    back?.restore();
    first.restore();
  }
});

test('opened straight in its new product, the conversation shows the toast where no redirect will come', async () => {
  const first = createRaiseHarness();
  let code: ReturnType<typeof createRaiseHarness> | null = null;
  try {
    act(() => { void first.hook.control.raise('chat-a', 'code', 'rev-1'); });
    first.unmount();
    await first.settleFirst('resolve');
    // The owner opens the conversation from Code's Recents, where it now lives.
    code = createRaiseHarness('chat-a', 'code');
    assert.deepEqual(code.toasts, ['This conversation moved to Code.']);
    assert.equal(code.hook.takeRedirectNotice('chat-a', 'code'), undefined, 'and the notice does not linger');
  } finally {
    code?.restore();
    first.restore();
  }
});

test('a refusal after the app is gone is told too, and a mounted app shows a posted message at once', async () => {
  const first = createRaiseHarness();
  let next: ReturnType<typeof createRaiseHarness> | null = null;
  try {
    act(() => { void first.hook.control.raise('chat-a', 'code', 'rev-1'); });
    first.unmount();
    await first.settleFirst(new ProductScopeRaiseError('revision_stale', 'changed'));
    next = createRaiseHarness('chat-a');
    act(() => postRaiseNotice({ channelId: null, message: 'later' }));
    assert.deepEqual(next.toasts, [
      'The conversation changed after the confirmation was shown. Nothing moved; try again.',
      'later',
    ]);
    assert.equal(next.hook.takeRedirectNotice('chat-a', 'code'), undefined);
  } finally {
    next?.restore();
    first.restore();
  }
});

test('a request that got no answer keeps the toast for a redirect that may still come', async () => {
  const harness = createRaiseHarness();
  try {
    act(() => { void harness.hook.control.raise('chat-a', 'work', 'rev-1'); });
    await harness.settleFirst(new Error('connection reset'));
    assert.deepEqual(harness.toasts, ["Couldn't confirm the move. If the conversation did not move, try again."]);
    assert.equal(harness.hook.takeRedirectNotice('chat-a', 'work'), 'This conversation moved to Work.');
    // If the update's redirect came first, the owner was told it moved: no contradicting toast.
    act(() => { void harness.hook.control.raise('chat-b', 'code', 'rev-2'); });
    assert.equal(harness.hook.takeRedirectNotice('chat-b', 'code'), 'This conversation moved to Code.');
    await harness.settleFirst(new Error('connection reset'));
    assert.equal(harness.toasts.length, 1);
  } finally {
    harness.restore();
  }
});

test('the confirmation returns focus to the chip and keeps Tab inside it', async () => {
  const chat = control();
  const harness = mount(
    () => <ConversationScopeChip channel={{ id: 'chat-a', originSurface: 'chat' }} parallelMember={false} control={chat.value} />,
    () => json(200, view()),
  );
  try {
    const doc = harness.document;
    const chip = doc.querySelector<HTMLButtonElement>('button.conversationScopeChip');
    harness.click(chip);
    harness.click(doc.querySelectorAll('[role="menuitem"]')[0]);
    await settle();
    assert.equal(doc.activeElement?.className, 'confirmCancelButton');
    // A click on the dialog's text leaves the focus on the page; Tab brings it back in.
    (doc.activeElement as HTMLElement).blur();
    assert.equal(doc.activeElement, doc.body);
    act(() => { doc.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); });
    assert.equal(doc.activeElement?.className, 'confirmCancelButton');
    act(() => { doc.dispatchEvent(new doc.defaultView!.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    assert.equal(doc.querySelector('[role="dialog"]'), null);
    assert.equal(doc.activeElement, chip, 'focus returns to the chip');
    assert.deepEqual(chat.calls.raises, []);
  } finally {
    harness.restore();
  }
});
