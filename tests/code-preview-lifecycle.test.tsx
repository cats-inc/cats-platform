import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import type {
  RuntimeClient,
  RuntimeSessionCreateInput,
  RuntimeSessionInfo,
} from '../src/platform/runtime/client.ts';
import { McpSessionGrantStore } from '../src/platform/mcp/sessionGrants.ts';
import { routeCodeLivePreviewApi } from '../src/products/code/api/livePreviewRoutes.ts';
import type { CodeAgentToolGrantBinding } from '../src/products/code/agentTools/contracts.ts';
import { createCodeAgentToolsClientWrapper } from '../src/products/code/agentTools/runtimeClientWrapper.ts';
import { runShowInCanvas } from '../src/products/code/agentTools/showInCanvas.ts';
import {
  CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
  DEFAULT_LIVE_PREVIEW_CONFIG,
  VITE_LIVE_PREVIEW_PROFILE,
  withBuiltinLivePreviewProfiles,
} from '../src/products/code/livePreview/contracts.ts';
import {
  createCodeConversationPreviews,
  type CodePreviewArtifactState,
} from '../src/products/code/livePreview/conversationPreviews.ts';
import {
  createFileLivePreviewProcessRegistry,
  readLivePreviewProcessRecords,
  sweepOrphanLivePreviewProcesses,
} from '../src/products/code/livePreview/processRegistry.ts';
import type {
  LivePreviewProcessAdapter,
  LivePreviewProcessHandle,
} from '../src/products/code/livePreview/processAdapter.ts';
import { createCodeLivePreviewProcessAdapter } from '../src/products/code/livePreview/staticAdapter.ts';
import { LivePreviewSupervisor } from '../src/products/code/livePreview/supervisor.ts';
import { CodePreviewCanvasControls } from '../src/products/code/renderer/components/CodePreviewCanvasControls.tsx';
import { buildArtifactCanvasProjection } from '../src/products/shared/artifactCanvas/projection.ts';
import { DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG } from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import { ArtifactCanvasRenderIntentHub } from '../src/products/shared/artifactCanvas/renderIntent.ts';

const CHANNEL = 'channel-1';
const SURFACE = { kind: 'code_conversation' as const, surfaceId: CHANNEL };
const POLICY = {
  ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  scriptedPreviewProducerAllowlist: [
    { producerKind: 'tool' as const, producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY },
  ],
};

class FakeHandle implements LivePreviewProcessHandle {
  stopped = 0;
  constructor(readonly processId: number) {}
  onStdout(): void {}
  onStderr(): void {}
  onExit(): void {}
  async stop(): Promise<void> { this.stopped += 1; }
}

class FakeAdapter implements LivePreviewProcessAdapter {
  readonly handles: FakeHandle[] = [];
  async spawn(): Promise<LivePreviewProcessHandle> {
    const handle = new FakeHandle(5000 + this.handles.length);
    this.handles.push(handle);
    return handle;
  }
}

function makeSupervisor(adapter = new FakeAdapter(), extra: Partial<ConstructorParameters<typeof LivePreviewSupervisor>[0]> = {}) {
  return new LivePreviewSupervisor({
    config: withBuiltinLivePreviewProfiles({
      ...DEFAULT_LIVE_PREVIEW_CONFIG,
      commandProfiles: [{ ...VITE_LIVE_PREVIEW_PROFILE, enabled: true }],
    }),
    processAdapter: createCodeLivePreviewProcessAdapter(adapter),
    readinessProbe: async (url) => ({ status: url.endsWith('/.cats-preview-ready') ? 204 : 200 }),
    sleep: async () => {},
    ...extra,
  });
}

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'cats-preview-lifecycle-'));
  mkdirSync(join(root, 'site'));
  writeFileSync(join(root, 'site', 'index.html'), '<!doctype html><title>Site</title><p>hi</p>');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function makeStore() {
  return new MemoryCoreStore(upsertCoreConversation(createDefaultCoreState(), {
    id: `conversation-channel-${CHANNEL}`, title: 'Site', kind: 'code_thread', status: 'active',
  }).core);
}

