import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDesktopBootstrapNavigation } from '../build/desktop/bootstrapNavigation.js';

test('desktop bootstrap navigation opens setup when services are ready but setup is incomplete', () => {
  const nextUrl = resolveDesktopBootstrapNavigation({
    phase: 'ready_for_setup',
    app: {
      entryPath: '/setup',
    },
  }, {
    appBaseUrl: 'http://127.0.0.1:8181',
    showWindowOnStartup: true,
  });

  assert.equal(nextUrl, 'http://127.0.0.1:8181/setup');
});

test('desktop bootstrap navigation opens the product entry when chat is ready', () => {
  const nextUrl = resolveDesktopBootstrapNavigation({
    phase: 'ready_for_chat',
    app: {
      entryPath: '/',
      setupCompleteAt: '2026-04-08T09:00:00.000Z',
    },
  }, {
    appBaseUrl: 'http://127.0.0.1:8181',
    showWindowOnStartup: true,
  });

  assert.equal(nextUrl, 'http://127.0.0.1:8181/');
});

test('desktop bootstrap navigation stays on the host page when startup is hidden', () => {
  assert.equal(resolveDesktopBootstrapNavigation({
    phase: 'ready_for_setup',
    app: {
      entryPath: '/setup',
    },
  }, {
    appBaseUrl: 'http://127.0.0.1:8181',
    showWindowOnStartup: false,
  }), null);
});

test('desktop bootstrap navigation opens Cats recovery instead of setup after onboarding is complete', () => {
  assert.equal(resolveDesktopBootstrapNavigation({
    phase: 'needs_prerequisites',
    app: {
      entryPath: '/',
      setupCompleteAt: '2026-04-08T09:00:00.000Z',
    },
  }, {
    appBaseUrl: 'http://127.0.0.1:8181',
    showWindowOnStartup: true,
  }), 'http://127.0.0.1:8181/');
});
