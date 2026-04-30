import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDesktopBootstrapNavigation,
  shouldRevealDesktopBootstrapRecovery,
} from '../build/desktop/bootstrapNavigation.js';

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

test('desktop bootstrap only reveals the host recovery page for failed or setup-blocked states', () => {
  const options = {
    showWindowOnStartup: true,
    windowRevealRequested: false,
  };

  assert.equal(shouldRevealDesktopBootstrapRecovery({
    phase: 'ready_for_chat',
    app: {
      entryPath: '/',
      setupCompleteAt: '2026-04-08T09:00:00.000Z',
    },
  }, options), false);
  assert.equal(shouldRevealDesktopBootstrapRecovery({
    phase: 'ready_for_setup',
    app: {
      entryPath: '/setup',
      setupCompleteAt: null,
    },
  }, options), false);
  assert.equal(shouldRevealDesktopBootstrapRecovery({
    phase: 'failed',
    app: {
      entryPath: '/setup',
      setupCompleteAt: null,
    },
  }, options), true);
  assert.equal(shouldRevealDesktopBootstrapRecovery({
    phase: 'needs_prerequisites',
    app: {
      entryPath: '/setup',
      setupCompleteAt: null,
    },
  }, options), true);
  assert.equal(shouldRevealDesktopBootstrapRecovery({
    phase: 'needs_prerequisites',
    app: {
      entryPath: '/',
      setupCompleteAt: '2026-04-08T09:00:00.000Z',
    },
  }, options), false);
  assert.equal(shouldRevealDesktopBootstrapRecovery({
    phase: 'failed',
    app: {
      entryPath: '/setup',
      setupCompleteAt: null,
    },
  }, {
    showWindowOnStartup: false,
    windowRevealRequested: false,
  }), false);
});

test('desktop bootstrap navigation lets setupCompleteAt users into chat regardless of cli inventory (legacy migration safety)', () => {
  // Legacy users upgrading from a build that didn't track installedHelperIds
  // would otherwise be locked on bootstrap. Their setupCompleteAt timestamp
  // is the trust signal — they had a working install, let them through.
  assert.equal(resolveDesktopBootstrapNavigation({
    phase: 'needs_prerequisites',
    app: {
      entryPath: '/',
      setupCompleteAt: '2026-04-30T08:00:00.000Z',
    },
  }, {
    appBaseUrl: 'http://127.0.0.1:8181',
    showWindowOnStartup: true,
  }), 'http://127.0.0.1:8181/');
});
