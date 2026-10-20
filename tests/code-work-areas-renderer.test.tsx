import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { CodeConversationView } from '../src/products/code/renderer/components/CodeConversationView.tsx';
import type { ConversationViewProps } from '../src/products/shared/renderer/components/conversation-view/ConversationView.tsx';
import { CodeWorkAreasPanel } from '../src/products/code/renderer/components/CodeWorkAreasPanel.tsx';
import { useCodeWorkAreas } from '../src/products/code/renderer/hooks/useCodeWorkAreas.ts';
import { createCodeWorkAreasService } from '../src/products/code/state/workAreas.ts';
import type { CodeConversationWorkAreas } from '../src/products/code/shared/workAreas.ts';
import { createConversationNavigationFixture } from './fixtures/conversationNavigation.ts';
import { workAreaContext, runtimeInspection, runtimeSnapshot } from './fixtures/workAreas.ts';
import { clearBusyState } from '../src/shared/workspaceBusy.ts';
import { buildChatConversationId } from '../src/shared/chatCoreIds.ts';
import { readCodeWorkAreas } from '../src/products/code/shared/readWorkAreas.ts';
import { loadCodeInspectionPreference, saveCodeInspectionPreference } from '../src/products/code/renderer/codeInspectionPreferences.ts';

class FakeSource {
  static CLOSED = 2;
  static sources: FakeSource[] = [];
  readyState = 1; closed = false;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Array<(event: { data: string }) => void>>();
  constructor(public url: string) { FakeSource.sources.push(this); }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() { this.closed = true; }
  send(value: unknown, type = 'work_areas') {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(value) });
  }
}
const originalSource = globalThis.EventSource;
test.beforeEach(() => {
  cleanup(); resetTestDom(); window.localStorage.clear(); FakeSource.sources = [];
  // Deliberately minimal in-process EventSource: no real server or user profile.
  globalThis.EventSource = FakeSource as unknown as typeof EventSource;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});
test.afterEach(() => { cleanup(); globalThis.EventSource = originalSource; });

async function observed(conversationId = 'conversation-a', channelId = 'channel-a') {
  const context = workAreaContext(); context.conversationId = conversationId; context.channelId = channelId;
  context.participants[0].participantId = 'participant-1';
  return (await createCodeWorkAreasService({ inspector: { read: async () => context }, runtime: {
    observeSession: async () => runtimeInspection(context, runtimeSnapshot('session-a', 'runtime-run-a', true)),
    streamSession: async () => {},
  } }).read(conversationId))!;
}

function Probe({ id }: { id: string }) {
  const value = useCodeWorkAreas(id, true);
  return <pre>{JSON.stringify(value)}</pre>;
}

test('renderer retains inactive facts on disconnect, reconciles reconnect, and rejects foreign/old conversation events', async () => {
  const view = render(<Probe id="conversation-a" />);
  const source = FakeSource.sources[0]; const data = await observed();
  act(() => source.send(data));
  assert.match(view.container.textContent!, /"active":true/);
  act(() => source.onerror?.());
  assert.match(view.container.textContent!, /"status":"interrupted"/);
  assert.doesNotMatch(view.container.textContent!, /"active":true/);
  assert.match(view.container.textContent!, /"displayState":"unknown"/);
  act(() => source.send({ ...data, conversationId: 'foreign' }));
  assert.match(view.container.textContent!, /"status":"interrupted"/);
  act(() => source.send(data)); assert.match(view.container.textContent!, /"status":"ready"/);
  view.rerender(<Probe id="conversation-b" />);
  assert.equal(source.closed, true);
  act(() => source.send(data)); assert.doesNotMatch(view.container.textContent!, /runtime-run-a/);
  act(() => FakeSource.sources[1].send(null, 'work_areas_unavailable'));
  assert.match(view.container.textContent!, /"data":null,"status":"unavailable"/);
  assert.equal(FakeSource.sources[1].closed, true);
});

