import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import { resolveSettingsSectionConfig } from '../src/app/renderer/settings/PlatformSettingsRoutes.tsx';
import { SettingsBossCat } from '../src/app/renderer/settings/SettingsBossCat.tsx';
import { BossCatJoinRequestCard } from '../src/products/shared/renderer/components/conversation-view/BossCatJoinRequestCard.tsx';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';

function setup(t: TestContext, respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  resetTestDom();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return respond(url, init);
  }) as typeof fetch;
  t.after(() => { cleanup(); resetTestDom(); globalThis.fetch = originalFetch; });
  return calls;
}

/** SettingsBossCat reads only `chat.bossCatJoinPolicy`; the rest of the payload is irrelevant here. */
const payloadWith = (policy?: 'never' | 'ask' | 'allow') =>
  ({ chat: { ...(policy ? { bossCatJoinPolicy: policy } : {}) } }) as unknown as AppShellPayload;

test('SPEC-139 FR-8: /settings/boss-cat is its own Settings section', () => {
  const config = resolveSettingsSectionConfig('/settings/boss-cat', (key) => key);
  assert.deepEqual(config, { section: 'boss-cat', title: 'settingsRouteTitleBossCat' });
});

test('SPEC-139 FR-8: the page shows 「每次問我」 when unset and saves the owner\'s choice', async (t) => {
  const calls = setup(t, () => new Response(JSON.stringify({ preferences: {} }), { status: 200 }));
  const updates: AppShellPayload[] = [];
  const view = render(<SettingsBossCat payload={payloadWith()} onPayloadUpdate={(next) => updates.push(next)} />);
  const select = view.getByRole('combobox') as HTMLSelectElement;
  assert.equal(select.value, 'ask');
  assert.deepEqual([...select.options].map((option) => option.value), ['never', 'ask', 'allow']);
  fireEvent.change(select, { target: { value: 'allow' } });
  await waitFor(() => assert.ok(calls.some((call) => call.url === '/api/preferences')));
  const patch = calls.find((call) => call.url === '/api/preferences')!;
  assert.equal(patch.init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(patch.init?.body)), { bossCatJoinPolicy: 'allow' });
  assert.equal(updates[0]?.chat.bossCatJoinPolicy, 'allow', 'optimistic');
  view.unmount();
});

function details(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1', status: 'pending', requestedVia: 'desktop',
    createdAt: '2026-11-11T00:00:00.000Z', expiresAt: '2026-11-12T00:00:00.000Z',
    decidedAt: null, refusal: null,
    conversation: { id: 'ops', title: 'Ops', surface: 'code', participantNames: ['Kiki', 'Mochi'], archived: false },
    grants: { repoPath: '/repo', workspaceAccess: 'read_write', permissionMode: 'skip', codeTools: true },
    bossCat: { id: 'boss', name: 'Boss', provider: 'claude', model: 'opus', mcpProfile: null, skillProfile: null,
      companionMemory: true },
    history: { messagesBeforeJoin: 8 },
    ...overrides,
  };
}

test('SPEC-139 FR-10: the card shows what joining grants and the owner answers it', async (t) => {
  let current = details();
  const calls = setup(t, (url, init) => {
    if (init?.method === 'POST') {
      current = details({ status: 'approved', decidedAt: '2026-11-11T01:00:00.000Z' });
      return new Response(JSON.stringify({ outcome: { status: 'approved' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ request: current }), { status: 200 });
  });
  const view = render(<BossCatJoinRequestCard laneId="lane" requestId="request-1" status="pending" />);
  await waitFor(() => assert.ok(view.queryByText(/Ops/u)));
  const text = view.container.textContent ?? '';
  for (const expected of ['/repo', 'Kiki, Mochi', 'skip', 'shell', 'claude · opus', 'companion memory', '8']) {
    assert.ok(text.includes(expected), expected);
  }
  fireEvent.click(view.getByRole('button', { name: /Allow the join/u }));
  await waitFor(() => assert.ok(view.queryByText(/The Boss Cat joined/u)));
  const decision = calls.find((call) => call.init?.method === 'POST')!;
  assert.equal(decision.url, '/api/channels/lane/boss-cat/join-requests/request-1/decision');
  assert.deepEqual(JSON.parse(String(decision.init?.body)), { decision: 'approve' });
  assert.equal(view.queryByRole('button', { name: /Allow the join/u }), null, 'answered once');
  view.unmount();
});

test('SPEC-139 FR-10: every settled state reads differently, and a missing card says so', async (t) => {
  const cases: Array<[Record<string, unknown> | null, RegExp]> = [
    [{ status: 'declined' }, /Declined/u],
    [{ status: 'expired' }, /Expired/u],
    [{ status: 'refused', refusal: 'card_stale' }, /changed since the request/u],
    [{ status: 'refused', refusal: 'policy_changed' }, /join setting changed/u],
    [null, /no longer available/u],
  ];
  for (const [overrides, expected] of cases) {
    setup(t, () => overrides
      ? new Response(JSON.stringify({ request: details(overrides) }), { status: 200 })
      : new Response('{}', { status: 404 }));
    const view = render(<BossCatJoinRequestCard laneId="lane" requestId="request-1" status="x" />);
    await waitFor(() => assert.match(view.container.textContent ?? '', expected));
    assert.equal(view.queryByRole('button', { name: /Allow the join/u }), null);
    view.unmount();
    cleanup();
  }
});
