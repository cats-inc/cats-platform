import { resetTestDom, testDomWindow } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { useState } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PlatformSurfaceId } from '../src/shared/platform-contract.ts';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';
import { isComposerAckBusyForDraft } from '../src/shared/composer.ts';
import type { AppLoadState } from '../src/products/shared/renderer/workspaceAppViewState.ts';
import { useWorkspaceComposerSubmit } from '../src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts';
import { useWorkspaceAppShellRouting } from '../src/products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts';
import { clearCrossSurfaceNavigationHandoff, consumeCrossSurfaceNavigationHandoff } from '../src/products/shared/renderer/crossSurfaceNavigationHandoff.ts';
import { createConversationNavigationFixture } from './fixtures/conversationNavigation.ts';
import { assignCatToChannel, createParallelChatGroup } from '../src/products/chat/state/model/index.ts';
import { stageCrossSurfaceConversationNavigationHandoff } from '../src/products/shared/renderer/crossSurfaceConversationNavigation.ts';
import { conversationScope } from '../src/products/shared/renderer/conversationNavigationCache.ts';
import { clearConversationViewMemory, useConversationComposerState, writeConversationComposer } from '../src/products/shared/renderer/conversationViewMemory.ts';
import { useWorkspaceAppTransientState } from '../src/products/shared/renderer/hooks/useWorkspaceAppTransientState.ts';

for (const [sourceSurface, targetSurface, leaveBeforeAck] of [
  ['chat', 'code', false], ['chat', 'work', false], ['code', 'chat', false],
  ['chat', 'chat', false], ['chat', 'code', true],
] as Array<[PlatformSurfaceId, PlatformSurfaceId, boolean]>) {
  test(`actual shared composer sends ${sourceSurface} draft to ${targetSurface}; user leaves=${leaveBeforeAck}`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'cats-cross-submit-'));
    const f = await createConversationNavigationFixture(root);
    const id = f.ids[3];
    f.state.channels.find((channel) => channel.id === id)!.originSurface = targetSurface;
    const created = f.snapshot(id).selectedChannel;
    const initial = f.payload();
    initial.chat.channels = initial.chat.channels.filter((channel) => channel.id !== id);
    const dispatched = f.payload(id);
    dispatched.chat.channels.find((channel) => channel.id === id)!.routingStatus = 'running';
    const originalFetch = globalThis.fetch;
    const originalLocation = globalThis.location;
    globalThis.location = testDomWindow.location;
    const sourcePath = `/${sourceSurface}/new`;
    testDomWindow.history.replaceState(null, '', sourcePath);
    clearCrossSurfaceNavigationHandoff();
    t.after(async () => {
      cleanup(); clearCrossSurfaceNavigationHandoff(); clearConversationViewMemory(); resetTestDom();
      globalThis.fetch = originalFetch; globalThis.location = originalLocation;
      await rm(root, { recursive: true, force: true });
    });
    let releaseAck!: () => void;
    const ack = new Promise<void>((resolve) => { releaseAck = resolve; });
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ url, body });
      if (url === '/api/channels') return Response.json({ channel: created });
      if (url === `/api/channels/${id}/messages`) {
        await ack;
        return Response.json({ appShell: dispatched });
      }
      throw new Error(`Unexpected isolated request: ${url}`);
    };
    const paths: string[] = [];
    const hook = renderHook(() => {
      const [state, setState] = useState<AppLoadState>({ status: 'ready', payload: initial });
      const [busy, setBusy] = useState(clearBusyState());
      const [composerDraft, setComposerDraft] = useState('Build a timer');
      const noop = () => {};
      const target = { provider: 'claude', model: 'model-1', instance: 'cli/native', modelSelection: null };
      const actions = useWorkspaceComposerSubmit({ state, setState, surface: sourceSurface,
        originSurface: targetSurface, chatPrefix: `/${sourceSurface}`, currentPath: sourcePath,
        navigate: (to) => {
          assert.equal(typeof to, 'string'); paths.push(String(to));
          testDomWindow.history.replaceState(null, '', String(to));
        },
        composerDraft, setComposerDraft, showingNewChatDraft: true, showingMyCatDirectLane: false,
        draftDefaultRecipientCatId: null, draftCatIds: [], draftCwd: null, draftFiles: [], channelFiles: [],
        setDraftCwd: noop, setDraftCatIds: noop, setDraftHighlightedCatId: noop,
        setDraftCatExecutionTargetOverrides: noop, setDraftFiles: noop, setChannelFiles: noop,
        draftExecutionTarget: target, defaultChannelExecutionTarget: target, selectedChannel: null,
        busy, setBusy, setFeedback: noop,
      });
      return { ...actions, busy };
    });
    let sending!: Promise<void>;
    const submit = hook.result.current.submitComposerMessage;
    act(() => { sending = submit(); void submit(); });
    await waitFor(() => assert.ok(requests.some((request) => request.url.endsWith('/messages'))));
    assert.equal(requests.find((request) => request.url === '/api/channels')!.body.originSurface, targetSurface);
    if (sourceSurface !== targetSurface) {
      assert.deepEqual(paths, [], 'source remains mounted until dispatch ACK');
      await waitFor(() => assert.equal(isComposerAckBusyForDraft(hook.result.current.busy), true, 'draft remains locked with Cancel during ACK'));
    }
    if (leaveBeforeAck) testDomWindow.history.replaceState(null, '', '/chat/chats/unrelated');
    releaseAck();
    await sending;
    const destination = `/${targetSurface}/chats/${id}`;
    if (leaveBeforeAck) {
      assert.deepEqual(paths, []);
      assert.equal(consumeCrossSurfaceNavigationHandoff({ surface: targetSurface, path: destination }), null);
    } else {
      await waitFor(() => assert.equal(paths.at(-1), destination));
      assert.ok(paths.every((route) => route === destination), 'never sends Code conversation to a Chat URL');
      const handoff = consumeCrossSurfaceNavigationHandoff({ surface: targetSurface, path: destination });
      if (sourceSurface !== targetSurface) {
        assert.ok(handoff);
        assert.equal(handoff.optimisticState?.selectedChannelId, id);
        assert.equal(handoff.optimisticState?.pendingExecution, true);
        assert.equal(handoff.snapshot?.appShellPayload?.chat.selectedChannel?.id, id);
      } else assert.equal(handoff, null);
    }
    assert.equal(requests.filter((request) => request.url === '/api/channels').length, 1);
    assert.equal(requests.filter((request) => request.url.endsWith('/messages')).length, 1);
  });
}

