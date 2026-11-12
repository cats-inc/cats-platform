import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { setImmediate as nextTask } from 'node:timers/promises';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { TranscriptSearch } from '../src/products/shared/renderer/components/conversation-view/TranscriptSearch.tsx';
import { usePagedTranscript } from '../src/products/shared/renderer/hooks/usePagedTranscript.ts';
import { clearConversationViewMemory } from '../src/products/shared/renderer/conversationViewMemory.ts';
import type { TranscriptChannelView, MessagePage } from '../src/products/chat/shared/transcript.ts';
import type { ChatMessage } from '../src/products/chat/api/contracts.ts';
import type { TranscriptHistory } from '../src/products/shared/renderer/transcriptHistory.ts';

const msg = (id: number | string): ChatMessage => ({ id: String(id), channelId: 'channel', senderKind: 'user', senderName: 'Owner',
  body: String(id), createdAt: '2026-11-12T00:00:00Z', metadata: {}, mentions: [], usage: null });
function setup(t: { after(callback: () => void): void }) {
  clearConversationViewMemory();
  const prototype = window.HTMLDialogElement.prototype;
  const show = prototype.showModal; const close = prototype.close;
  prototype.showModal = function () { this.setAttribute('open', ''); };
  prototype.close = function () { this.removeAttribute('open'); };
  t.after(() => { cleanup(); clearConversationViewMemory(); prototype.showModal = show; prototype.close = close; resetTestDom(); });
}

test('search dialog supports scoped/global queries, safe result text and conversation selection', async t => {
  setup(t); const requests: URL[] = []; let selected = ''; let closed = false;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    requests.push(new URL(String(input), 'http://fixture'));
    return new Response(JSON.stringify({ hits: [{ channelId: 'other', message: { ...msg('hit'), body: '<script>plain text</script>',
      metadata: { hidden: 'private-metadata' } } }] }));
  });
  const view = render(<I18nProvider locale="en"><TranscriptSearch channelId="channel" titles={new Map([['other', 'Other conversation']])}
    onClose={() => { closed = true; }} onSelect={id => { selected = id; }} /></I18nProvider>);
  fireEvent.change(view.getByRole('searchbox'), { target: { value: '公園 & hello' } });
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.ok(view.getByText('<script>plain text</script>')));
  assert.equal(requests[0].searchParams.get('channelId'), 'channel'); assert.equal(requests[0].searchParams.get('q'), '公園 & hello');
  assert.ok(view.getByText('<script>plain text</script>')); assert.equal(view.container.querySelector('script'), null);
  assert.ok(!view.container.textContent?.includes('private-metadata'));
  fireEvent.change(view.getByRole('combobox'), { target: { value: 'all' } });
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.equal(requests.length, 2));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Open conversation' })));
  assert.equal(requests[1].searchParams.has('channelId'), false);
  fireEvent.click(view.getByRole('button', { name: 'Open conversation' }));
  assert.equal(selected, 'other'); assert.equal(closed, true);
});

test('editing or closing search aborts old requests and ignores late responses', async t => {
  setup(t); let resolve!: (response: Response) => void; const signals: AbortSignal[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    signals.push(init!.signal as AbortSignal);
    if (signals.length === 1) return new Promise<Response>(done => { resolve = done; });
    return new Response(JSON.stringify({ hits: [{ channelId: 'channel', message: { ...msg('new'), body: 'New result' } }] }));
  });
  const view = render(<I18nProvider locale="en"><TranscriptSearch channelId="channel" titles={new Map()}
    onClose={() => {}} /></I18nProvider>);
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'old' } });
  fireEvent.submit(view.container.querySelector('form')!);
  fireEvent.change(view.getByRole('searchbox'), { target: { value: 'new' } });
  assert.equal(signals[0].aborted, true);
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.ok(view.getByText('New result')));
  resolve(new Response(JSON.stringify({ hits: [{ channelId: 'channel', message: { ...msg('old'), body: 'Old result' } }] })));
  await nextTask();
  assert.ok(view.getByText('New result')); assert.equal(view.queryByText('Old result'), null);
});

test('optimistic rollback remains a reversible overlay across expanded history and remount', async t => {
  setup(t); let controller: TranscriptHistory | undefined;
  const base = { id: 'channel', messages: [msg(2), msg(3)], messagePage: {
    total: 4, nextCursor: '2', orderRevision: '0', historyRevision: 'a', windowCount: 2,
  } } as TranscriptChannelView;
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ messages: [msg(0), msg(1)], total: 4,
    nextCursor: null, orderRevision: '0', historyRevision: 'a' } satisfies MessagePage)));
  function View({ channel }: { channel: TranscriptChannelView }) {
    const transcript = usePagedTranscript(channel, 'overlay'); controller = transcript.history;
    return <output>{transcript.channel.messages.map(message => message.id).join(',')}</output>;
  }
  const view = render(<View channel={base} />);
  let loading!: Promise<void>;
  act(() => { loading = controller!.loadOlder(); }); await loading;
  await waitFor(() => assert.equal(view.getByRole('status').textContent, '0,1,2,3'));
  assert.equal(view.getByRole('status').textContent, '0,1,2,3');
  const optimistic = { ...msg('pending'), metadata: { optimistic: true } };
  view.rerender(<View channel={{ ...base, messages: [...base.messages, optimistic] }} />);
  assert.equal(view.getByRole('status').textContent, '0,1,2,3,pending');
  view.rerender(<View channel={base} />);
  assert.equal(view.getByRole('status').textContent, '0,1,2,3');
  assert.ok(controller!.getSnapshot().messages.every(message => message.id !== 'pending'));
  view.unmount(); const returned = render(<View channel={base} />);
  assert.equal(returned.getByRole('status').textContent, '0,1,2,3');
});
