import { resetTestDom, testDomWindow } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import { DiagnosticAttachmentAction } from '../src/products/shared/renderer/components/DiagnosticAttachmentAction.tsx';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';

afterEach(() => { cleanup(); resetTestDom(); });
// jsdom has no native top layer. Real dialog focus/layout is covered by the isolated browser smoke.
testDomWindow.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
const payload = { chat: { channels: [{ id: 'current', title: 'Debugger' }, { id: 'incident', title: 'Broken provider' }] } } as unknown as AppShellPayload;
const filename = 'cats-diagnostics-20260927000000.txt';

for (const locale of ['en', 'zh-TW'] as const) test(`${locale}: choose another conversation, preview, attach without sending`, async t => {
  const calls: string[] = [];
  const files: File[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    calls.push(String(url)); return Response.json({ filename, text: 'Incident Runtime 0.3.1\nsession incident-session\nProvider failed' });
  });
  const labels = locale === 'en'
    ? ['Attach conversation diagnostics', 'Conversation to inspect', 'Collect diagnostics', 'Diagnostic report preview', 'Attach report']
    : ['附加對話診斷', '要檢查的對話', '收集診斷', '診斷報告預覽', '附加報告'];
  const view = render(<I18nProvider locale={locale}><DiagnosticAttachmentAction payload={payload}
    currentChannelId="current" disabled={false} onAttach={file => files.push(file)} /></I18nProvider>);
  fireEvent.click(view.getByRole('button', { name: labels[0] }));
  fireEvent.change(view.getByRole('combobox', { name: labels[1] }), { target: { value: 'incident' } });
  fireEvent.click(view.getByRole('button', { name: labels[2] }));
  await waitFor(() => assert.ok(view.getByRole('textbox', { name: labels[3] })));
  assert.deepEqual(calls, ['/api/channels/incident/diagnostics']);
  assert.equal(files.length, 0);
  assert.match((view.getByRole('textbox', { name: labels[3] }) as HTMLTextAreaElement).value, /incident-session/u);
  fireEvent.click(view.getByRole('button', { name: labels[4] }));
  assert.equal(files[0]?.name, filename); assert.equal(files[0]?.type, 'text/plain');
  assert.match(await files[0]!.text(), /Provider failed/u);
  assert.equal(view.queryByRole('dialog'), null);
  assert.equal(calls.length, 1);
});

test('failed collection remains retryable; changing selection discards the old preview', async t => {
  let fail = true;
  t.mock.method(globalThis, 'fetch', async () => fail ? Response.json({}, { status: 403 }) : Response.json({ filename, text: 'Selected evidence' }));
  const view = render(<DiagnosticAttachmentAction payload={payload} currentChannelId="current" disabled={false} onAttach={() => assert.fail('must not attach')} />);
  fireEvent.click(view.getByRole('button', { name: 'Attach conversation diagnostics' }));
  fireEvent.click(view.getByRole('button', { name: 'Collect diagnostics' }));
  await waitFor(() => assert.ok(view.getByRole('alert')));
  fail = false;
  fireEvent.click(view.getByRole('button', { name: 'Collect diagnostics' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Attach report' })));
  fireEvent.change(view.getByRole('combobox'), { target: { value: 'incident' } });
  assert.equal(view.queryByRole('button', { name: 'Attach report' }), null);
});

test('closing or navigating while collecting aborts the request and cannot attach to the next conversation', async t => {
  let signal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  const view = render(<DiagnosticAttachmentAction payload={payload} currentChannelId="current" disabled={false} onAttach={() => assert.fail('must not attach')} />);
  fireEvent.click(view.getByRole('button', { name: 'Attach conversation diagnostics' }));
  fireEvent.click(view.getByRole('button', { name: 'Collect diagnostics' }));
  view.unmount();
  assert.equal(signal?.aborted, true);
});