async function props(): Promise<ConversationViewProps> {
  const fixture = await createConversationNavigationFixture(path.join(tmpdir(), 'cats-work-areas-memory-only'));
  const payload = fixture.payload();
  const rawChannel = payload.chat.selectedChannel!;
  assert.ok(rawChannel.roomRouting);
  const selectedChannel = { ...rawChannel, roomRouting: rawChannel.roomRouting };
  selectedChannel.originSurface = 'code'; selectedChannel.repoPath = '/fixture/cats-inc';
  const noop = () => {};
  return { payload, selectedChannel, operatorSnapshot: null, operatorLoading: false, operatorError: '',
    composerDraft: '', busy: clearBusyState(), feedback: '', greeting: '', channelFiles: [],
    channelPlusMenuOpen: false, channelPlusMenuRef: { current: null }, channelFileInputRef: { current: null },
    activeAssignedCats: [], onComposerChange: noop, onComposerKeyDown: noop, onSendMessage: noop,
    onToggleChannelPlusMenu: noop, onChannelFileSelect: noop, onChannelFilesChange: noop,
    onApprovalDecision: noop, onChoiceSubmit: noop, onOperatorAction: noop, autoResize: noop,
    onUpdateChannelParticipant: async () => {}, behaviorSurface: 'code',
    renderTopBarExtraActions: () => <button>Existing preview</button> };
}

test('single-participant avatar fallback opens matching work areas; activity preserves focus, expansion and panel preference', async () => {
  const input = await props();
  const data = await observed(buildChatConversationId(input.selectedChannel.id), input.selectedChannel.id);
  const mount = () => render(<MemoryRouter><I18nProvider locale="en"><CodeConversationView {...input} /></I18nProvider></MemoryRouter>);
  const view = mount();
  act(() => FakeSource.sources[0].send(data));
  assert.ok(!view.container.querySelector('.sidePanel'), 'activity does not open the panel');
  assert.equal(view.container.querySelectorAll('.channelTopBar .catAvatar').length, 1,
    'preserve the existing single-participant avatar without adding another roster');
  assert.ok(view.getByRole('button', { name: 'Existing preview' }));
  const transcript = view.container.querySelector('.transcriptMessage')!.innerHTML;
  fireEvent.click(view.container.querySelector('.audienceChip')!);
  assert.ok(view.getByRole('dialog'));
  assert.ok(view.container.querySelector('.audiencePopoverEditor'));
  fireEvent.click(view.getByRole('button', { name: 'View work areas' }));
  const heading = view.container.querySelector<HTMLElement>('[data-work-area-participant="participant-1"]')!;
  await waitFor(() => assert.ok(document.activeElement === heading, 'explicit avatar action focuses its participant'));
  const checkout = view.container.querySelector<HTMLDetailsElement>('.codeWorkAreaCheckout')!;
  checkout.open = true;
  act(() => FakeSource.sources[0].send({ ...data, truncated: true }));
  assert.ok(document.activeElement === heading); assert.equal(checkout.open, true);
  assert.equal(view.container.querySelector('.transcriptMessage')!.innerHTML, transcript, 'transcript has no work-area metadata');
  fireEvent.click(view.getByRole('button', { name: 'Close' }));
  act(() => FakeSource.sources[0].send(data));
  assert.ok(!view.container.querySelector('.sidePanel'));
  fireEvent.click(view.container.querySelector('.sidePanelToggle')!);
  assert.ok(document.activeElement !== view.container.querySelector('[data-work-area-participant]'),
    'a consumed avatar focus request does not replay on manual reopen');
  fireEvent.click(view.getByRole('button', { name: 'Close' }));
  view.unmount();
  const remounted = mount(); assert.ok(!remounted.container.querySelector('.sidePanel'));
  fireEvent.click(remounted.container.querySelector('.audienceChip')!);
  fireEvent.click(remounted.getByRole('button', { name: 'View work areas' }));
  remounted.unmount();
  const restored = mount(); assert.ok(restored.container.querySelector('.sidePanel'));
});

test('an explicit avatar focus request waits for data and is consumed once', async () => {
  const input = await props();
  const view = render(<MemoryRouter><I18nProvider locale="en"><CodeConversationView {...input} /></I18nProvider></MemoryRouter>);
  fireEvent.click(view.container.querySelector('.audienceChip')!);
  fireEvent.click(view.getByRole('button', { name: 'View work areas' }));
  assert.ok(!view.container.querySelector('[data-work-area-participant]'));
  const data = await observed(buildChatConversationId(input.selectedChannel.id), input.selectedChannel.id);
  act(() => FakeSource.sources[0].send(data));
  const heading = view.container.querySelector<HTMLElement>('[data-work-area-participant]')!;
  assert.ok(document.activeElement === heading);
  const preview = view.getByRole('button', { name: 'Existing preview' }); preview.focus();
  act(() => FakeSource.sources[0].send({ ...data, truncated: true }));
  assert.ok(document.activeElement === preview);
});

