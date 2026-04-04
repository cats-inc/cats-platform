import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopTrayMenuState } from '../dist-electron/trayMenu.js';

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
    ['open_setup', 'open_runtime_diagnostics'],
  );
  assert.equal(state.products.length, 0);
});

test('tray menu exposes installed live products after setup is complete', () => {
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
    state.products.map((product) => [product.id, product.label, product.path]),
    [
      ['chat', 'Open Chat', '/chat'],
      ['work', 'Open Work', '/work'],
      ['code', 'Open Code', '/code'],
    ],
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