test('actual routing repairs an existing Code conversation displayed through a Chat URL', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-origin-route-'));
  const f = await createConversationNavigationFixture(root);
  const id = f.ids[0];
  f.state.channels.find((channel) => channel.id === id)!.originSurface = 'code';
  const payload = f.payload(id);
  payload.chat.channels.find((channel) => channel.id === id)!.routingStatus = 'running';
  const paths: string[] = [];
  clearCrossSurfaceNavigationHandoff();
  t.after(async () => { cleanup(); resetTestDom(); clearCrossSurfaceNavigationHandoff(); await rm(root, { recursive: true, force: true }); });
  renderHook(() => {
    const [state, setState] = useState<AppLoadState>({ status: 'ready', payload });
    useWorkspaceAppShellRouting({ state, setState, navigate: (to) => { paths.push(String(to)); },
      busy: clearBusyState(), surface: 'chat', chatPrefix: '/chat',
      currentPath: `/chat/chats/${id}/canvas/artifact-1/view/iframe?preview=1`,
      routeChannelId: id, routeChannelExists: true, selectedChannelId: id, selectedChannelViewId: id,
      selectedChannelEntryLifecycle: null, draftDefaultRecipientCatId: null,
      showingMyCatDirectLane: false, routeDirectLaneSummary: null, readySelectedChannel: null,
      onConversationOriginRedirect: (destination) => {
        stageCrossSurfaceConversationNavigationHandoff({ sourceSurface: 'chat', targetSurface: destination.surface,
          channelId: id, snapshotPayload: payload, destinationPath: destination.path, pendingExecution: true });
      },
      unknownRendererErrorMessage: 'Fixture error', fetchAppShell: async () => payload,
    });
  });
  await waitFor(() => assert.ok(paths.includes(`/code/chats/${id}/canvas/artifact-1/view/iframe?preview=1`)));
  const handoff = consumeCrossSurfaceNavigationHandoff({ surface: 'code', path: paths[0] });
  assert.equal(handoff?.optimisticState?.pendingExecution, true);
  assert.equal(handoff?.snapshot?.appShellPayload?.chat.selectedChannel?.id, id);
});

