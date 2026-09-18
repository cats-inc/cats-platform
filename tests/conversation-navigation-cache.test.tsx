import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React, { useState } from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { ConversationNavigationCache, selectRetainedConversation } from '../src/products/shared/renderer/conversationNavigationCache.ts';
import { useConversationNavigationState } from '../src/products/shared/renderer/hooks/useConversationNavigationState.ts';
import { useConversationComposerState, clearConversationViewMemory, writeConversationComposer } from '../src/products/shared/renderer/conversationViewMemory.ts';
import { EntitySubscriptionHub, useEntitySubscription } from '../src/products/shared/renderer/entitySubscriptionHub.ts';
import { applyChannelSubscriptionStateToLoadState, type ChannelSubscriptionState, type ChannelSubscriptionPatch } from '../src/products/shared/renderer/entitySubscriptionChannelDispatcher.ts';
import { SelectedChannelPersistence } from '../src/products/shared/renderer/selectedChannelPersistence.ts';
import { persistSelectedChannel } from '../src/products/shared/renderer/api/appShell.ts';
import type { AppLoadState } from '../src/products/shared/renderer/workspaceAppViewState.ts';
import { appendOptimisticUserMessage } from '../src/products/shared/renderer/workspaceChatUtils.tsx';
import { useWorkspaceComposerSubmit } from '../src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts';
import { normalizeSelectedChannelView } from '../src/products/shared/channelEntry.ts';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';
import { createConversationNavigationFixture } from './fixtures/conversationNavigation.ts';

class Source {
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  closed = false;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  addEventListener(event: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  emit(event: string, data: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener({ data: JSON.stringify(data) } as MessageEvent);
  }
  close() { this.closed = true; }
}

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-navigation-'));
  const client = new QueryClient();
  const cache = new ConversationNavigationCache(client);
  t.after(async () => { cleanup(); cache.clear(); client.clear(); clearConversationViewMemory(); resetTestDom(); await rm(root, { recursive: true, force: true }); });
  return { ...await createConversationNavigationFixture(root), client, cache };
}

test('cold entry subscribes before any preference/shell response; warm A/B/C/D switches render synchronously and stay isolated', async (t) => {
  const f = await fixture(t);
  const sources: Source[] = [];
  const hub = new EntitySubscriptionHub((url) => {
    const source = new Source(url); sources.push(source); return source as unknown as EventSource;
  });
  let publish!: (state: AppLoadState) => void;
  function Screen({ id }: { id: string }) {
    const [stored, store] = useState<AppLoadState>({ status: 'ready', payload: f.payload() });
    const { state, setState, channelId } = useConversationNavigationState({ state: stored, setState: store,
      routeChannelId: id, directRecipientId: null, cache: f.cache });
    publish = setState;
    useEntitySubscription<ChannelSubscriptionState, ChannelSubscriptionPatch>({ kind: 'channel', id: channelId,
      onSnapshot: (event) => setState((current) => applyChannelSubscriptionStateToLoadState(current, event.state)),
      onPatch: (event) => { if (event.patch.state) setState((current) => applyChannelSubscriptionStateToLoadState(current, event.patch.state!)); },
    }, hub);
    const channel = state.status === 'ready' ? state.payload.chat.selectedChannel : null;
    return <section data-channel={channel?.id ?? ''}>{channel
      ? <><p>{channel.messages.at(-1)?.body}</p><output>{JSON.stringify([channel.pendingProvider, channel.pendingModel, channel.pendingModelSelection])}</output></>
      : <span role="progressbar">Loading</span>}</section>;
  }
  const view = render(<Screen id={f.ids[0]} />);
  assert.match(view.container.textContent!, /Transcript 1/);
  for (let index = 1; index < 4; index += 1) {
    view.rerender(<Screen id={f.ids[index]} />);
    assert.ok(view.queryByRole('progressbar'));
    assert.ok(sources.at(-1)!.url.includes(f.ids[index]), 'cold subscription starts immediately');
    act(() => sources.at(-1)!.emit('snapshot', { kind: 'channel', id: f.ids[index], version: 1, state: f.snapshot(f.ids[index]) }));
    assert.match(view.container.textContent!, new RegExp(`Transcript ${index + 1}`));
  }
  for (const index of [0, 2, 1, 3, 0]) {
    view.rerender(<Screen id={f.ids[index]} />);
    assert.equal(view.queryByRole('progressbar'), null, 'no asynchronous round trip on a retained route');
    assert.equal(view.container.querySelector('section')!.dataset.channel, f.ids[index]);
    assert.match(view.container.textContent!, new RegExp(`Transcript ${index + 1}`));
    assert.match(view.container.textContent!, new RegExp(`model-${index + 1}`));
  }
  // An old mutation/shell response may update its own cache, never the visible route.
  act(() => publish({ status: 'ready', payload: f.payload(f.ids[2]) }));
  assert.match(view.container.textContent!, /Transcript 1/);
  // A disposed stream cannot send its stale snapshot through callbacks of a new route.
  act(() => sources[1].emit('snapshot', { kind: 'channel', id: f.ids[1], version: 1, state: f.snapshot(f.ids[1]) }));
  assert.match(view.container.textContent!, /Transcript 1/);
  const updated = f.snapshot(f.ids[0]);
  updated.selectedChannel.messages.push({ ...updated.selectedChannel.messages.at(-1)!, id: 'background-reply', body: 'Background reply arrived' });
  act(() => sources.at(-1)!.emit('patch', { kind: 'channel', id: f.ids[0], version: 1, patch: { kind: 'message.appended', state: updated } }));
  assert.match(view.container.textContent!, /Background reply arrived/);
  view.rerender(<Screen id={f.ids[1]} />);
  view.rerender(<Screen id={f.ids[0]} />);
  assert.match(view.container.textContent!, /Background reply arrived/);
});

