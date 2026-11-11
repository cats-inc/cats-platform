import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { ConversationProposalCard } from '../src/products/shared/renderer/components/conversation-view/ConversationProposalCard.tsx';
import type { ConversationProposalCardView } from '../src/products/shared/renderer/api/proposals.ts';

const CARD: ConversationProposalCardView = {
  id: 'proposal-1',
  kind: 'work.project.create.decision',
  status: 'open',
  outOfDate: false,
  createdAt: '2026-11-12T09:00:00.000Z',
  expiresAt: '2026-11-13T09:00:00.000Z',
  decidedAt: null,
  refusal: null,
  proposer: { participantId: 'participant-boss', name: 'Boss Cat' },
  view: {
    title: 'New Project',
    fields: [{ name: 'title', value: '«Cats Mobile»' }, { name: 'folder', value: 'C:/repo/cats-mobile' }],
    records: [{ kind: 'conversation', id: null, title: 'This conversation, as its primary conversation' }],
    folderWarning: { folder: 'C:/repo/cats-mobile', otherConversations: 0, workItems: 2 },
  },
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function settle() { for (let turn = 0; turn < 5; turn += 1) await nextTurn(); }

function mount(node: () => React.ReactElement, respond: (url: string, init?: RequestInit) => Response) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string, init?: RequestInit) => respond(url, init),
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  act(() => { root.render(node()); });
  return {
    document: dom.window.document,
    click(element: Element | null | undefined) {
      assert.ok(element, 'element to click');
      act(() => { (element as HTMLElement).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    },
    restore() {
      act(() => root.unmount());
      dom.window.close();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('the owner card shows what is written, the folder warning, and sends the owner answer', async () => {
  const decisions: unknown[] = [];
  const page = mount(() => <ConversationProposalCard channelId="c1" proposalId="proposal-1" status="open" />, (url, init) => {
    if (init?.method === 'POST') {
      assert.equal(url, '/api/channels/c1/proposals/proposal-1/decision');
      decisions.push(JSON.parse(String(init.body)));
      return json(200, { outcome: { status: 'confirmed', refusal: null } });
    }
    assert.equal(url, '/api/channels/c1/proposals/proposal-1');
    return json(200, { proposal: CARD });
  });
  try {
    await settle();
    const text = page.document.body.textContent ?? '';
    assert.match(text, /New Project/u);
    assert.match(text, /Boss Cat/u);
    assert.match(text, /«Cats Mobile»/u);
    const warning = page.document.querySelector('[role="note"]');
    assert.equal(warning?.textContent,
      'Supervised runs start in C:/repo/cats-mobile without asking. 0 other conversations and 2 Work Items use it.');
    page.click(page.document.querySelector('.messageChoiceActionButtonPrimary'));
    await settle();
    assert.deepEqual(decisions, [{ decision: 'confirm' }]);
    assert.match(page.document.body.textContent ?? '', /Confirmed\. The change was made\./u);
  } finally {
    page.restore();
  }
});

test('a card that is gone, or already closed, offers no answer', async () => {
  const gone = mount(() => <ConversationProposalCard channelId="c1" proposalId="missing" status="open" />, () => json(404, {}));
  try {
    await settle();
    assert.equal(gone.document.querySelector('.messageChoiceActionButtonPrimary'), null);
  } finally {
    gone.restore();
  }
  let fetched = 0;
  const closed = mount(() => <ConversationProposalCard channelId="c1" proposalId="proposal-1" status="declined" />, () => {
    fetched += 1;
    return json(200, { proposal: CARD });
  });
  try {
    await settle();
    assert.equal(fetched, 0, 'a closed card reads nothing');
    assert.equal(closed.document.querySelector('.messageChoiceActionButtonPrimary'), null);
  } finally {
    closed.restore();
  }
});
