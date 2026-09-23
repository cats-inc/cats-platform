import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useDesktopHostPlatformShellSync } from '../src/app/renderer/setup/useDesktopHostPlatformShellSync.ts';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

test('normal renderer loads and product changes sync tray data without re-running setup', () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:8181/chat' });
  const originals = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map((key) =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  const updates: unknown[] = [];
  Object.assign(dom.window, { catsDesktopHost: { updatePlatformShell: async (payload: unknown) => { updates.push(payload); } } });
  const root = createRoot(dom.window.document.getElementById('root')!);
  const products = ['chat', 'work', 'code'].map((id) => ({
    id, productName: `Cats ${id}`, routePrefix: `/${id}`,
    installState: 'installed', setup: { selectable: true },
  })) as PlatformHostEnvelope['products'];
  const envelope = { bootstrapAttemptId: 'existing', setupCompleteAt: '2026-09-24T00:00:00Z', products } as PlatformHostEnvelope;
  function Probe({ value }: { value: PlatformHostEnvelope | null }) {
    useDesktopHostPlatformShellSync(value);
    return null;
  }
  // The bridge records updates synchronously. Synchronous act also avoids React
  // 18's async MessageChannel fallback leaking ports in CI's bundled ESM tests.
  try {
    act(() => { root.render(<Probe value={null} />); });
    assert.equal(updates.length, 0);
    act(() => { root.render(<Probe value={envelope} />); });
    assert.deepEqual(updates, [envelope]);
    act(() => { root.render(<Probe value={{ ...envelope, ownerDisplayName: 'Changed' }} />); });
    assert.equal(updates.length, 1, 'unrelated shell changes do not rebuild the tray');
    const disabled = { ...envelope, products: products.map((p) => p.id === 'work'
      ? { ...p, setup: { selectable: false } } : p) };
    act(() => { root.render(<Probe value={disabled} />); });
    assert.deepEqual(updates.at(-1), disabled);
    act(() => { root.render(<Probe value={null} />); });
    assert.equal(updates.length, 2, 'loading/error does not invent an empty authoritative product list');
    act(() => { root.render(<Probe value={envelope} />); });
    assert.equal(updates.length, 3, 'a later normal load restores synchronization');
  } finally {
    act(() => { root.unmount(); });
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