for (const [parallel, outcome] of [
  [false, 'creation-failed'], [false, 'upload-failed'], [false, 'send-failed'], [false, 'cancelled'],
  [false, 'override-failed'], [false, 'override-cancelled'],
  [true, 'send-failed'], [true, 'cancelled'], [true, 'running'],
] as Array<[boolean, string]>) {
  test(`cross-surface ${parallel ? 'parallel' : 'single'} draft retains created identity and composer on ${outcome}`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'cats-cross-failure-'));
    const f = await createConversationNavigationFixture(root, outcome.startsWith('override-'));
    const target = { provider: 'claude', model: 'model-1', instance: 'cli/native', modelSelection: null };
    let id = f.ids[3];
    const initial = f.payload();
    if (parallel) {
      Object.assign(f.state, createParallelChatGroup(f.state, { title: 'Timer compare', originSurface: 'code', targets: [target, target] }));
      id = f.state.selectedChannelId!;
    } else {
      f.state.channels.find((channel) => channel.id === id)!.originSurface = 'code';
      initial.chat.channels = initial.chat.channels.filter((channel) => channel.id !== id);
    }
    const overrideCat = outcome.startsWith('override-') ? f.state.cats.find((cat) => cat.id !== f.state.bossCatId) : null;
    if (overrideCat) Object.assign(f.state, assignCatToChannel(f.state, id, { catId: overrideCat.id }));
    const createdPayload = f.payload(id);
    const group = createdPayload.chat.parallelChatGroups[0];
    const dispatched = f.payload(id);
    if (outcome === 'running') dispatched.chat.channels.find((channel) => channel.id === id)!.routingStatus = 'running';
    const files = [new File(['notes'], 'notes.txt')];
    const originalFetch = globalThis.fetch;
    const originalLocation = globalThis.location;
    globalThis.location = testDomWindow.location;
    testDomWindow.history.replaceState(null, '', '/chat/new');
    clearCrossSurfaceNavigationHandoff();
    t.after(async () => {
      cleanup(); clearCrossSurfaceNavigationHandoff(); clearConversationViewMemory(); resetTestDom();
      globalThis.fetch = originalFetch; globalThis.location = originalLocation;
      await rm(root, { recursive: true, force: true });
    });
    const requests: string[] = [];
    let releaseAck!: () => void;
    const ack = new Promise<void>((resolve) => { releaseAck = resolve; });
    globalThis.fetch = async (input) => {
      const url = String(input); requests.push(url);
      if (url === '/api/preferences') return Response.json({ preferences: { selectedChannelId: id } });
      if (url === '/api/app-shell') return Response.json(createdPayload);
      if (url.includes('/participants/')) {
        if (outcome === 'override-cancelled') throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        throw new Error('Fixture override failed');
      }
      if (url === '/api/channels' || url === '/api/parallel-chat-groups') {
        if (outcome === 'creation-failed') throw new Error('Fixture creation failed');
        return Response.json(parallel ? { group, appShell: createdPayload } : { channel: f.snapshot(id).selectedChannel });
      }
      if (url.endsWith('/attachments')) {
        if (outcome === 'upload-failed') throw new Error('Fixture upload failed');
        return Response.json({ attachments: [{ name: 'notes.txt', relativePath: 'attachments/notes.txt' }] });
      }
      if (url.endsWith('/messages')) {
        if (outcome === 'cancelled') throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        if (outcome === 'send-failed') throw new Error('Fixture send failed');
        if (outcome === 'running') await ack;
        return Response.json({ appShell: dispatched });
      }
      throw new Error(`Unexpected isolated request: ${url}`);
    };
    const paths: string[] = [];
    const restored: Array<{ id: string; text: string; files: File[] }> = [];
    const hook = renderHook(() => {
      const [state, setState] = useState<AppLoadState>({ status: 'ready', payload: initial });
      const [busy, setBusy] = useState(clearBusyState());
      const [composerDraft, setComposerDraft] = useState('Build a timer');
      const [feedback, setFeedback] = useState('');
      const noop = () => {};
      const actions = useWorkspaceComposerSubmit({ state, setState, surface: 'chat', originSurface: 'code',
        chatPrefix: '/chat', currentPath: '/chat/new', navigate: (to) => {
          paths.push(String(to)); testDomWindow.history.replaceState(null, '', String(to));
        }, composerDraft, setComposerDraft, showingNewChatDraft: true, showingMyCatDirectLane: false,
        restoreConversationComposer: (channelId, text, attachments) => {
          restored.push({ id: channelId, text, files: attachments });
          writeConversationComposer(conversationScope(createdPayload), `channel:${channelId}`, { text, files: attachments });
        },
        draftDefaultRecipientCatId: null, draftCatIds: [], draftCwd: null, draftFiles: files, channelFiles: [],
        draftCatExecutionTargetOverrides: new Map(overrideCat ? [[overrideCat.id, target]] : []),
        setDraftCwd: noop, setDraftCatIds: noop, setDraftHighlightedCatId: noop,
        setDraftCatExecutionTargetOverrides: noop, setDraftFiles: noop, setChannelFiles: noop,
        draftExecutionTarget: target, defaultChannelExecutionTarget: target, selectedChannel: null,
        showingParallelChatDraft: parallel, draftParallelChatTargets: [target, target], busy, setBusy, setFeedback,
      });
      return { ...actions, feedback, composerDraft, busy };
    });
    let sending!: Promise<void>;
    act(() => { sending = hook.result.current.submitComposerMessage(); });
    if (outcome === 'running') {
      await waitFor(() => assert.ok(requests.some((url) => url.endsWith('/messages'))));
      assert.equal(isComposerAckBusyForDraft(hook.result.current.busy), true, 'parallel draft retains its ACK controls');
      releaseAck();
    }
    await sending;
    const destination = `/code/chats/${id}`;
    if (outcome === 'creation-failed') {
      await waitFor(() => assert.match(hook.result.current.feedback, /Fixture creation failed/u));
      assert.equal(hook.result.current.composerDraft, 'Build a timer');
      assert.equal(consumeCrossSurfaceNavigationHandoff({ surface: 'code', path: destination }), null);
      assert.deepEqual(restored, []);
      assert.ok(paths.every((route) => route === '/chat/new'));
    } else {
      await waitFor(() => assert.equal(paths.at(-1), destination));
      const handoff = consumeCrossSurfaceNavigationHandoff({ surface: 'code', path: destination });
      assert.ok(handoff);
      assert.equal(handoff.optimisticState?.pendingExecution, outcome === 'running');
      assert.equal(handoff.optimisticState?.selectedChannelId, id);
      assert.equal(handoff.destination.entityId, parallel ? group.id : id);
      if (outcome === 'running') assert.deepEqual(restored, []);
      else {
        assert.deepEqual(restored, [{ id, text: 'Build a timer', files }]);
        if (outcome === 'cancelled' || outcome === 'override-cancelled') assert.equal(handoff.optimisticState?.feedback, undefined);
        else assert.match(handoff.optimisticState?.feedback ?? '', /Fixture (upload|send|override) failed/u);
        hook.unmount();
        const targetMount = renderHook(() => ({
          transient: useWorkspaceAppTransientState({ initialState: { status: 'ready', payload: handoff.snapshot?.appShellPayload },
            createEmptyCatForm: () => ({}), pickGreeting: () => '', initialFeedback: handoff.optimisticState?.feedback }),
          composer: useConversationComposerState(conversationScope(createdPayload), `channel:${id}`),
        }));
        assert.equal(targetMount.result.current.transient.feedback, handoff.optimisticState?.feedback ?? '');
        assert.equal(targetMount.result.current.composer.composerDraft, 'Build a timer');
        assert.deepEqual(targetMount.result.current.composer.channelFiles, files);
      }
      assert.equal(requests.filter((url) => url === (parallel ? '/api/parallel-chat-groups' : '/api/channels')).length, 1);
      if (outcome === 'upload-failed') assert.ok(requests.some((url) => url.endsWith('/attachments')));
      else if (outcome.startsWith('override-')) {
        assert.ok(requests.some((url) => url.includes('/participants/')));
        assert.equal(requests.some((url) => url.endsWith('/messages')), false);
      }
      else assert.ok(requests.some((url) => url.endsWith('/messages')));
    }
  });
}
