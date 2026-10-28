import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { DesktopControlConversation } from '../src/products/shared/renderer/components/desktop-control/DesktopControlConversation.tsx';
import { DesktopControlSection } from '../src/app/renderer/settings/DesktopControlSection.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';

// Keep act synchronous and drain bounded event-loop turns, as the other renderer tests do.
async function settle() { for (let turn = 0; turn < 5; turn++) await nextTurn(); }

async function domTest(run: (document: Document, render: (element: React.ReactNode) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  try { await run(dom.window.document, async (element) => { act(() => { root.render(element); }); await settle(); }); }
  finally {
    act(() => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}

const pending = { requestId: 'grant_1', query: '記事本', name: '記事本', path: 'C:\\Apps\\Notepad.exe', publisher: null,
  tier: 'full' as const, reason: 'Read the meeting notes', createdAt: '2026-10-29T00:00:00Z' };

function stubApi(initial: Record<string, unknown>) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  let state = initial;
  const fetchBefore = globalThis.fetch;
  const intervalBefore = globalThis.setInterval;
  globalThis.setInterval = (() => 0) as unknown as typeof setInterval;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method !== 'GET' && url.includes('/grant-requests/')) {
      state = { ...state, conversation: { ...(state.conversation as object), pendingRequests: [],
        grants: [{ name: '記事本', path: pending.path, publisher: null, tier: 'full', aumid: null }] } };
    }
    return new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, restore() { globalThis.fetch = fetchBefore; globalThis.setInterval = intervalBefore; } };
}

const conversation = (overrides: Record<string, unknown> = {}) => ({ available: true, reason: null, enabled: true,
  conversations: ['channel-1'], conversation: { channelId: 'channel-1', enabled: true, status: 'active_turn', reason: null,
    grants: [], pendingRequests: [pending], ...overrides } });

test('the conversation panel shows the owner grant card and answers it through the desktop control API', async () => {
  const api = stubApi(conversation());
  try {
    await domTest(async (document, render) => {
      await render(<I18nProvider locale="en"><DesktopControlConversation channelId="channel-1" /></I18nProvider>);
      assert.match(document.body.textContent!, /A Cat asks to see 記事本/);
      assert.match(document.body.textContent!, /Unsigned app/);
      assert.match(document.body.textContent!, /Reason: Read the meeting notes/);
      const allow = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Allow')!;
      act(() => { allow.click(); }); await settle();
      const decision = api.calls.find((call) => call.url.includes('/grant-requests/'))!;
      assert.equal(decision.method, 'POST');
      assert.match(decision.url, /\/api\/desktop-control\/grant-requests\/grant_1$/);
      assert.deepEqual(decision.body, { decision: 'allow', channelId: 'channel-1' });
      assert.match(document.body.textContent!, /Granted apps/);
      const stop = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Stop desktop control')!;
      act(() => { stop.click(); }); await settle();
      assert.deepEqual(api.calls.at(-1)!.body, { channelId: 'channel-1' });
      assert.match(api.calls.at(-1)!.url, /\/api\/desktop-control\/stop$/);
    });
  } finally { api.restore(); }
});

test('the conversation panel is localized and hides when desktop control is off or unavailable', async () => {
  const zh = stubApi(conversation({ status: 'not_injected', reason: 'policy_preapproves_tools', pendingRequests: [] }));
  try {
    await domTest(async (document, render) => {
      await render(<I18nProvider locale="zh-TW"><DesktopControlConversation channelId="channel-1" /></I18nProvider>);
      assert.match(document.body.textContent!, /在這個對話允許桌面控制/);
      assert.match(document.body.textContent!, /請選擇會詢問的權限模式/);
    });
  } finally { zh.restore(); }
  for (const state of [{ ...conversation(), enabled: false }, { ...conversation(), available: false, reason: 'not_windows' }]) {
    const api = stubApi(state);
    try {
      await domTest(async (document, render) => {
        await render(<I18nProvider locale="en"><DesktopControlConversation channelId="channel-1" /></I18nProvider>);
        assert.equal(document.querySelector('.desktop-control'), null);
      });
    } finally { api.restore(); }
  }
});

test('the settings section saves the switch and hides off Windows', async () => {
  const api = stubApi({ available: true, reason: null, enabled: false, conversations: [] });
  try {
    await domTest(async (document, render) => {
      await render(<I18nProvider locale="en"><DesktopControlSection showToast={() => {}} /></I18nProvider>);
      const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      assert.equal(box.checked, false);
      assert.equal(box.disabled, false);
      act(() => { box.click(); }); await settle();
      const put = api.calls.find((call) => call.method === 'PUT')!;
      assert.match(put.url, /\/api\/desktop-control\/settings$/);
      assert.deepEqual(put.body, { enabled: true });
    });
  } finally { api.restore(); }
  const off = stubApi({ available: false, reason: 'not_windows', enabled: false, conversations: [] });
  try {
    await domTest(async (document, render) => {
      await render(<I18nProvider locale="en"><DesktopControlSection showToast={() => {}} /></I18nProvider>);
      assert.equal(document.querySelector('input[type="checkbox"]'), null);
    });
  } finally { off.restore(); }
});
