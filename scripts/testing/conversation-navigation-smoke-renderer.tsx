// Isolated production Chat renderer. All services below use synthetic fixture data.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { GuideCatPlacementProvider } from '../../src/app/renderer/GuideCatPlacementProvider.js';
import { sharedQueryClient } from '../../src/products/shared/renderer/queryClient.js';
import type { AppShellPayload } from '../../src/products/shared/api/workspaceContracts.js';
import type { ChannelSubscriptionState } from '../../src/products/shared/renderer/entitySubscriptionChannelDispatcher.js';
import '../../src/design/index.css';

const fixture = await (await fetch('/fixture.json')).json();
const ids: string[] = fixture.ids;
const payloads = fixture.payloads as Record<string, AppShellPayload>;
const snapshots = fixture.snapshots as Record<string, ChannelSubscriptionState>;
const calls: Array<{ url: string; method: string; at: number }> = [];
const sources = new Set<FixtureEventSource>();
const delays = { shell: 0, preference: 2_000, snapshot: 20 };
let selected = ids[0];
let shellCalls = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class FixtureEventSource extends EventTarget {
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    super(); sources.add(this);
    calls.push({ url, method: 'SSE', at: performance.now() });
    const params = new URL(url, location.origin).searchParams;
    const id = params.get('id');
    if (params.get('kind') === 'channel' && id) {
      void sleep(delays.snapshot).then(() => {
        if (!this.closed) this.emit('snapshot', { kind: 'channel', id, version: 1, state: snapshots[id] });
      });
    }
  }
  emit(type: string, data: unknown) { this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }
  close() { this.closed = true; sources.delete(this); }
}
Object.defineProperty(globalThis, 'EventSource', { value: FixtureEventSource, configurable: true });
globalThis.fetch = async (input, init) => {
  const url = String(input); calls.push({ url, method: init?.method ?? 'GET', at: performance.now() });
  if (url === '/api/app-shell') {
    if (shellCalls++ > 0) await sleep(delays.shell);
    return Response.json(payloads[selected]);
  }
  if (url === '/api/preferences') {
    await sleep(delays.preference);
    selected = JSON.parse(String(init?.body)).selectedChannelId ?? selected;
    return Response.json({ preferences: { selectedChannelId: selected } });
  }
  if (url === '/api/core') return Response.json(fixture.core);
  if (url === '/api/core/approvals') return Response.json({ approvals: [] });
  if (url === '/api/providers') return Response.json({ state: 'ready', warnings: [], providers: ids.map((id, index) => {
    const channel = snapshots[id].selectedChannel;
    return { id: channel.pendingProvider, label: channel.pendingProvider,
      defaultModel: channel.pendingModel, defaultInstance: 'native', defaultBackend: 'cli',
      instances: [{ id: 'native', label: 'Native', target: 'cli/native', backend: 'cli', default: true }],
      modelsPath: `/api/providers/${channel.pendingProvider}/models` };
  }) });
  const provider = /^\/api\/providers\/([^/]+)\/models/u.exec(url)?.[1];
  if (provider) {
    const channel = Object.values(snapshots).find((snapshot) => snapshot.selectedChannel.pendingProvider === provider)!.selectedChannel;
    const model = { id: channel.pendingModel, label: channel.pendingModel, default: true };
    const catalog = { provider, backend: 'cli', instance: 'cli/native', source: 'dynamic', cache: null,
      defaultModel: channel.pendingModel, models: [model], entries: [model], presets: [], warnings: [],
      defaultSelection: channel.pendingModelSelection, support: { tier: 'full', notes: [] },
      controls: [{ key: `${provider}.reasoning_effort`, label: 'Reasoning effort', kind: 'enum', scope: 'both',
        values: ['low', 'medium', 'high', 'max'].map((value) => ({ value, label: value })) }] };
    return Response.json({ catalog });
  }
  if (/\/api\/channels\/[^/]+$/u.test(url) && init?.method === 'PATCH') {
    const id = url.split('/').at(-1)!;
    Object.assign(snapshots[id].selectedChannel, JSON.parse(String(init.body)));
    return Response.json({ channel: payloads[id].chat.channels.find((channel) => channel.id === id) });
  }
  return Response.json({});
};
(window as any).__navigationSmoke = { ids, calls, delays, payloads, snapshots,
  disconnect(id: string, serverClose = false) {
    for (const source of sources) {
      if (!source.url.includes(`id=${id}`)) continue;
      if (serverClose) source.emit('close', { reason: 'Temporary fixture read failure', retryable: true });
      else source.onerror?.();
    }
  },
  pushReply(id: string, body: string, notify = true) {
  const state = snapshots[id];
  state.selectedChannel.messages.push({ ...state.selectedChannel.messages.at(-1)!, id: crypto.randomUUID(), body });
  for (const source of sources) {
    if (notify && source.url.includes(`id=${id}`)) source.emit('patch', { kind: 'channel', id, version: 1, patch: { kind: 'message.appended', state } });
  }
} };
const { default: App } = await import('../../src/products/chat/renderer/App.js');
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={sharedQueryClient}><BrowserRouter useTransitions={false}>
    <GuideCatPlacementProvider guideCat={null} placement="docked" floatingAnchor={null}
      sidecarMode="auto" onPersistSeen={() => {}} onCommit={() => {}}>
      <Routes><Route path="/chat/*" element={<App />} /></Routes>
    </GuideCatPlacementProvider>
  </BrowserRouter></QueryClientProvider>,
);
