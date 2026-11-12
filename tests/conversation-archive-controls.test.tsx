import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setImmediate as nextTask } from 'node:timers/promises';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type { TranscriptChannelView } from '../src/products/shared/transcript.ts';
import type { AppShellPayload } from '../src/products/shared/api/workspaceContracts.ts';
import type { AppLoadState } from '../src/products/shared/renderer/workspaceAppViewState.ts';
import { useConversationArchive } from '../src/products/shared/renderer/hooks/useConversationArchive.ts';
import { useArchiveChannelRefresh } from '../src/products/shared/renderer/hooks/useArchiveChannelRefresh.ts';
import { ConversationArchiveControls, ConversationArchiveFeedback } from '../src/products/shared/renderer/components/conversation-view/ConversationArchiveControls.tsx';
import { ConversationView, type ConversationViewProps } from '../src/products/shared/renderer/components/conversation-view/ConversationView.tsx';
import { CodeConversationView } from '../src/products/code/renderer/components/CodeConversationView.tsx';
import { clearConversationViewMemory } from '../src/products/shared/renderer/conversationViewMemory.ts';
import { createConversationNavigationFixture } from './fixtures/conversationNavigation.ts';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';
import { ApprovalQueuePanel } from '../src/products/shared/renderer/components/ApprovalQueuePanel.tsx';
import { ConversationWorkProjectChip } from '../src/products/shared/renderer/components/ConversationWorkProjectChip.tsx';
import type { ConversationWorkProjectView } from '../src/products/shared/renderer/api/workProject.ts';

function setup(t: { after(callback: () => void): void }) {
  clearConversationViewMemory();
  const raf = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame;
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  HTMLElement.prototype.scrollIntoView = () => {}; // jsdom has no native scrolling implementation.
  t.after(() => {
    cleanup(); clearConversationViewMemory(); resetTestDom(); globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = cancel;
    if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scroll); else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });
}
async function fixture() {
  const value = await createConversationNavigationFixture(path.join(os.tmpdir(), 'cats-archive-ui-memory-only'));
  const payload = value.payload(); assert.ok(payload.chat.selectedChannel?.roomRouting);
  const channel = { ...payload.chat.selectedChannel, roomRouting: payload.chat.selectedChannel.roomRouting,
    messagePage: { total: 1, nextCursor: null, orderRevision: '1', historyRevision: 'a', windowCount: 1, archiveActions: true } };
  return { payload: { ...payload, chat: { ...payload.chat, selectedChannel: channel } }, channel };
}
function cold(channel: TranscriptChannelView, order = '2'): TranscriptChannelView {
  return { ...channel, status: 'archived', messagePage: { ...channel.messagePage!, orderRevision: order,
    archive: { id: `archive-${order}`, createdAt: '2026-11-13T00:00:00Z' } } };
}
function hot(channel: TranscriptChannelView, order = '3'): TranscriptChannelView {
  return { ...channel, status: 'configured', messagePage: { ...channel.messagePage!, orderRevision: order, archive: undefined } };
}
function result(channel: TranscriptChannelView, archived: boolean) {
  return new Response(JSON.stringify({ channelId: channel.id, archived, messageCount: 1, archiveId: archived ? 'archive' : null, unchanged: false }));
}
function Harness({ payload, remote }: { payload: AppShellPayload; remote?: TranscriptChannelView }) {
  const [state, setState] = useState<AppLoadState>({ status: 'ready', payload });
  assert.equal(state.status, 'ready'); if (state.status !== 'ready') return null;
  const channel = state.payload.chat.selectedChannel as TranscriptChannelView;
  const refresh = useArchiveChannelRefresh({ channelId: channel.id, scope: payload.scopeId, setState, refreshAppShell() {} });
  const control = useConversationArchive(channel, refresh.refreshArchivedConversation, payload.scopeId);
  return <><ConversationArchiveControls control={control} /><ConversationArchiveFeedback control={control} />
    <button disabled={control.readOnly}>Send message</button><output data-testid="order">{channel.messagePage?.orderRevision}</output>
    {remote ? <button onClick={() => { refresh.observeArchiveChannel(); setState({ status: 'ready', payload: {
      ...state.payload, chat: { ...state.payload.chat, selectedChannel: remote } } }); }}>Remote update</button> : null}</>;
}

