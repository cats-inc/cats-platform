import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

import { createTranslator } from '../src/shared/i18n/index.ts';
import {
  buildWorkProjectConfirmation,
  ConversationWorkProjectChip,
  describeWorkProjectRefusal,
} from '../src/products/shared/renderer/components/ConversationWorkProjectChip.tsx';
import type { ConversationWorkProjectView } from '../src/products/shared/renderer/api/workProject.ts';

const en = createTranslator('en');
const zh = createTranslator('zh-TW');

const VIEW: ConversationWorkProjectView = {
  channelId: 'w1',
  projectId: null,
  project: null,
  revision: 3,
  canChange: true,
  refusal: null,
  projects: [
    { id: 'project-site', title: 'Site', status: 'active', folder: 'C:/work/site', otherConversations: 2, workItems: 5 },
    { id: 'project-bare', title: 'Bare', status: 'active', folder: null, otherConversations: 0, workItems: 0 },
  ],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function flush() {
  for (let turn = 0; turn < 5; turn += 1) await nextTurn();
}

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

test('the confirmation names the folder its supervised runs would start in, or the sandbox (FR-16, FR-26)', () => {
  const site = buildWorkProjectConfirmation(VIEW, VIEW.projects[0]!, en);
  assert.equal(site.title, 'Put this conversation into Site?');
  assert.deepEqual(site.lines, [
    "Supervised runs of this conversation's task will start in C:/work/site without asking.",
    '2 other conversations and 5 work items are in this project.',
    "The conversation's own sessions keep its folder.",
  ]);
  assert.match(buildWorkProjectConfirmation(VIEW, VIEW.projects[1]!, en).lines[0]!, /sandbox/u);
  const leave = buildWorkProjectConfirmation({ project: { id: 'project-site', title: 'Site', status: 'active', folder: null } }, null, zh);
  assert.equal(leave.title, '要把此對話移出「Site」嗎？');
  assert.equal(describeWorkProjectRefusal('supervised_run_active', en).startsWith('A supervised run'), true);
  assert.equal(describeWorkProjectRefusal('something_new', en), "Couldn't change the project. It stays as it was; try again.");
});

test('the owner picks a Project, confirms the folder, and the change is sent with the revision shown', async () => {
  const posts: unknown[] = [];
  const reports: string[] = [];
  let view = VIEW;
  const page = mount(() => <ConversationWorkProjectChip channel={{ id: 'w1', workProjectId: null }} report={(m) => reports.push(m)} />,
    (url, init) => {
      assert.equal(url, '/api/channels/w1/work-project');
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        view = { ...VIEW, projectId: 'project-site', revision: 4,
          project: { id: 'project-site', title: 'Site', status: 'active', folder: 'C:/work/site' } };
        return json(200, { projectId: 'project-site', revision: 4 });
      }
      return json(200, view);
    });
  try {
    await flush();
    const chip = page.document.querySelector('button.conversationWorkProjectChip')!;
    assert.equal(chip.textContent, 'No project');
    page.click(chip);
    const items = [...page.document.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(items.map((item) => item.textContent), ['SiteC:/work/site', 'BareNo folder'], 'no "No project" while it has none');
    page.click(items[0]);
    const dialog = page.document.querySelector('[role="dialog"]')!;
    assert.match(dialog.textContent ?? '', /start in C:\/work\/site without asking/u);
    assert.equal(page.document.activeElement?.textContent, 'Cancel', 'Cancel is focused first');
    page.click(dialog.querySelector('.confirmPrimaryButton'));
    await flush();
    assert.deepEqual(posts, [{ projectId: 'project-site', revision: 3 }]);
    assert.deepEqual(reports, ['The conversation is now in Site.']);
    assert.equal(page.document.querySelector('button.conversationWorkProjectChip')!.textContent, 'Site');
  } finally {
    page.restore();
  }
});

test('a refused change is reported, and a conversation that cannot change shows why', async () => {
  const reports: string[] = [];
  const refused = mount(() => <ConversationWorkProjectChip channel={{ id: 'w1' }} report={(m) => reports.push(m)} />,
    (_url, init) => init?.method === 'POST'
      ? json(409, { error: { code: 'supervised_run_active', message: 'busy' } })
      : json(200, VIEW));
  try {
    await flush();
    refused.click(refused.document.querySelector('button.conversationWorkProjectChip'));
    refused.click(refused.document.querySelectorAll('[role="menuitem"]')[1]);
    refused.click(refused.document.querySelector('.confirmPrimaryButton'));
    await flush();
    assert.equal(reports.length, 1);
    assert.match(reports[0]!, /^A supervised run of this conversation/u);
  } finally {
    refused.restore();
  }
  const fixed = mount(() => <ConversationWorkProjectChip channel={{ id: 'w2' }} report={() => {}} />,
    () => json(200, { ...VIEW, canChange: false, refusal: 'parallel_member' }));
  try {
    await flush();
    const chip = fixed.document.querySelector('button.conversationWorkProjectChip') as HTMLButtonElement;
    assert.equal(chip.disabled, true);
    assert.match(chip.title, /parallel group/u);
  } finally {
    fixed.restore();
  }
});
