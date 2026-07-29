import assert from 'node:assert/strict';
import test from 'node:test';

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import React from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  PlatformSettingsDesktopUpdates,
} from '../src/app/renderer/settings/PlatformSettingsDesktopUpdates.tsx';

/**
 * jsdom is installed and torn down per test, matching the rest of the suite.
 *
 * Only the synchronous form of `act` is used below. Under an ESM bundle React
 * cannot reach `require('timers').setImmediate`, so `await act(async …)` falls
 * back to a fresh `MessageChannel` per call whose ports it never closes. Those
 * are real Node handles, and they keep the test process alive forever.
 */
function installDom(): () => void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });
  const previousDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();
  const globals: Array<[PropertyKey, unknown]> = [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['HTMLElement', dom.window.HTMLElement],
    ['Node', dom.window.Node],
    ['Event', dom.window.Event],
    ['MouseEvent', dom.window.MouseEvent],
    ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
  ];

  for (const [key, value] of globals) {
    previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
  }

  return () => {
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete (globalThis as Record<PropertyKey, unknown>)[key];
      }
    }
    dom.window.close();
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    capability: {
      distribution: 'official_packaged',
      provider: 'github_release',
      channel: 'stable',
      currentVersion: '0.1.2',
      canCheck: true,
      canDownload: true,
      canInstall: true,
      unavailableReason: null,
    },
    status: 'idle',
    currentVersion: '0.1.2',
    availableVersion: null,
    releaseSummary: null,
    lastCheckedAt: null,
    progress: null,
    error: null,
    nextAction: 'check',
    ...overrides,
  };
}

function installBridge(bridge: Record<string, unknown> | null) {
  if (bridge === null) {
    delete (globalThis as { catsDesktopHost?: unknown }).catsDesktopHost;
    return;
  }
  (globalThis as { catsDesktopHost?: unknown }).catsDesktopHost = bridge;
}

function renderSection(props: Record<string, unknown> = {}) {
  return render(
    <I18nProvider locale="en">
      <PlatformSettingsDesktopUpdates
        showToast={() => {}}
        platform="Win32"
        {...props}
      />
    </I18nProvider>,
  );
}

async function withSection(
  bridge: Record<string, unknown> | null,
  props: Record<string, unknown>,
  assertions: (view: ReturnType<typeof render>) => Promise<void> | void,
) {
  const restoreDom = installDom();
  installBridge(bridge);
  try {
    const view = renderSection(props);
    await assertions(view);
  } finally {
    cleanup();
    installBridge(null);
    restoreDom();
  }
}

test('the section stays absent outside a desktop host', async () => {
  await withSection(null, {}, (view) => {
    assert.equal(view.container.textContent, '');
  });
});

test('the installed version is shown even when updates are unavailable', async () => {
  // Cats has no About surface, so this section is the only place a user can
  // read the installed version. It must not disappear with the update action.
  const bridge = {
    getUpdateSnapshot: async () => snapshot({
      capability: {
        ...snapshot().capability,
        distribution: 'unofficial_packaged',
        provider: 'none',
        canCheck: false,
        canDownload: false,
        canInstall: false,
        unavailableReason: 'descriptor_missing',
      },
      status: 'unavailable',
      nextAction: 'none',
    }),
  };

  await withSection(bridge, {}, async (view) => {
    await waitFor(() => {
      assert.match(view.container.textContent ?? '', /0\.1\.2/u);
    });
    assert.equal(view.container.querySelector('button'), null);
  });
});

test('an official build shows version, channel, and a check action', async () => {
  await withSection({ getUpdateSnapshot: async () => snapshot() }, {}, async (view) => {
    await waitFor(() => {
      assert.match(view.container.textContent ?? '', /Check for Updates/u);
    });
    assert.match(view.container.textContent ?? '', /0\.1\.2/u);
    assert.match(view.container.textContent ?? '', /stable/u);
    assert.equal(view.container.querySelector('button')?.disabled, false);
  });
});

test('a preview build says it is an unsigned preview', async () => {
  const bridge = {
    getUpdateSnapshot: async () => snapshot({
      capability: { ...snapshot().capability, distribution: 'preview_packaged' },
    }),
  };

  await withSection(bridge, {}, async (view) => {
    await waitFor(() => {
      assert.match(view.container.textContent ?? '', /unsigned preview/iu);
    });
  });
});