test('cache isolates scopes, drops deleted channels, bounds retained projections and rejects older state', async (t) => {
  const f = await fixture(t);
  const cache = new ConversationNavigationCache(f.client, 2);
  cache.rememberPayload(f.payload(f.ids[0]));
  cache.rememberPayload(f.payload(f.ids[1]));
  const otherScope = selectRetainedConversation(f.payload(f.ids[1], 'other-scope'), f.ids[0], cache);
  assert.equal(otherScope.chat.selectedChannel, null);
  const newer = f.snapshot(f.ids[0]); newer.selectedChannel.updatedAt = '2026-09-18T02:00:00.000Z';
  newer.selectedChannel.title = 'New title'; cache.remember('navigation-test', newer);
  cache.rememberPayload(f.payload(f.ids[0]));
  assert.equal(cache.read('navigation-test', f.ids[0])!.selectedChannel.title, 'New title');
  cache.rememberPayload(f.payload(f.ids[2]));
  assert.equal(cache.read('navigation-test', f.ids[1]), undefined);
  cache.prune('navigation-test', new Set([f.ids[2]]));
  assert.equal(cache.read('navigation-test', f.ids[0]), undefined);
  cache.clear(); assert.equal(cache.read('navigation-test', f.ids[2]), undefined);
});

test('composer drafts/files and delayed clears are bound to their originating conversation', async (t) => {
  await fixture(t);
  const hook = renderHook(({ id }) => useConversationComposerState('scope', `channel:${id}`), { initialProps: { id: 'a' } });
  act(() => hook.result.current.setComposerDraft('A draft'));
  const clearA = hook.result.current.setComposerDraft;
  const file = new window.File(['a'], 'a.txt');
  act(() => hook.result.current.setChannelFiles([file]));
  hook.rerender({ id: 'b' });
  assert.equal(hook.result.current.composerDraft, '');
  assert.equal(hook.result.current.channelFiles.length, 0);
  act(() => hook.result.current.setComposerDraft('B draft'));
  act(() => clearA(''));
  assert.equal(hook.result.current.composerDraft, 'B draft');
  hook.rerender({ id: 'a' });
  assert.equal(hook.result.current.composerDraft, '');
  assert.equal(hook.result.current.channelFiles[0], file);
});

test('failed optimistic sends roll back and cannot poison the retained transcript', async (t) => {
  const f = await fixture(t);
  const original = f.payload();
  const hook = renderHook(({ id }) => {
    const [state, setState] = useState<AppLoadState>({ status: 'ready', payload: original });
    return useConversationNavigationState({ state, setState, routeChannelId: id, directRecipientId: null, cache: f.cache });
  }, { initialProps: { id: f.ids[0] } });
  const optimistic = appendOptimisticUserMessage(original, f.ids[0], 'Failed send');
  act(() => hook.result.current.setState({ status: 'ready', payload: optimistic.payload }));
  assert.equal(hook.result.current.state.status === 'ready' && hook.result.current.state.payload.chat.selectedChannel?.messages.at(-1)?.body, 'Failed send');
  act(() => hook.result.current.setState({ status: 'ready', payload: original }));
  hook.rerender({ id: f.ids[1] });
  hook.rerender({ id: f.ids[0] });
  assert.equal(hook.result.current.state.status === 'ready' && hook.result.current.state.payload.chat.selectedChannel?.messages.at(-1)?.body, 'Transcript 1');
});

