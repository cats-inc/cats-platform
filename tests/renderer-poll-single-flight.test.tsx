import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';
import { DesktopControlConversation } from '../src/products/shared/renderer/components/desktop-control/DesktopControlConversation.tsx';
import { useOperatorLoop } from '../src/products/shared/renderer/hooks/useOperatorLoop.ts';

async function settle() { for (let turn = 0; turn < 5; turn++) await nextTurn(); }

/** Holds every request open until `release()`, and captures interval callbacks instead of scheduling them. */
function createHarness(matches: (url: string) => boolean, body: (url: string) => unknown) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const intervals: Array<() => void> = [];
  const captureInterval = ((callback: () => void) => { intervals.push(callback); return intervals.length; }) as unknown as typeof setInterval;
  const waiting: Array<() => void> = [];
  let requests = 0;
  const fetchStub = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (matches(url)) requests += 1;
    await new Promise<void>((resolve) => waiting.push(resolve));
    return new Response(JSON.stringify(body(url)), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  dom.window.setInterval = captureInterval as unknown as typeof dom.window.setInterval;
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    fetch: fetchStub, setInterval: captureInterval,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  return {
    get requests() { return requests; },
    async render(element: React.ReactNode) { act(() => { root.render(element); }); await settle(); },
    async tick(times: number) { for (let index = 0; index < times; index++) intervals.forEach((callback) => callback()); await settle(); },
    async release() { waiting.splice(0).forEach((resolve) => resolve()); await settle(); },
    restore() {
      act(() => root.unmount());
      waiting.splice(0).forEach((resolve) => resolve());
      dom.window.close();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

function OperatorLoopProbe() {
  useOperatorLoop({ setupCompleteAt: '2026-11-10T00:00:00.000Z' } as AppShellPayload, 'refresh-key');
  return null;
}

test('background operator refreshes wait for the snapshot still loading', async () => {
  const harness = createHarness(
    (url) => url.endsWith('/api/core'),
    (url) => (url.endsWith('/api/core/approvals') ? { approvals: [] } : {}),
  );
  try {
    await harness.render(<I18nProvider locale="en"><OperatorLoopProbe /></I18nProvider>);
    assert.equal(harness.requests, 1);

    await harness.tick(3);
    assert.equal(harness.requests, 1, 'ticks during a pending snapshot must not start another');

    await harness.release();
    await harness.tick(1);
    assert.equal(harness.requests, 2);
  } finally {
    harness.restore();
  }
});

test('the desktop control panel skips polls while its state request is still out', async () => {
  const harness = createHarness(
    (url) => url.includes('/api/desktop-control/'),
    () => ({ available: true, reason: null, enabled: false, conversations: [] }),
  );
  try {
    await harness.render(<I18nProvider locale="en"><DesktopControlConversation channelId="channel-1" /></I18nProvider>);
    assert.equal(harness.requests, 1);

    await harness.tick(3);
    assert.equal(harness.requests, 1, 'ticks during a pending request must not start another');

    await harness.release();
    await harness.tick(1);
    assert.equal(harness.requests, 2);
  } finally {
    harness.restore();
  }
});
