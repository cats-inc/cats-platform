import assert from 'node:assert/strict';
import test from 'node:test';

import {
  openAuthenticatedDesktopBrowserPath,
} from '../src/app/renderer/auth/AuthenticatedBrowserLink.tsx';

test('desktop browser link mints a handoff before asking the host to open it', async () => {
  const previousFetch = globalThis.fetch;
  const hostGlobal = globalThis as typeof globalThis & {
    catsDesktopHost?: {
      openBrowserHandoff?: (launchPath: string) => Promise<void>;
    };
  };
  const previousBridge = hostGlobal.catsDesktopHost;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const opened: string[] = [];

  globalThis.fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      launchMode: 'handoff',
      launchPath: '/api/auth/browser-handoff/exchange#token=handoff-token',
      expiresAt: '2026-08-05T00:00:30.000Z',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  hostGlobal.catsDesktopHost = {
    async openBrowserHandoff(launchPath) {
      opened.push(launchPath);
    },
  };

  try {
    await openAuthenticatedDesktopBrowserPath('/runtime/setup');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, '/api/auth/browser-handoff');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.equal(calls[0]?.init?.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      returnTo: '/runtime/setup',
    });
    assert.deepEqual(opened, [
      '/api/auth/browser-handoff/exchange#token=handoff-token',
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBridge === undefined) {
      delete hostGlobal.catsDesktopHost;
    } else {
      hostGlobal.catsDesktopHost = previousBridge;
    }
  }
});

test('desktop browser link accepts a direct pre-setup runtime launch', async () => {
  const previousFetch = globalThis.fetch;
  const hostGlobal = globalThis as typeof globalThis & {
    catsDesktopHost?: {
      openBrowserHandoff?: (launchPath: string) => Promise<void>;
    };
  };
  const previousBridge = hostGlobal.catsDesktopHost;
  const opened: string[] = [];

  globalThis.fetch = async () => new Response(JSON.stringify({
    launchMode: 'direct',
    launchPath: '/runtime/setup',
    expiresAt: null,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  hostGlobal.catsDesktopHost = {
    async openBrowserHandoff(launchPath) {
      opened.push(launchPath);
    },
  };

  try {
    await openAuthenticatedDesktopBrowserPath('/runtime/setup');
    assert.deepEqual(opened, ['/runtime/setup']);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBridge === undefined) {
      delete hostGlobal.catsDesktopHost;
    } else {
      hostGlobal.catsDesktopHost = previousBridge;
    }
  }
});

test('desktop browser link surfaces unauthenticated handoff failures', async () => {
  const previousFetch = globalThis.fetch;
  const hostGlobal = globalThis as typeof globalThis & {
    catsDesktopHost?: {
      openBrowserHandoff?: (launchPath: string) => Promise<void>;
    };
  };
  const previousBridge = hostGlobal.catsDesktopHost;

  globalThis.fetch = async () => new Response('{}', { status: 401 });
  hostGlobal.catsDesktopHost = { async openBrowserHandoff() {} };

  try {
    await assert.rejects(
      () => openAuthenticatedDesktopBrowserPath('/runtime/setup'),
      /HTTP 401/u,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBridge === undefined) {
      delete hostGlobal.catsDesktopHost;
    } else {
      hostGlobal.catsDesktopHost = previousBridge;
    }
  }
});

test('desktop browser link rejects malformed handoff responses', async () => {
  const previousFetch = globalThis.fetch;
  const hostGlobal = globalThis as typeof globalThis & {
    catsDesktopHost?: {
      openBrowserHandoff?: (launchPath: string) => Promise<void>;
    };
  };
  const previousBridge = hostGlobal.catsDesktopHost;

  globalThis.fetch = async () => new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  hostGlobal.catsDesktopHost = {
    async openBrowserHandoff() {},
  };

  try {
    await assert.rejects(
      () => openAuthenticatedDesktopBrowserPath('/runtime/setup'),
      /response is invalid/u,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBridge === undefined) {
      delete hostGlobal.catsDesktopHost;
    } else {
      hostGlobal.catsDesktopHost = previousBridge;
    }
  }
});