async function showStatic(store: MemoryCoreStore, supervisor: LivePreviewSupervisor, root: string, previews: ReturnType<typeof createCodeConversationPreviews>) {
  const binding: CodeAgentToolGrantBinding = {
    channelId: CHANNEL, conversationId: `conversation-channel-${CHANNEL}`, workspacePath: root, actorId: null, shellExecution: true,
  };
  const shown = await runShowInCanvas({ path: 'site' }, {
    binding,
    runtimeSessionId: 'rt-1',
    updateCore: (mutator) => store.updateCore(mutator),
    supervisor,
    staticLeases: previews.staticLeases,
    policyConfig: POLICY,
    hub: new ArtifactCanvasRenderIntentHub(),
    now: () => new Date(),
  });
  return shown.structuredContent as { artifactId: string; previewId: string; previewUrl: string };
}

test('renewLease extends an active lease and ignores inactive ones', async () => {
  let now = new Date('2026-09-30T00:00:00.000Z');
  const supervisor = makeSupervisor(new FakeAdapter(), { now: () => now, portAvailable: async () => true });
  const started = await supervisor.start({
    commandProfileId: 'vite', workspace: { kind: 'code_workspace', id: 'w', rootPath: tmpdir() }, surface: SURFACE,
  });
  assert.equal(started.status, 'accepted');
  const previewId = started.status === 'accepted' ? started.previewId : '';
  assert.equal(supervisor.getLease(previewId)?.expiresAt, '2026-09-30T00:30:00.000Z');
  now = new Date('2026-09-30T00:20:00.000Z');
  assert.equal(supervisor.renewLease(previewId)?.expiresAt, '2026-09-30T00:50:00.000Z');
  await supervisor.stop(previewId);
  assert.equal(supervisor.renewLease(previewId), null);
  assert.equal(supervisor.renewLease('nope'), null);
});

test('running dev servers are recorded for the orphan sweep; static leases never are', async (t) => {
  const workspace = makeWorkspace();
  t.after(() => workspace.cleanup());
  const file = join(workspace.root, 'state', 'code-live-preview-processes.json');
  const registry = createFileLivePreviewProcessRegistry(file);
  const supervisor = makeSupervisor(new FakeAdapter(), { processRegistry: registry });
  const dev = await supervisor.start({
    commandProfileId: 'vite', workspace: { kind: 'code_workspace', id: 'w', rootPath: workspace.root }, surface: SURFACE,
  });
  const site = await supervisor.start({
    commandProfileId: 'static',
    workspace: { kind: 'code_workspace', id: 's', rootPath: workspace.root },
    artifactDirectory: join(workspace.root, 'site'),
    surface: SURFACE,
  });
  assert.equal(dev.status, 'accepted');
  assert.equal(site.status, 'accepted');
  const records = readLivePreviewProcessRecords(file);
  assert.deepEqual(records.map((record) => record.processId), [5000]);
  assert.equal(records[0]?.previewId, dev.status === 'accepted' ? dev.previewId : '');
  await supervisor.stopAll('test');
  assert.deepEqual(readLivePreviewProcessRecords(file), []);
});

test('the orphan sweep stops recorded processes that still hold their port', async (t) => {
  const workspace = makeWorkspace();
  t.after(() => workspace.cleanup());
  const file = join(workspace.root, 'state', 'processes.json');
  const registry = createFileLivePreviewProcessRegistry(file);
  registry.record({ previewId: 'p-alive', processId: 101, port: 47101, startedAt: 'x' });
  registry.record({ previewId: 'p-dead', processId: 102, port: 47102, startedAt: 'x' });
  registry.record({ previewId: 'p-reused', processId: 103, port: 47103, startedAt: 'x' });
  const killed: number[] = [];
  const result = await sweepOrphanLivePreviewProcesses(file, {
    isAlive: (pid) => pid !== 102,
    // A reused process id no longer holds the recorded port.
    portInUse: async (port) => {
      if (port === 47101) registry.record({ previewId: 'p-new', processId: 200, port: 47104, startedAt: 'y' });
      return port !== 47103;
    },
    killTree: (pid) => killed.push(pid),
  });
  assert.deepEqual(killed, [101]);
  assert.deepEqual(result, { stopped: [101], skipped: [102, 103] });
  assert.deepEqual(readLivePreviewProcessRecords(file).map((record) => record.previewId), ['p-new'],
    'a lease recorded during the sweep is kept');
  assert.deepEqual(await sweepOrphanLivePreviewProcesses(join(workspace.root, 'none.json')), { stopped: [], skipped: [] });
});

