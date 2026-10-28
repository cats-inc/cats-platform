import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { ProviderInteractionCard } from '../src/products/shared/renderer/components/provider-interactions/ProviderInteractionCard.tsx';
import { ProviderCapabilities } from '../src/products/shared/renderer/components/provider-interactions/ProviderCapabilities.tsx';
import { useDraftSessionChips } from '../src/products/shared/renderer/hooks/useDraftSessionChips.tsx';
import type { RuntimeSessionPolicy } from '../src/shared/runtimeSessionPolicy.ts';
import type { BoundProviderInteraction, BoundInteractionResponse, InteractionField } from '../src/shared/providerInteractions.ts';

// React's async act leaks MessagePorts in the esbuild ESM test bundle. Keep act
// synchronous and drain bounded event-loop turns, as the other renderer tests do.
async function settle() { for (let turn = 0; turn < 5; turn++) await nextTurn(); }

async function domTest(run: (document: Document, render: (element: React.ReactNode) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, FormData: dom.window.FormData })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  try { await run(dom.window.document, async element => { act(() => { root.render(element); }); await settle(); }); }
  finally {
    act(() => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test('native forms submit required empty values, empty enums and integers with fractional schema bounds', async () => {
  const fields: InteractionField[] = [
    { id: 'text', label: 'Text', type: 'string', required: true },
    { id: 'tags', label: 'Tags', type: 'strings', required: true, options: [{ id: 'a', label: 'A' }] },
    { id: 'empty', label: 'Empty enum', type: 'string', required: false, options: [{ id: '', label: 'Empty' }, { id: 'other', label: 'Other' }] },
    { id: 'count', label: 'Count', type: 'integer', required: true, min: 0.5, max: 4.3 },
  ];
  const interaction = { kind: 'mcp_form', status: 'pending', interactionId: 'i', sessionId: 's', workerGeneration: 'w', executionId: 'e',
    revision: 1, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    binding: { conversationId: 'c', sessionId: 's', label: 'Cat', participantId: 'cat', laneId: null, turnId: 'turn', runId: null },
    prompt: { kind: 'mcp_form', title: 'Fixture', fields } } as BoundProviderInteraction;
  await domTest(async (document, render) => {
    let response: BoundInteractionResponse | undefined;
    await render(<ProviderInteractionCard interaction={interaction} refresh={async () => {}} openUrl={async () => {}}
      respond={async (_i, body) => { response = body; }} />);
    (document.querySelector('[name="field:empty"]') as HTMLSelectElement).value = 'option:0';
    const count = document.querySelector('[name="field:count"]') as HTMLInputElement; count.value = '2';
    assert.equal(count.checkValidity(), true);
    act(() => { document.querySelector('form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    await settle();
    assert.deepEqual({ ...response!.answer.values }, { text: '', tags: [], empty: '', count: 2 });
  });
});

test('worker loss replaces a formerly verified policy without a model turn', async () => {
  const fetchBefore = globalThis.fetch, intervalBefore = globalThis.setInterval;
  const pollers: Array<() => void> = []; let reads = 0;
  globalThis.setInterval = ((callback: () => void) => { pollers.push(callback); return 0; }) as unknown as typeof setInterval;
  globalThis.fetch = async () => new Response(JSON.stringify(++reads === 1 ? {
    version: 1, sessionId: 's', workerGeneration: 'w', supported: true,
    observation: { policy: { source: 'explicit', status: 'verified' }, inventory: { state: 'observed', servers: [], dynamicTools: [] }, dependencies: [] },
  } : { version: 1, sessionId: 's', workerGeneration: null, supported: false, reason: 'worker_unavailable' }), { headers: { 'content-type': 'application/json' } });
  try {
    await domTest(async (document, render) => {
      await render(<ProviderCapabilities conversationId="c" sessionId="s" />);
      assert.match(document.body.textContent!, /verified/);
      act(() => { pollers[0]!(); }); await settle();
      assert.doesNotMatch(document.body.textContent!, /Policy: explicit|Tools: observed/);
      assert.match(document.body.textContent!, /worker unavailable/); assert.equal(reads, 2);
    });
  } finally { globalThis.fetch = fetchBefore; globalThis.setInterval = intervalBefore; }
});

test('workspace reconciliation preserves the requested provider policy and disables the legacy chip', async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ isRepo: false, repoRoot: null, branch: null }), { headers: { 'content-type': 'application/json' } });
  const policy: RuntimeSessionPolicy = { workspaceKind: 'worktree', workspaceAccess: 'read_write', permissionMode: 'skip',
    executionPolicy: { version: 1, mode: 'explicit', access: 'workspace-write', network: false, approval: 'on-request' } };
  const changes: RuntimeSessionPolicy[] = [];
  const onChange = (next: RuntimeSessionPolicy) => { changes.push(next); };
  function Draft() {
    const chips = useDraftSessionChips({ draftCwd: '/synthetic-workspace', busy: { kind: 'idle' },
      draftRuntimeSessionPolicy: policy, onDraftRuntimeSessionPolicyChange: onChange });
    return <>{chips.permissionChip}{chips.whereExtras}</>;
  }
  try {
    await domTest(async (document, render) => {
      await render(<Draft />);
      assert.ok(changes.length > 0);
      assert.ok(changes.every(next => next.workspaceKind === 'source'));
      assert.ok(changes.every(next => JSON.stringify(next.executionPolicy) === JSON.stringify(policy.executionPolicy)));
      const chip = document.querySelector('.composerPermissionChip') as HTMLButtonElement;
      assert.equal(chip.disabled, true);
      assert.match(chip.textContent!, /Requested: workspace-write.*on-request/);
      assert.match(chip.title, /live effective policy/);
    });
  } finally { globalThis.fetch = fetchBefore; }
});
