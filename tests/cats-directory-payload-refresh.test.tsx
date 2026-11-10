import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';

import { useDirectoryCatsPayload } from '../src/app/renderer/entities/CatsCanvasPage.tsx';
import { PLATFORM_ENVELOPE_REFRESH_EVENT } from '../src/app/renderer/platformEnvelopeEvents.ts';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';

test('a cats canvas update refreshes the platform envelope the Directory sidebar lists', async (t) => {
  resetTestDom();
  const originalFetch = globalThis.fetch;
  // The initial load fails, so the only payload is the one the canvas reports.
  globalThis.fetch = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  // In a browser `globalThis` is `window`; the jsdom helper only installs
  // `window` and `document`, so bridge the two members the dispatcher uses.
  const host = globalThis as typeof globalThis & {
    dispatchEvent?: typeof window.dispatchEvent;
    CustomEvent?: typeof window.CustomEvent;
  };
  const originalDispatch = host.dispatchEvent;
  const originalCustomEvent = host.CustomEvent;
  host.dispatchEvent = window.dispatchEvent.bind(window);
  host.CustomEvent = window.CustomEvent;
  let refreshes = 0;
  const onRefresh = () => {
    refreshes += 1;
  };
  window.addEventListener(PLATFORM_ENVELOPE_REFRESH_EVENT, onRefresh);
  t.after(() => {
    window.removeEventListener(PLATFORM_ENVELOPE_REFRESH_EVENT, onRefresh);
    cleanup();
    resetTestDom();
    globalThis.fetch = originalFetch;
    host.dispatchEvent = originalDispatch;
    host.CustomEvent = originalCustomEvent;
  });

  let report: ((next: AppShellPayload) => void) | null = null;
  function Probe() {
    const [payload, onPayloadUpdate] = useDirectoryCatsPayload();
    report = onPayloadUpdate;
    return <span>{payload ? `cats:${payload.chat.cats.length}` : 'loading'}</span>;
  }

  const view = render(<Probe />);
  assert.ok(view.getByText('loading'));

  // A deliberately partial payload: the probe reads only `chat.cats`.
  const created = { chat: { cats: [{ id: 'cat-new' }] } } as unknown as AppShellPayload;
  act(() => {
    report?.(created);
  });

  await waitFor(() => assert.ok(view.getByText('cats:1')));
  assert.equal(refreshes, 1);
  view.unmount();
});
