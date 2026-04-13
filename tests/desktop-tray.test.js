import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDesktopWindowRevealNavigation,
  shouldNavigateDesktopBootstrap,
} from '../build/desktop/bootstrapNavigation.js';
import { buildDesktopTrayMenuState } from '../build/desktop/trayMenu.js';

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
