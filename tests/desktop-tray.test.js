import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDesktopWindowRevealNavigation,
  shouldNavigateDesktopBootstrap,
} from '../build/desktop/bootstrapNavigation.js';
import {
  buildDesktopTrayMenuState,
  buildDesktopTrayQuittingMenuState,
} from '../build/desktop/trayMenu.js';

test('tray menu shows setup-oriented actions before onboarding is complete', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'ready_for_setup',
    summary: 'Desktop services are ready. Continue into setup.',
    setupCompleteAt: null,
    actions: [
      { id: 'open_setup', label: 'Continue to Setup', primary: true },
      { id: 'open_runtime_diagnostics', label: 'Open Runtime Diagnostics', primary: false },
      { id: 'quit', label: 'Quit', primary: false },
    ],
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.deepEqual(
    state.actions.map((action) => action.id),
    ['open_setup'],
  );
  assert.equal(state.products.length, 0);
});

test('tray menu keeps diagnostics out of healthy top-level actions after setup is complete', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'ready_for_chat',
    summary: 'Desktop services and at least one provider path are ready.',
    setupCompleteAt: '2026-04-04T10:00:00.000Z',
    actions: [
      { id: 'open_chat', label: 'Open Cats', primary: true },
      { id: 'open_runtime_diagnostics', label: 'Open Runtime Diagnostics', primary: false },
      { id: 'quit', label: 'Quit', primary: false },
    ],
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
      {
        id: 'work',
        productName: 'Cats Work',
        routePrefix: '/work',
        installState: 'installed',
        setup: { selectable: true },
      },
      {
        id: 'code',
        productName: 'Cats Code',
        routePrefix: '/code',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.deepEqual(
    state.actions.map((action) => action.id),
    ['open_chat'],
  );
  assert.deepEqual(
    state.products.map((product) => [product.id, product.label, product.path]),
    [
      ['chat', 'Open Chat', '/chat'],
      ['work', 'Open Work', '/work'],
      ['code', 'Open Code', '/code'],
    ],
  );
});

test('tray menu preserves product shortcuts when setup completion comes from persisted fallback', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'checking_prerequisites',
    summary: 'Local services are ready. Running prerequisite checks.',
    setupCompleteAt: null,
    fallbackSetupCompleteAt: '2026-04-04T10:00:00.000Z',
    actions: [
      { id: 'open_chat', label: 'Open Cats', primary: true },
      { id: 'quit', label: 'Quit', primary: false },
    ],
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
      {
        id: 'work',
        productName: 'Cats Work',
        routePrefix: '/work',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.equal(state.setupCompleteAt, '2026-04-04T10:00:00.000Z');
  assert.deepEqual(
    state.products.map((product) => product.id),
    ['chat', 'work'],
  );
});

test('tray menu localizes product shortcuts and primary actions for zh-TW', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'ready_for_chat',
    summary: 'Desktop services and at least one provider path are ready.',
    setupCompleteAt: '2026-04-04T10:00:00.000Z',
    locale: 'zh-TW',
    actions: [
      { id: 'open_chat', label: 'Open Cats', primary: true },
      { id: 'retry', label: 'Retry Check', primary: false },
      { id: 'quit', label: 'Quit', primary: false },
    ],
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
      {
        id: 'work',
        productName: 'Cats Work',
        routePrefix: '/work',
        installState: 'installed',
        setup: { selectable: true },
      },
      {
        id: 'code',
        productName: 'Cats Code',
        routePrefix: '/code',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.deepEqual(
    state.actions.map((action) => [action.id, action.label]),
    [
      ['open_chat', '開啟 Cats'],
      ['retry', '重試'],
    ],
  );
  assert.equal(state.summary, '桌面服務與至少一個供應器路徑已就緒。');
  assert.deepEqual(
    state.products.map((product) => [product.id, product.label, product.path]),
    [
      ['chat', '開啟聊天', '/chat'],
      ['work', '開啟工作', '/work'],
      ['code', '開啟程式碼', '/code'],
    ],
  );
});