test('archive and restore reconcile the accepted window before re-enabling sends and prevent duplicate actions', async t => {
  setup(t); const f = await fixture(); let posted!: (response: Response) => void; const calls: Array<{ url: string; method: string }> = [];
  let fresh: TranscriptChannelView = cold(f.channel);
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    if (init?.method === 'POST') return new Promise<Response>(resolve => { posted = resolve; });
    return new Response(JSON.stringify({ channel: fresh }));
  });
  const view = render(<I18nProvider locale="en"><Harness payload={f.payload} /></I18nProvider>);
  fireEvent.click(view.getByRole('button', { name: 'Archive conversation' }));
  assert.equal((view.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Archiving conversation…' })); assert.equal(calls.length, 1);
  posted(result(f.channel, true));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Restore conversation' })));
  assert.equal(view.getByTestId('order').textContent, '2');
  assert.equal((view.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled, true);
  fresh = hot(f.channel); fireEvent.click(view.getByRole('button', { name: 'Restore conversation' })); posted(result(f.channel, false));
  await waitFor(() => assert.equal((view.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled, false));
  assert.deepEqual(calls.map(call => call.method), ['POST', 'GET', 'POST', 'GET']);
  assert.equal(calls[0].url, `/api/channels/${encodeURIComponent(f.channel.id)}/archive`);
  assert.equal(calls[2].url, `/api/channels/${encodeURIComponent(f.channel.id)}/unarchive`);
});

for (const restore of [false, true]) test(`a delayed ${restore ? 'restore' : 'archive'} GET cannot replace a newer same-channel subscription`, async t => {
  setup(t); const f = await fixture(); let resolve!: (response: Response) => void; let reads = 0;
  const initial = restore ? cold(f.channel) : f.channel;
  const stale = restore ? hot(f.channel, '3') : cold(f.channel, '3');
  const remote = restore ? cold(f.channel, '4') : hot(f.channel, '4');
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return result(f.channel, !restore);
    reads++; return reads === 1 ? new Promise<Response>(done => { resolve = done; }) : new Response(JSON.stringify({ channel: remote }));
  });
  const payload = { ...f.payload, chat: { ...f.payload.chat, selectedChannel: initial } };
  const view = render(<I18nProvider locale="en"><Harness payload={payload} remote={remote} /></I18nProvider>);
  fireEvent.click(view.getByRole('button', { name: restore ? 'Restore conversation' : 'Archive conversation' }));
  await waitFor(() => assert.equal(reads, 1)); fireEvent.click(view.getByRole('button', { name: 'Remote update' }));
  resolve(new Response(JSON.stringify({ channel: stale })));
  await waitFor(() => assert.ok(view.getByRole('button', { name: restore ? 'Restore conversation' : 'Archive conversation' })));
  assert.equal(view.getByTestId('order').textContent, '4');
  assert.equal(reads, 2);
  assert.equal((view.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled, restore);
});

test('a lost mutation response reconciles committed state and a failed read requires reload rather than another mutation', async t => {
  setup(t); const f = await fixture(); let posts = 0, failRead = true;
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; throw new TypeError('Lost response after commit'); }
    return failRead ? new Response('', { status: 503 }) : new Response(JSON.stringify({ channel: cold(f.channel) }));
  });
  const view = render(<I18nProvider locale="en"><Harness payload={f.payload} /></I18nProvider>);
  fireEvent.click(view.getByRole('button', { name: 'Archive conversation' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Reload conversation' })));
  assert.equal((view.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByRole('button', { name: 'Archive conversation' }) as HTMLButtonElement).disabled, true);
  failRead = false; fireEvent.click(view.getByRole('button', { name: 'Reload conversation' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Restore conversation' })));
  assert.equal(posts, 1); assert.equal(view.getByTestId('order').textContent, '2');
});

for (const change of ['channel', 'scope']) test(`navigation to another ${change} aborts an archive request and ignores its late response`, async t => {
  setup(t); const f = await fixture(); let resolve!: (response: Response) => void; let signal: AbortSignal | null | undefined; let refreshed = 0;
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init?.signal; return new Promise<Response>(done => { resolve = done; });
  });
  function Probe({ channel, scope }: { channel: TranscriptChannelView; scope: string }) {
    const control = useConversationArchive(channel, async () => { refreshed++; }, scope);
    return <ConversationArchiveControls control={control} />;
  }
  const wrap = (channel = f.channel, scope = 'one') => <I18nProvider locale="en"><Probe channel={channel} scope={scope} /></I18nProvider>;
  const view = render(wrap()); fireEvent.click(view.getByRole('button', { name: 'Archive conversation' }));
  const next = { ...f.channel, id: 'other-channel' };
  view.rerender(change === 'scope' ? wrap(f.channel, 'two') : wrap(next)); assert.equal(signal?.aborted, true);
  resolve(result(f.channel, true)); await nextTask();
  assert.equal(refreshed, 0); assert.ok(view.getByRole('button', { name: 'Archive conversation' }));
});

test('read-only approvals remain visible and cannot submit an owner decision', t => {
  setup(t); let decisions = 0;
  const view = render(<I18nProvider locale="en"><ApprovalQueuePanel readOnly approvals={[{
    id: 'approval', kind: 'dispatch_plan', taskId: 'task', conversationId: 'conversation', status: 'pending', title: 'Review plan',
    summary: 'Preserved approval', requestedByActorId: null, requestedForActorId: 'owner', requestedAt: null, decidedAt: null,
    decidedByActorId: null, decisionAction: null, notes: null, requiresOwnerDecision: true,
    decisionOptions: [{ action: 'approve', label: 'Approve', description: 'Approve plan' }],
  }]} actorNameById={{}} busy={clearBusyState()} onDecision={() => { decisions++; }} /></I18nProvider>);
  const button = view.getByRole('button'); assert.equal((button as HTMLButtonElement).disabled, true);
  fireEvent.click(button); assert.equal(decisions, 0); assert.ok(view.getByText('Preserved approval'));
});

test('read-only Work project chips retain the association and withdraw an already open change dialog', async t => {
  setup(t); let writes = 0;
  const project: ConversationWorkProjectView = { channelId: 'work', projectId: 'project',
    project: { id: 'project', title: 'Preserved Project', status: 'active', folder: '/fixture' }, revision: 1,
    canChange: true, refusal: null, projects: [] };
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') writes++;
    return new Response(JSON.stringify(project));
  });
  const chip = (readOnly: boolean) => <I18nProvider locale="en"><ConversationWorkProjectChip readOnly={readOnly}
    channel={{ id: 'work', workProjectId: 'project' }} report={() => {}} /></I18nProvider>;
  const view = render(chip(false));
  await waitFor(() => assert.equal((view.getByRole('button', { name: 'Preserved Project' }) as HTMLButtonElement).disabled, false));
  fireEvent.click(view.getByRole('button', { name: 'Preserved Project' }));
  const item = view.getByRole('menuitem'); fireEvent.click(item); assert.ok(view.getByRole('dialog'));
  view.rerender(chip(true)); assert.equal(view.queryByRole('dialog'), null); assert.equal(view.queryByRole('menu'), null);
  assert.equal((view.getByRole('button', { name: 'Preserved Project' }) as HTMLButtonElement).disabled, true); assert.equal(writes, 0);
});

