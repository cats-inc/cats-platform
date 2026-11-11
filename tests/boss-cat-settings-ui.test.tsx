import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import { resolveSettingsSectionConfig } from '../src/app/renderer/settings/PlatformSettingsRoutes.tsx';
import { SettingsBossCat } from '../src/app/renderer/settings/SettingsBossCat.tsx';
import { BossCatJoinRequestCard } from '../src/products/shared/renderer/components/conversation-view/BossCatJoinRequestCard.tsx';
import { TranscriptMessageItem } from '../src/products/shared/renderer/components/conversation-view/TranscriptMessageItem.tsx';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';

type Responder = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** One fetch mock per test; `respond` swaps the responder without stacking mocks. */
function setup(t: TestContext, initial: Responder) {
  resetTestDom();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let responder = initial;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return responder(url, init);
  }) as typeof fetch;
  t.after(() => { cleanup(); resetTestDom(); globalThis.fetch = originalFetch; });
  return Object.assign(calls, { respond: (next: Responder) => { responder = next; } });
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
  for (const expected of ['/repo', 'Kiki, Mochi', 'acts without asking', 'shell', 'claude · opus', 'companion memory', '8']) {
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

test('SPEC-139 FR-10: a settled card is one line from its own record, read without the live details', async (t) => {
  const calls = setup(t, () => new Response('{}', { status: 500 }));
  const cases: Array<[string, string | null, RegExp]> = [
    ['approved', null, /The Boss Cat joined/u],
    ['declined', null, /Declined/u],
    ['expired', null, /Expired/u],
    ['refused', 'card_stale', /changed since the request/u],
    ['refused', 'policy_changed', /join setting changed/u],
  ];
  for (const [status, refusal, expected] of cases) {
    const view = render(<BossCatJoinRequestCard laneId="lane" requestId="request-1" status={status} refusal={refusal} />);
    assert.match(view.container.textContent ?? '', expected);
    assert.equal(view.queryByRole('button'), null);
    view.unmount();
  }
  assert.equal(calls.length, 0, 'a settled card fetches nothing');
});

test('SPEC-139 FR-10: a pending card that expired or is gone says so', async (t) => {
  const calls = setup(t, () => new Response(JSON.stringify({ request: details({ status: 'expired' }) }), { status: 200 }));
  let view = render(<BossCatJoinRequestCard laneId="lane" requestId="request-1" status="pending" />);
  await waitFor(() => assert.match(view.container.textContent ?? '', /Expired/u));
  view.unmount();
  calls.respond(() => new Response('{}', { status: 404 }));
  view = render(<BossCatJoinRequestCard laneId="lane" requestId="request-1" status="pending" />);
  await waitFor(() => assert.match(view.container.textContent ?? '', /no longer available/u));
  view.unmount();
});

test('SPEC-139 FR-10: the transcript shows the card under its notice, and an ordinary notice without one', async (t) => {
  setup(t, () => new Response(JSON.stringify({ request: details() }), { status: 200 }));
  const message = (id: string, metadata: Record<string, unknown>) => ({
    id, channelId: 'lane', senderKind: 'system' as const, senderName: 'Chat', body: `${id} body`, mentions: [],
    metadata, usage: null, createdAt: '2026-11-11T00:00:00.000Z',
  });
  const props = (item: ReturnType<typeof message>) => ({
    message: item, stackClassName: 'stack', cats: [], selectedChannelId: 'lane', disabledMentionNames: [],
    compareBusy: false, choiceBusy: false, isCompareGroup: false, relayMenuOpen: false,
    userTurnStatus: 'idle' as const, retryBusy: false, onChoiceSubmit: () => {}, onCopyMessage: async () => {},
    onToggleRelayMenu: () => {}, onCloseRelayMenu: () => {}, resolveMessageParticipant: () => null,
    resolveParticipantCatRecord: () => null, buildParticipantAvatarClassName: () => '',
    buildParticipantAvatarStyle: () => undefined, resolveParticipantAvatarUrl: () => null,
    resolveParticipantDisplayName: () => '',
  });
  // The props are the transcript's own; message shapes are the minimum the item reads.
  type TranscriptProps = React.ComponentProps<typeof TranscriptMessageItem>;
  const card = render(<TranscriptMessageItem {...(props(message('card', { event: 'boss_cat_join_request',
    bossCatJoinRequest: { id: 'request-1', status: 'pending' } })) as unknown as TranscriptProps)} />);
  await waitFor(() => assert.ok(card.queryByRole('button', { name: /Allow the join/u })));
  assert.match(card.container.textContent ?? '', /card body/u);
  card.unmount();
  const notice = render(<TranscriptMessageItem {...(props(message('notice', { event: 'boss_cat_group_created' })) as unknown as TranscriptProps)} />);
  assert.match(notice.container.textContent ?? '', /notice body/u);
  assert.equal(notice.queryByRole('button', { name: /Allow the join/u }), null);
  notice.unmount();
});