test('tray menu strips runtime diagnostics even when upstream actions still include it', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'needs_prerequisites',
    summary: 'Cats Runtime needs attention.',
    setupCompleteAt: '2026-04-04T10:00:00.000Z',
    actions: [
      { id: 'open_chat', label: 'Open Cats', primary: true },
      { id: 'retry', label: 'Retry Check', primary: false },
      { id: 'open_runtime_diagnostics', label: 'Open Runtime Diagnostics', primary: false },
      { id: 'quit', label: 'Quit', primary: false },
    ],
    products: [],
  });

  assert.deepEqual(
    state.actions.map((action) => action.id),
    ['open_chat', 'retry'],
  );
});

test('tray menu hides unavailable or disabled products from app-shell descriptors', () => {
  const state = buildDesktopTrayMenuState({
    phase: 'ready_for_chat',
    summary: 'Desktop services are ready.',
    setupCompleteAt: '2026-04-04T10:00:00.000Z',
    actions: [
      { id: 'open_chat', label: 'Open Cats', primary: true },
      { id: 'quit', label: 'Quit', primary: false },
    ],
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
      {
        id: 'work',
        productName: 'Cats Work',
        routePrefix: '/work',
        installState: 'available',
        setup: { selectable: true },
      },
      {
        id: 'code',
        productName: 'Cats Code',
        routePrefix: '/code',
        installState: 'installed',
        setup: { selectable: false, disabledReason: 'Coming soon' },
      },
      {
        id: 'invalid',
        productName: 'Broken Plugin',
        routePrefix: 'relative/path',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.deepEqual(
    state.products.map((product) => product.id),
    ['chat'],
  );
});

test('tray menu exposes a locked quitting state with no actionable entries', () => {
  const state = buildDesktopTrayQuittingMenuState();

  assert.equal(state.lockedLabel, 'Quitting...');
  assert.equal(state.lockedTooltip, 'Cats — quitting');
  assert.equal(state.summary, 'Quitting...');
  assert.deepEqual(state.actions, []);
  assert.deepEqual(state.products, []);
  assert.equal(state.setupCompleteAt, null);
  // phase is intentionally omitted — locked menus short-circuit before the
  // phase-driven status label runs, so guessing a bootstrap phase here
  // would lie to anything else that reads the snapshot later.
  assert.equal(state.phase, undefined);
});

test('tray menu localizes quitting state for zh-TW', () => {
  const state = buildDesktopTrayQuittingMenuState('zh-Hant');

  assert.equal(state.lockedLabel, '正在結束...');
  assert.equal(state.lockedTooltip, 'Cats — 正在結束');
  assert.equal(state.summary, '正在結束...');
});

test('window reveal navigation exits the bootstrap page once chat is ready', () => {
  assert.equal(
    resolveDesktopWindowRevealNavigation({
      phase: 'ready_for_chat',
      app: {
        entryPath: '/chat',
        setupCompleteAt: '2026-04-04T10:00:00.000Z',
      },
    }, {
      appBaseUrl: 'http://127.0.0.1:8181',
      bootstrapPageVisible: true,
    }),
    'http://127.0.0.1:8181/chat',
  );

  assert.equal(
    resolveDesktopWindowRevealNavigation({
      phase: 'ready_for_chat',
      app: {
        entryPath: '/chat',
        setupCompleteAt: '2026-04-04T10:00:00.000Z',
      },
    }, {
      appBaseUrl: 'http://127.0.0.1:8181',
      bootstrapPageVisible: false,
    }),
    null,
  );
});

test('manual window reveal keeps bootstrap navigation enabled even for hidden sign-in launches', () => {
  assert.equal(
    shouldNavigateDesktopBootstrap({
      showWindowOnStartup: false,
      windowRevealRequested: false,
    }),
    false,
  );

  assert.equal(
    shouldNavigateDesktopBootstrap({
      showWindowOnStartup: false,
      windowRevealRequested: true,
    }),
    true,
  );
});
