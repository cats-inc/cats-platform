import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import { CodeCatlasHelp, type CodeCatlasHelpProps } from '../src/products/code/renderer/components/CodeCatlasHelp.tsx';

afterEach(() => { cleanup(); resetTestDom(); });

function props(): CodeCatlasHelpProps {
  return {
    guideCat: {
      id: 'catlas', name: 'Catlas', status: 'active',
      executionTarget: { provider: 'claude', instance: null, model: 'help-model' },
      modelSelection: null, createdAt: '', updatedAt: '',
    },
    draft: {
      cwd: null, target: null,
      policy: { workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default' },
    },
  };
}

function reply(advice = 'Choose the folder for your existing project.') {
  return Response.json({ source: 'model', advice, reason: null, knowledgeIds: ['code.workspace'], receipt: null });
}

test('Code help is optional and opens without making a model request', (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => reply());
  const view = render(<CodeCatlasHelp {...props()} />);
  fireEvent.click(view.getByRole('button', { name: 'Help me get started' }));
  assert.equal(fetch.mock.callCount(), 0);
  assert.ok(view.getByRole('textbox', { name: 'What would you like help with?' }));
  view.rerender(<CodeCatlasHelp {...props()} guideCat={null} />);
  assert.equal(view.container.textContent, '');
  view.rerender(<CodeCatlasHelp {...props()} disabled />);
  assert.equal(view.container.textContent, '');
});

test('explicit help sends bounded draft context and a separately entered question', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.question, 'Can I inspect this project without editing?');
    assert.equal(body.draft.policy.workspaceAccess, 'read_only');
    assert.equal(body.locale, 'en');
    return reply('<script>not executable</script> Use read-only access.');
  });
  const view = render(<CodeCatlasHelp {...props()} />);
  fireEvent.click(view.getByRole('button', { name: 'Help me get started' }));
  fireEvent.change(view.getByRole('textbox'), {
    target: { value: 'Can I inspect this project without editing?' },
  });
  fireEvent.click(view.getByRole('button', { name: 'Ask Catlas' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent ?? '', /Use read-only/u));
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(view.container.querySelector('script'), null);
});

test('context changes cancel in-flight advice and discard a late response', async (t) => {
  let release!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise<Response>((resolve) => { release = resolve; });
  });
  const initial = props();
  const view = render(<CodeCatlasHelp {...initial} />);
  fireEvent.click(view.getByRole('button', { name: 'Help me get started' }));
  fireEvent.click(view.getByRole('button', { name: 'Ask Catlas' }));
  assert.equal((view.getByRole('button', { name: 'Thinking…' }) as HTMLButtonElement).disabled, true);
  view.rerender(<CodeCatlasHelp {...initial} draft={{
    ...initial.draft, target: { provider: 'codex', instance: null, model: 'new-model' },
  }} />);
  assert.equal(signal?.aborted, true);
  release(reply('Stale advice for the previous target'));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Ask Catlas' })));
  assert.doesNotMatch(view.container.textContent ?? '', /Stale advice/u);
});

test('cancel and unmount abort only the help request', async (t) => {
  const signals: AbortSignal[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    signals.push(init?.signal as AbortSignal);
    return new Promise<Response>(() => {});
  });
  const view = render(<CodeCatlasHelp {...props()} />);
  fireEvent.click(view.getByRole('button', { name: 'Help me get started' }));
  fireEvent.click(view.getByRole('button', { name: 'Ask Catlas' }));
  fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
  assert.equal(signals[0].aborted, true);
  fireEvent.click(view.getByRole('button', { name: 'Ask Catlas' }));
  view.unmount();
  assert.equal(signals[1].aborted, true);
});

test('failed model requests keep localized basic guidance available', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  const view = render(<I18nProvider locale="zh-TW"><CodeCatlasHelp {...props()} /></I18nProvider>);
  fireEvent.click(view.getByRole('button', { name: '協助我開始' }));
  fireEvent.click(view.getByRole('button', { name: '詢問 Catlas' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent ?? '', /基本說明/u));
  assert.match(view.getByRole('status').textContent ?? '', /唯讀/u);
  assert.ok(view.getByRole('button', { name: '詢問 Catlas' }));
});
