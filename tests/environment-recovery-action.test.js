import assert from 'node:assert/strict';
import test from 'node:test';

import { openBrowserUrl } from '../build/server/shared/catsRuntimeLink.js';
import { executeEnvironmentRecovery } from '../build/server/shared/environmentRecoveryAction.js';

function withBrowserContext(context, run) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

  if ('window' in context) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: context.window,
    });
  }

  if ('location' in context) {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      writable: true,
      value: context.location,
    });
  }

  const restore = () => {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      delete globalThis.window;
    }

    if (originalLocation) {
      Object.defineProperty(globalThis, 'location', originalLocation);
    } else {
      delete globalThis.location;
    }
  };

  try {
    return run();
  } finally {
    restore();
  }
}

test('executeEnvironmentRecovery falls back to runtime setup when desktop trigger fails', async () => {
  let openedUrl = null;

  await executeEnvironmentRecovery(
    {
      runtimeStatus: 'unavailable',
    },
    {
      getDesktopSetupRecommendation: async () => ({
        available: true,
        reason: 'resume_setup',
        summary: 'Resume setup',
      }),
      triggerDesktopPackagedSetup: async () => false,
      openBrowserUrl: (url) => {
        openedUrl = url;
      },
    },
  );

  assert.equal(openedUrl, '/runtime/setup');
});

test('executeEnvironmentRecovery routes to runtime setup when runtime setup needs remediation', async () => {
  let openedUrl = null;

  await executeEnvironmentRecovery(
    {
      runtimeStatus: 'ready',
      runtimeSetupStatus: 'attention_required',
    },
    {
      getDesktopSetupRecommendation: async () => ({ available: false }),
      openBrowserUrl: (url) => {
        openedUrl = url;
      },
    },
  );

  assert.equal(openedUrl, '/runtime/setup');
});

test('executeEnvironmentRecovery does not navigate when desktop packaged setup succeeds', async () => {
  let openedUrl = null;

  await executeEnvironmentRecovery(
    {
      runtimeStatus: 'unavailable',
    },
    {
      getDesktopSetupRecommendation: async () => ({
        available: true,
        reason: 'resume_setup',
        summary: 'Resume setup',
      }),
      triggerDesktopPackagedSetup: async () => true,
      openBrowserUrl: (url) => {
        openedUrl = url;
      },
    },
  );

  assert.equal(openedUrl, null);
});

test('executeEnvironmentRecovery ignores verification-only desktop setup recommendations', async () => {
  let openedUrl = null;
  let triggered = false;

  await executeEnvironmentRecovery(
    {
      runtimeStatus: 'ready',
      runtimeSetupStatus: 'ready',
    },
    {
      getDesktopSetupRecommendation: async () => ({
        available: true,
        reason: 'verification_recommended',
        summary: 'Rerun a verification step.',
      }),
      triggerDesktopPackagedSetup: async () => {
        triggered = true;
        return true;
      },
      openBrowserUrl: (url) => {
        openedUrl = url;
      },
    },
  );

  assert.equal(triggered, false);
  assert.equal(openedUrl, '/runtime');
});

test('openBrowserUrl falls back to location.assign when window.open is unavailable', () => {
  let assignedUrl = null;

  withBrowserContext(
    {
      window: undefined,
      location: {
        assign(url) {
          assignedUrl = url;
        },
      },
    },
    () => {
      openBrowserUrl('/runtime/setup');
    },
  );

  assert.equal(assignedUrl, '/runtime/setup');
});

test('openBrowserUrl throws when no browser navigation context exists', () => {
  withBrowserContext(
    {
      window: undefined,
      location: undefined,
    },
    () => {
      assert.throws(
        () => openBrowserUrl('/runtime/setup'),
        /browser navigation context/i,
      );
    },
  );
});