test('repeated subscription races stop after two reads and require an explicit reload', async t => {
  setup(t); const f = await fixture(), remote = cold(f.channel, '4');
  const reads: Array<(value: Response) => void> = []; let posts = 0;
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; return result(f.channel, true); }
    return new Promise<Response>(resolve => reads.push(resolve));
  });
  const view = render(<I18nProvider locale="en"><Harness payload={f.payload} remote={remote} /></I18nProvider>);
  fireEvent.click(view.getByRole('button', { name: 'Archive conversation' }));
  for (let i = 0; i < 2; i++) {
    await waitFor(() => assert.equal(reads.length, i + 1)); fireEvent.click(view.getByRole('button', { name: 'Remote update' }));
    reads[i](new Response(JSON.stringify({ channel: cold(f.channel, '3') })));
  }
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Reload conversation' })));
  assert.equal(reads.length, 2); assert.equal(posts, 1);
  assert.equal((view.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled, true);
});

function conversationProps(payload: AppShellPayload, channel: TranscriptChannelView, overrides: Partial<ConversationViewProps> = {}): ConversationViewProps {
  assert.ok(channel.roomRouting); const selected = { ...channel, roomRouting: channel.roomRouting }; const noop = () => {};
  return { payload: { ...payload, chat: { ...payload.chat, selectedChannel: selected } }, selectedChannel: selected,
    operatorSnapshot: null, operatorLoading: false, operatorError: '', composerDraft: 'Do not send', busy: clearBusyState(), feedback: '', greeting: '',
    channelFiles: [], channelPlusMenuOpen: false, channelPlusMenuRef: { current: null }, channelFileInputRef: { current: null }, activeAssignedCats: [],
    onComposerChange: noop, onComposerKeyDown: noop, onSendMessage: noop, onToggleChannelPlusMenu: noop, onChannelFileSelect: noop,
    onChannelFilesChange: noop, onApprovalDecision: noop, onChoiceSubmit: noop, onOperatorAction: noop, autoResize: noop,
    onUpdateChannelParticipant: async () => { throw Error('Archived participant edited'); },
    onSetChannelCoordinator: async () => { throw Error('Archived coordinator edited'); },
    onRemoveChannelParticipant: async () => { throw Error('Archived participant removed'); },
    refreshArchivedConversation: async () => {}, onRetryMessage: async () => {}, onRelayMessage: async () => {}, ...overrides };
}

