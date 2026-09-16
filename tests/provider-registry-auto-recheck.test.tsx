import { resetTestDom, testDomWindow } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { useProviderRegistryAutoRecheck } from '../src/design/components/useProviderRegistryAutoRecheck.ts';

test('a healthy picker becoming visible during cooldown keeps its next selection check', (t) => {
  resetTestDom();
  t.after(cleanup);
  let now = 40_000;
  let visible = false;
  t.mock.method(Date, 'now', () => now);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visible ? 'visible' : 'hidden' });
  t.after(() => Reflect.deleteProperty(document, 'visibilityState'));
  const scheduled = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => {
    scheduled.set(++timerId, { callback, delay });
    return timerId;
  });
  t.mock.method(globalThis, 'clearTimeout', (id: number) => { scheduled.delete(id); });
  const calls: number[] = [];
  const reloadProviderRegistry = ({ markAutoRecheckAt }: { markAutoRecheckAt: number }) => calls.push(markAutoRecheckAt);
  function Picker() {
    useProviderRegistryAutoRecheck({ providersLoaded: true, providerCount: 1, registryState: 'ready',
      retryable: false, providerRegistrySetupHref: null, lastAutoProviderRegistryRecheckAt: 30_000,
      reloadProviderRegistry });
    return null;
  }
  render(<Picker />);
  assert.equal(scheduled.size, 0);
  visible = true;
  act(() => { document.dispatchEvent(new testDomWindow.Event('visibilitychange')); });
  assert.deepEqual(calls, []);
  assert.equal(scheduled.size, 1);
  const [timer] = scheduled.values();
  assert.equal(timer.delay, 20_000);
  now += timer.delay;
  act(() => { timer.callback(); });
  assert.deepEqual(calls, [60_000]);
});