test('auth reset drops displayed data and rejects callbacks from the previous cache generation', async (t) => {
  const f = await fixture(t);
  const hook = renderHook(() => {
    const [state, setState] = useState<AppLoadState>({ status: 'ready', payload: f.payload() });
    return useConversationNavigationState({ state, setState, routeChannelId: f.ids[0], directRecipientId: null, cache: f.cache });
  });
  const oldCallback = hook.result.current.setState;
  act(() => f.cache.clear());
  assert.equal(hook.result.current.state.status, 'loading');
  act(() => oldCallback({ status: 'ready', payload: f.payload() }));
  assert.equal(hook.result.current.state.status, 'loading');
  assert.equal(f.cache.read('navigation-test', f.ids[0]), undefined);
  act(() => hook.result.current.setState({ status: 'ready', payload: f.payload(f.ids[0], 'new-scope') }));
  assert.equal(hook.result.current.state.status, 'ready');
  assert.equal(f.cache.read('navigation-test', f.ids[0]), undefined);
});

test('same channel id in a new scope opens a fresh source and rejects old scope events', async (t) => {
  const f = await fixture(t);
  const sources: Source[] = [];
  const hub = new EntitySubscriptionHub((url) => { const source = new Source(url); sources.push(source); return source as unknown as EventSource; });
  const received: string[] = [];
  const hook = renderHook(({ scope }) => useEntitySubscription({ kind: 'channel', id: f.ids[0], scopeKey: scope,
    onSnapshot: () => received.push(scope), onPatch: () => {},
  }, hub), { initialProps: { scope: 'a:0' } });
  hook.rerender({ scope: 'b:1' });
  assert.equal(sources.length, 2);
  assert.equal(sources[0].closed, true);
  const event = { kind: 'channel', id: f.ids[0], version: 1, state: f.snapshot(f.ids[0]) };
  act(() => sources[0].emit('snapshot', event));
  assert.deepEqual(received, []);
  act(() => sources[1].emit('snapshot', event));
  assert.deepEqual(received, ['b:1']);
});

test('deleted conversations lose draft memory after projection eviction; reset rejects late composer writes', async (t) => {
  const f = await fixture(t);
  const cache = new ConversationNavigationCache(f.client, 1);
  const hook = renderHook(({ id }) => useConversationComposerState('navigation-test', `channel:${id}`), { initialProps: { id: f.ids[0] } });
  act(() => hook.result.current.setComposerDraft('Private draft'));
  const staleSetter = hook.result.current.setComposerDraft;
  const epoch = hook.result.current.generation;
  cache.rememberPayload(f.payload(f.ids[0]));
  cache.rememberPayload(f.payload(f.ids[1]));
  cache.prune('navigation-test', new Set([f.ids[1]]));
  hook.rerender({ id: f.ids[1] }); hook.rerender({ id: f.ids[0] });
  assert.equal(hook.result.current.composerDraft, '');
  act(() => clearConversationViewMemory());
  act(() => {
    staleSetter('Old session draft');
    writeConversationComposer('navigation-test', `channel:${f.ids[0]}`, { text: 'Old rejected send', files: [] }, epoch);
  });
  assert.equal(hook.result.current.composerDraft, '');
});