test('an up-to-date result is reported through the toast system', async () => {
  const messages: string[] = [];
  const bridge = {
    getUpdateSnapshot: async () => snapshot(),
    checkForUpdates: async () => snapshot({ status: 'up_to_date', nextAction: 'check' }),
  };

  await withSection(bridge, { showToast: (m: string) => messages.push(m) }, async (view) => {
    await waitFor(() => {
      assert.ok(view.container.querySelector('button'));
    });
    act(() => {
      view.container.querySelector('button')?.click();
    });

    // AGENTS.md forbids inline settings feedback; toast is the only channel.
    await waitFor(() => {
      assert.equal(messages.length, 1);
    });
    assert.match(messages[0], /up to date/iu);
  });
});

test('a failure is reported from its stable code rather than a provider message', async () => {
  const messages: string[] = [];
  const bridge = {
    getUpdateSnapshot: async () => snapshot(),
    checkForUpdates: async () => snapshot({
      status: 'failed',
      nextAction: 'check',
      error: { code: 'offline', summary: 'raw provider text that must not leak' },
    }),
  };

  await withSection(bridge, { showToast: (m: string) => messages.push(m) }, async (view) => {
    await waitFor(() => {
      assert.ok(view.container.querySelector('button'));
    });
    act(() => {
      view.container.querySelector('button')?.click();
    });

    await waitFor(() => {
      assert.equal(messages.length, 1);
    });
    assert.match(messages[0], /could not reach the update service/iu);
    assert.equal(messages[0].includes('raw provider text'), false);
  });
});

test('an available update offers download and shows the release summary', async () => {
  const bridge = {
    getUpdateSnapshot: async () => snapshot({
      status: 'update_available',
      nextAction: 'download',
      availableVersion: '0.1.3',
      releaseSummary: 'Cats 0.1.3',
    }),
  };

  await withSection(bridge, {}, async (view) => {
    await waitFor(() => {
      assert.match(view.container.textContent ?? '', /Download Update/u);
    });
    assert.match(view.container.textContent ?? '', /0\.1\.3/u);
    assert.match(view.container.textContent ?? '', /Cats 0\.1\.3/u);
  });
});

test('a downloaded update warns about the visible Windows installer', async () => {
  const bridge = {
    getUpdateSnapshot: async () => snapshot({
      status: 'downloaded',
      nextAction: 'restart_install',
      availableVersion: '0.1.3',
    }),
  };

  await withSection(bridge, { platform: 'Win32' }, async (view) => {
    await waitFor(() => {
      assert.match(view.container.textContent ?? '', /Restart and Install/u);
    });
    assert.match(view.container.textContent ?? '', /installer will open/iu);
  });
});

test('an in-flight download disables the action and shows progress', async () => {
  const bridge = {
    getUpdateSnapshot: async () => snapshot({
      status: 'downloading',
      nextAction: 'none',
      availableVersion: '0.1.3',
      progress: { percent: 40, transferredBytes: 4, totalBytes: 10, bytesPerSecond: 1 },
    }),
  };

  await withSection(bridge, {}, async (view) => {
    await waitFor(() => {
      assert.ok(view.container.querySelector('progress'));
    });
    assert.equal(view.container.querySelector('button')?.disabled, true);
    assert.equal(view.container.querySelector('progress')?.getAttribute('value'), '40');
  });
});

test('host-pushed snapshots update the surface without a user action', async () => {
  let push: ((next: unknown) => void) | null = null;
  const bridge = {
    getUpdateSnapshot: async () => snapshot(),
    onUpdateSnapshot: (listener: (next: unknown) => void) => {
      push = listener;
      return () => {
        push = null;
      };
    },
  };

  await withSection(bridge, {}, async (view) => {
    await waitFor(() => {
      assert.ok(view.container.querySelector('button'));
    });
    assert.equal((view.container.textContent ?? '').includes('0.1.3'), false);

    act(() => {
      push?.(snapshot({
        status: 'update_available',
        nextAction: 'download',
        availableVersion: '0.1.3',
      }));
    });

    assert.match(view.container.textContent ?? '', /0\.1\.3/u);
  });
});