test('a conversation keeps its previews while a session takes over and stops them when the last one ends', async (t) => {
  const workspace = makeWorkspace();
  t.after(() => workspace.cleanup());
  const supervisor = makeSupervisor();
  const store = makeStore();
  const previews = createCodeConversationPreviews({
    supervisor, coreStore: store, previewServersEnabled: async () => true, releaseGraceMs: 20,
  });
  const shown = await showStatic(store, supervisor, workspace.root, previews);
  assert.equal(supervisor.getLease(shown.previewId)?.status, 'ready');

  let inUse = false;
  previews.release(CHANNEL, { immediate: false, stillInUse: () => inUse });
  previews.retain(CHANNEL);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(supervisor.getLease(shown.previewId)?.status, 'ready', 'retained by a new session');

  inUse = true;
  previews.release(CHANNEL, { immediate: true, stillInUse: () => inUse });
  assert.equal(supervisor.getLease(shown.previewId)?.status, 'ready', 'another session still uses it');

  inUse = false;
  previews.release(CHANNEL, { immediate: false, stillInUse: () => inUse });
  await waitFor(() => assert.equal(supervisor.getLease(shown.previewId)?.status, 'stopped'));
  assert.equal(supervisor.getLease(shown.previewId)?.stopReason, 'conversation_released');
  assert.equal(previews.staticLeases.has(CHANNEL), false);
});

test('after a Platform restart a static preview restarts on the same artifact (CAP-13)', async (t) => {
  const workspace = makeWorkspace();
  const before = makeSupervisor();
  const store = makeStore();
  const first = createCodeConversationPreviews({ supervisor: before, coreStore: store, previewServersEnabled: async () => false });
  const shown = await showStatic(store, before, workspace.root, first);
  await before.stopAll('platform_shutdown');

  // A new Platform process: new supervisor, same Core.
  const after = makeSupervisor();
  t.after(async () => { await after.stopAll('test'); workspace.cleanup(); });
  const previews = createCodeConversationPreviews({ supervisor: after, coreStore: store, previewServersEnabled: async () => false });
  const lost = await previews.describeArtifact(shown.artifactId);
  assert.equal(lost?.status, 'missing');
  assert.equal(lost?.kind, 'static');
  assert.equal(lost?.restartable, true);

  const restarted = await previews.restartArtifact(shown.artifactId);
  assert.equal(restarted.status, 'ready', JSON.stringify(restarted));
  const artifact = (await store.readCore()).artifacts.find((entry) => entry.id === shown.artifactId)!;
  const meta = artifact.metadata.codeLivePreview as { previewId: string };
  assert.equal(meta.previewId, restarted.status === 'ready' ? restarted.previewId : '');
  assert.match(artifact.path ?? '', /^http:\/\/127\.0\.0\.1:471\d\d$/u);
  assert.equal((await fetch(artifact.path!)).status, 200, 'the page is served again');
  const projection = buildArtifactCanvasProjection({
    core: await store.readCore(), surface: SURFACE, artifactId: shown.artifactId,
    presentationRequested: 'auto', policyConfig: POLICY, supervisorPreviewLeaseStore: after,
  });
  assert.equal(projection.status === 'ok' ? projection.projection.iframeSandboxProfile?.name : projection.status,
    'scripted-cross-origin', 'the restarted lease still grants scripts');
  assert.equal((await previews.describeArtifact(shown.artifactId))?.status, 'ready');
  assert.deepEqual(await previews.restartArtifact(shown.artifactId), restarted, 'a ready preview is left alone');
  assert.equal(previews.staticLeases.get(CHANNEL)?.previewId, meta.previewId);
});