test('actual first-send failure restores text and files to the created conversation composer', async (t) => {
  const f = await fixture(t);
  const createdId = f.ids[3];
  const initial = f.payload();
  initial.chat.channels = initial.chat.channels.filter((channel) => channel.id !== createdId);
  const created = f.snapshot(createdId).selectedChannel;
  created.repoPath = f.config.runtimeDataDir;
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url === '/api/channels') return Response.json({ channel: created });
    if (url.endsWith('/attachments')) return Response.json({ attachments: [{ name: 'draft.txt', relativePath: 'attachments/draft.txt' }] });
    if (url.endsWith('/messages')) return Response.json({ error: 'Synthetic send failure' }, { status: 503 });
    if (url.startsWith('/api/providers')) throw new Error('No provider service in isolated send regression');
    throw new Error(`Unexpected fixture request: ${url}`);
  };
  const file = new File(['draft'], 'draft.txt');
  const hook = renderHook(() => {
    const [route, setRoute] = useState('/chat/new');
    const id = route.startsWith('/chat/chats/') ? route.split('/').at(-1)! : null;
    const [stored, store] = useState<AppLoadState>({ status: 'ready', payload: initial });
    const navigation = useConversationNavigationState({ state: stored, setState: store, routeChannelId: id, directRecipientId: null, cache: f.cache });
    const composer = useConversationComposerState('navigation-test', id ? `channel:${id}` : `draft:${route}`);
    const [draftFiles, setDraftFiles] = useState<File[]>([file]);
    const [busy, setBusy] = useState(clearBusyState());
    const noop = () => {};
    const target = { provider: 'codex', model: 'model-1', instance: 'cli/native', modelSelection: null };
    const submit = useWorkspaceComposerSubmit({
      state: navigation.state, setState: navigation.setState, navigate: (to) => { if (typeof to === 'string') setRoute(to); },
      chatPrefix: '/chat', originSurface: 'chat', currentPath: route,
      composerDraft: composer.composerDraft, setComposerDraft: composer.setComposerDraft,
      restoreConversationComposer: (channelId, text, files) => writeConversationComposer('navigation-test', `channel:${channelId}`, { text, files }, composer.generation),
      showingNewChatDraft: !id, showingMyCatDirectLane: false, draftDefaultRecipientCatId: null,
      draftCatIds: [], draftCwd: null, draftFiles, channelFiles: composer.channelFiles,
      setDraftCwd: noop, setDraftCatIds: noop, setDraftHighlightedCatId: noop, setDraftCatExecutionTargetOverrides: noop,
      setDraftFiles, setChannelFiles: composer.setChannelFiles, draftExecutionTarget: target, defaultChannelExecutionTarget: target,
      selectedChannel: navigation.state.status === 'ready' ? normalizeSelectedChannelView(navigation.state.payload.chat.selectedChannel) : null,
      busy, setBusy, setFeedback: noop,
    });
    return { ...composer, ...submit, route, state: navigation.state };
  });
  act(() => hook.result.current.setComposerDraft('Restore this message'));
  let sending!: Promise<void>;
  act(() => { sending = hook.result.current.submitComposerMessage(); });
  await sending;
  await waitFor(() => assert.equal(hook.result.current.composerDraft, 'Restore this message'));
  assert.ok(calls.some((url) => url.endsWith('/messages')), 'reached actual send after creation and upload');
  assert.equal(hook.result.current.route, `/chat/chats/${createdId}`);
  assert.equal(hook.result.current.composerDraft, 'Restore this message');
  assert.equal(hook.result.current.channelFiles[0], file);
  const state = hook.result.current.state;
  assert.ok(state.status === 'ready');
  assert.equal(state.payload.chat.selectedChannel?.messages.some((message) => message.metadata?.optimistic === true), false);
});

test('selected channel persistence coalesces pending writes and retries without waiting in the UI', async () => {
  const calls: string[] = [];
  let finish!: () => void;
  const persistence = new SelectedChannelPersistence(async (id) => {
    calls.push(id);
    if (calls.length === 1) await new Promise<void>((resolve) => { finish = resolve; });
  });
  try {
    persistence.select('scope', 'a');
    persistence.select('scope', 'b');
    persistence.select('scope', 'c');
    persistence.select('scope', 'd');
    assert.deepEqual(calls, ['a']);
    finish();
    await waitFor(() => assert.deepEqual(calls, ['a', 'd']));
  } finally { persistence.clear(); }
  let attempts = 0;
  const retry = new SelectedChannelPersistence(async () => { if (++attempts === 1) throw new Error('temporary'); });
  try {
    retry.select('scope', 'd');
    await waitFor(() => assert.equal(attempts, 2));
  } finally { retry.clear(); }
});

test('selection preference API never requests the app shell', async (t) => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (input) => { calls.push(String(input)); return Response.json({ preferences: { selectedChannelId: 'a' } }); };
  await persistSelectedChannel('a');
  assert.deepEqual(calls, ['/api/preferences']);
});