for (const readOnly of [false, true]) test(`dirty participant fields ${readOnly ? 'discard on readonly transition' : 'still save on ordinary popover close'}`, async t => {
  setup(t); const f = await fixture(); const updates: Array<{ name?: string; roleHint?: string | null }> = [];
  t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const props = (channel: TranscriptChannelView) => conversationProps(f.payload, channel, {
    onUpdateChannelParticipant: async (_id, update) => { updates.push(update); },
  });
  const wrap = (channel: TranscriptChannelView) => <I18nProvider locale="en"><MemoryRouter><ConversationView {...props(channel)} /></MemoryRouter></I18nProvider>;
  const view = render(wrap(f.channel));
  const avatar = view.container.querySelector('.channelTopBar .catAvatar'); assert.ok(avatar); fireEvent.click(avatar);
  const editor = view.container.querySelector('.audiencePopoverEditor'); assert.ok(editor);
  const input = editor.querySelector('input'); assert.ok(input);
  fireEvent.change(input, { target: { value: 'Draft rename' } }); assert.equal(updates.length, 0);
  if (readOnly) view.rerender(wrap(cold(f.channel))); else fireEvent.click(avatar);
  await nextTask(); assert.equal(updates.length, readOnly ? 0 : 1);
  if (!readOnly) assert.equal(updates[0].name, 'Draft rename');
});

for (const surface of ['chat', 'code', 'work'] as const) test(`${surface} archived transcript keeps history/copy and disables composer and response cards`, async t => {
  setup(t); const f = await fixture(); const channel = cold(f.channel);
  assert.ok(channel.roomRouting);
  const base = channel.messages.find(message => message.body.startsWith('Transcript')); assert.ok(base);
  channel.messages = [{ ...base, id: 'choices', metadata: {}, body: 'Pick one', choices: [{ question: 'Which?', options: [{ id: 'a', label: 'A' }] }] },
    { ...base, id: 'proposal', body: 'Proposal card', senderKind: 'system', metadata: { event: 'conversation_proposal', conversationProposal: { id: 'p', status: 'open' } } },
    { ...base, id: 'join', body: 'Join card', senderKind: 'system', metadata: { event: 'boss_cat_join_request', bossCatJoinRequest: { id: 'j', status: 'pending' } } }];
  channel.messagePage = { ...channel.messagePage!, total: 3, windowCount: 3 };
  channel.originSurface = surface;
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => { calls.push(String(input)); return new Response('{}'); });
  const props = conversationProps(f.payload, channel, { behaviorSurface: surface });
  const element = surface === 'chat' ? <ConversationView {...props} /> : <CodeConversationView {...props} />;
  const view = render(<I18nProvider locale="en"><MemoryRouter>{element}</MemoryRouter></I18nProvider>);
  assert.ok(view.getByRole('button', { name: 'Restore conversation' }));
  assert.equal(view.container.querySelector('textarea'), null); assert.ok(view.container.querySelector('.conversationArchiveBanner'));
  assert.ok(view.container.querySelector('button[title="Copy message"]'));
  assert.ok([...view.container.querySelectorAll('.messageChoices input')].every(input => (input as HTMLInputElement).disabled));
  assert.equal(view.getAllByText('Restore this conversation to respond to this card.').length, 2);
  const avatar = view.container.querySelector('.channelTopBar .catAvatar'); assert.ok(avatar); fireEvent.click(avatar);
  const editor = view.container.querySelector('.audiencePopoverEditor'); assert.ok(editor);
  assert.ok(editor.querySelector('.audiencePopoverModelReadOnly')); assert.equal(editor.querySelector('input, select, textarea'), null);
  assert.equal(view.queryByRole('button', { name: 'Make coordinator' }), null);
  assert.equal(view.queryByRole('button', { name: 'Remove from conversation' }), null);
  await nextTask(); assert.ok(!calls.some(url => /proposals|join-requests/u.test(url)));
});