test('a dev preview restarts only while preview servers are allowed', async (t) => {
  const workspace = makeWorkspace();
  const store = makeStore();
  const adapter = new FakeAdapter();
  const supervisor = makeSupervisor(adapter, { portAvailable: async () => true });
  t.after(async () => { await supervisor.stopAll('test'); workspace.cleanup(); });
  let allowed = false;
  const previews = createCodeConversationPreviews({ supervisor, coreStore: store, previewServersEnabled: async () => allowed });
  const started = await supervisor.start({
    commandProfileId: 'vite',
    workspace: { kind: 'code_workspace', id: `code-conversation:${CHANNEL}:dev`, rootPath: workspace.root },
    artifactDirectory: join(workspace.root, 'site'),
    surface: SURFACE,
  });
  const lease = supervisor.getLease(started.status === 'accepted' ? started.previewId : '')!;
  const { materializeLivePreviewArtifact } = await import('../src/products/code/livePreview/artifactMaterialization.ts');
  let artifactId = '';
  await store.updateCore((core) => {
    const result = materializeLivePreviewArtifact(core, lease, { entryPath: '/' });
    assert.equal(result.status, 'materialized');
    artifactId = result.status === 'materialized' ? result.artifact.id : '';
    return result.core;
  });
  supervisor.attachArtifact(lease.previewId, artifactId);
  await supervisor.stop(lease.previewId, 'user_stop');

  const stopped = await previews.describeArtifact(artifactId);
  assert.deepEqual({ kind: stopped?.kind, status: stopped?.status, restartable: stopped?.restartable },
    { kind: 'dev', status: 'stopped', restartable: true });
  const refused = await previews.restartArtifact(artifactId);
  assert.equal(refused.status === 'rejected' ? refused.error.code : refused.status, 'preview_servers_disabled');
  allowed = true;
  const restarted = await previews.restartArtifact(artifactId);
  assert.equal(restarted.status, 'ready');
  assert.equal(adapter.handles.length, 2);
  assert.equal(previews.devLeases.get(CHANNEL), restarted.status === 'ready' ? restarted.previewId : '');
  assert.equal((await previews.describeArtifact('artifact-unknown')), null);
});

test('the Code runtime wrapper reports when a conversation gains and loses sessions', async () => {
  const events: string[] = [];
  const grants = new McpSessionGrantStore<CodeAgentToolGrantBinding>();
  const wrapper = createCodeAgentToolsClientWrapper({
    grants,
    endpoint: () => 'http://127.0.0.1:1/api/code/agent-tools/mcp',
    onSessionStarted: (channelId) => events.push(`start:${channelId}`),
    onSessionEnded: (channelId, reason) => events.push(`${reason}:${channelId}:${grants.some((grant) => grant.binding.channelId === channelId)}`),
  });
  let next = 0;
  const client = wrapper.wrapClient({
    async createSession(): Promise<RuntimeSessionInfo> {
      next += 1;
      return { id: `rt-${next}`, provider: 'claude', model: null, status: 'ready', cwd: null };
    },
    async closeSession() {},
    async deleteSession() { return { status: 'deleted' }; },
  } as unknown as RuntimeClient);
  const context = { metadata: { codeAgentTools: { channelId: CHANNEL, workspacePath: '/w', shellExecution: true } } };
  await client.createSession({ provider: 'claude', context } as RuntimeSessionCreateInput);
  await client.createSession({ provider: 'claude', context } as RuntimeSessionCreateInput);
  await client.closeSession('rt-1');
  await client.deleteSession('rt-2');
  await client.closeSession('rt-unknown');
  assert.deepEqual(events, [`start:${CHANNEL}`, `start:${CHANNEL}`, `closed:${CHANNEL}:true`, `deleted:${CHANNEL}:false`]);
});