test('disabled storage getters do not prevent Code inspection', async () => {
  const input = await props();
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    const view = render(<MemoryRouter><I18nProvider locale="en"><CodeConversationView {...input} /></I18nProvider></MemoryRouter>);
    fireEvent.click(view.container.querySelector('.audienceChip')!);
    fireEvent.click(view.getByRole('button', { name: 'View work areas' }));
    assert.ok(view.container.querySelector('.sidePanel'));
    view.unmount();
  } finally { Object.defineProperty(window, 'localStorage', descriptor); }
});

test('nested malformed projections and UTF-8 byte overflow never enter renderer state', async () => {
  const data = await observed();
  assert.ok(readCodeWorkAreas(data, data.conversationId));
  assert.equal(readCodeWorkAreas({ ...data, participants: [{}] }, data.conversationId), null);
  const broken = structuredClone(data);
  broken.participants[0].repositories[0].checkouts[0].operations[0].displayState = 'unknown';
  assert.equal(readCodeWorkAreas(broken, data.conversationId), null);
  const interrupted = structuredClone(data); interrupted.participants[0].executions[0].continuity = 'interrupted';
  assert.equal(readCodeWorkAreas(interrupted, data.conversationId), null);
  const bound = structuredClone(data); bound.participants[0].repositories[0].checkouts[0].association = 'session_binding';
  assert.equal(readCodeWorkAreas(bound, data.conversationId), null);
  const large = structuredClone(data);
  large.participants = Array.from({ length: 20 }, (_, index) => {
    const participant = structuredClone(data.participants[0]); participant.participantId = `p-${index}`;
    for (const repo of participant.repositories) for (const checkout of repo.checkouts) checkout.path = `/${'界'.repeat(3900)}`;
    return participant;
  });
  assert.ok(JSON.stringify(large).length < 256 * 1024);
  assert.equal(readCodeWorkAreas(large, data.conversationId), null);
});

test('panel preferences remain bounded and isolated by profile and conversation', () => {
  for (let i = 0; i < 70; i++) saveCodeInspectionPreference(localStorage, 'scope-a', `${i}-${'界'.repeat(250)}`,
    { open: true, section: 'work-areas' });
  const newest = `69-${'界'.repeat(250)}`;
  assert.equal(loadCodeInspectionPreference(localStorage, 'scope-a', newest).open, true);
  assert.equal(loadCodeInspectionPreference(localStorage, 'scope-b', newest).open, false);
  assert.equal(loadCodeInspectionPreference(localStorage, 'scope-a', '0-' + '界'.repeat(250)).open, false);
  assert.ok(new TextEncoder().encode(localStorage.getItem('cats:code:inspection:v1:scope-a')!).byteLength <= 16 * 1024);
});

test('Traditional Chinese panel renders partial/detached/unmanaged and long paths without inventing results', async () => {
  const data = await observed();
  const entry = data.participants[0]; entry.executions[0].coverage.status = 'partial';
  const checkout = entry.repositories[0].checkouts[0]; checkout.branch = null;
  checkout.detachedCommit = '1234567890abcdef'; checkout.management = 'unmanaged';
  checkout.path += '/a-very-long-repository-name'.repeat(12);
  const view = render(<I18nProvider locale="zh-TW"><CodeWorkAreasPanel
    state={{ data, conversationId: data.conversationId, status: 'ready' }} selectedParticipantId={null}
    focusRequest={0} onInspectRun={() => {}} /></I18nProvider>);
  assert.match(view.container.textContent!, /部分操作可見/);
  assert.match(view.container.textContent!, /Detached · 1234567890ab/);
  assert.match(view.container.textContent!, /未受管理/);
  assert.match(view.container.textContent!, /操作執行中/);
  assert.doesNotMatch(view.container.textContent!, /tests passed|files changed|grant|permission/);
});