test('Code API: preview artifact state, restart and lease renewal', async (t) => {
  const workspace = makeWorkspace();
  const supervisor = makeSupervisor();
  const store = makeStore();
  const previews = createCodeConversationPreviews({ supervisor, coreStore: store, previewServersEnabled: async () => false });
  const shown = await showStatic(store, supervisor, workspace.root, previews);
  const server = createServer(async (request, response) => {
    const handled = await routeCodeLivePreviewApi({
      request, response, url: new URL(request.url ?? '/', 'http://localhost'), method: request.method ?? 'GET',
      dependencies: { conversationPreviews: previews, livePreviewSupervisor: supervisor } as never,
    });
    if (!handled) response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.close(); await supervisor.stopAll('test'); workspace.cleanup(); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const state = await (await fetch(`${base}/api/code/preview-artifacts/${shown.artifactId}`)).json() as CodePreviewArtifactState;
  assert.deepEqual({ kind: state.kind, status: state.status, previewId: state.previewId },
    { kind: 'static', status: 'ready', previewId: shown.previewId });
  assert.equal((await fetch(`${base}/api/code/preview-artifacts/nope`)).status, 404);
  const renewed = await fetch(`${base}/api/code/live-previews/${shown.previewId}/renew`, { method: 'POST' });
  assert.equal(renewed.status, 200);
  assert.equal((await fetch(`${base}/api/code/live-previews/nope/renew`, { method: 'POST' })).status, 404);

  await supervisor.stop(shown.previewId, 'expired');
  const restart = await fetch(`${base}/api/code/preview-artifacts/${shown.artifactId}/restart`, { method: 'POST' });
  assert.equal(restart.status, 200);
  assert.equal(((await restart.json()) as { status: string }).status, 'ready');
});

test('canvas controls restart a lost static preview and offer dev server controls', async (t) => {
  resetTestDom();
  const calls: string[] = [];
  let devState: Partial<CodePreviewArtifactState> = { status: 'ready' };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === '/api/code/preview-artifacts/static-1') {
      const restarted = calls.some((call) => call.endsWith('/static-1/restart'));
      return Response.json({ artifactId: 'static-1', previewId: 'p1', kind: 'static', status: restarted ? 'ready' : 'missing',
        restartable: true, previewUrl: 'http://127.0.0.1:47100/index.html', profileId: 'static', stopReason: null, expiresAt: null });
    }
    if (url === '/api/code/preview-artifacts/dev-1') {
      return Response.json({ artifactId: 'dev-1', previewId: 'p2', kind: 'dev', restartable: true,
        previewUrl: 'http://127.0.0.1:47101', profileId: 'vite', stopReason: null, expiresAt: null, ...devState });
    }
    if (url.endsWith('/logs')) return Response.json({ previewId: 'p2', logs: 'VITE ready\nlocal: http://127.0.0.1:47101/' });
    return Response.json({ status: 'ready' });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; cleanup(); });

  let refreshed = 0;
  const staticView = render(<CodePreviewCanvasControls surface={SURFACE} artifactId="static-1" onRefresh={() => { refreshed += 1; }} />);
  await waitFor(() => assert.ok(calls.includes('POST /api/code/preview-artifacts/static-1/restart')));
  await waitFor(() => assert.ok(refreshed >= 1));
  assert.equal(calls.filter((call) => call.endsWith('/restart')).length, 1, 'restarts once');
  await waitFor(() => assert.ok(calls.includes('POST /api/code/live-previews/p1/renew')));
  assert.equal(staticView.container.textContent, '', 'a healthy static preview shows no controls');
  staticView.unmount();

  const dev = render(<CodePreviewCanvasControls surface={SURFACE} artifactId="dev-1" onRefresh={() => {}} />);
  await dev.findByText(/Running/u);
  assert.equal(dev.getByRole('link', { name: /Open in browser/u }).getAttribute('href'), 'http://127.0.0.1:47101');
  fireEvent.click(dev.getByRole('button', { name: 'Logs' }));
  await dev.findByText(/VITE ready/u);
  devState = { status: 'stopped' };
  fireEvent.click(dev.getByRole('button', { name: 'Stop' }));
  await waitFor(() => assert.ok(calls.includes('POST /api/code/live-previews/p2/stop')));
  fireEvent.click(await dev.findByRole('button', { name: 'Restart' }));
  await waitFor(() => assert.ok(calls.includes('POST /api/code/preview-artifacts/dev-1/restart')));
  assert.equal(dev.queryByRole('link', { name: /Open in browser/u }), null);
});

test('the canvas pane gives product controls their own row', () => {
  const css = readFileSync(join(process.cwd(), 'src/products/shared/renderer/styles/artifact-canvas.css'), 'utf8');
  assert.match(css, /\.artifactCanvasPane:has\(> \.artifactCanvasControls\) \{\s*grid-template-rows: auto auto minmax\(0, 1fr\);/u);
  const routes = readFileSync(join(process.cwd(), 'src/products/code/renderer/AppRoutes.tsx'), 'utf8');
  assert.match(routes, /chatCanvasControls: CodePreviewCanvasControls/u);
});
