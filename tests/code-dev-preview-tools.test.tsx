import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { routeCodeLivePreviewApi } from '../src/products/code/api/livePreviewRoutes.ts';
import type { CodeAgentToolGrantBinding } from '../src/products/code/agentTools/contracts.ts';
import {
  detectDevServerProfile,
  isViteDevCommand,
  parseScriptCommand,
  runGetPreviewStatus,
  runStartDevPreview,
  runStopPreview,
  type DevPreviewContext,
} from '../src/products/code/agentTools/devPreview.ts';
import { CODE_AGENT_PREVIEW_POLICY } from '../src/products/code/agentTools/policy.ts';
import { hasShellExecutionPermission } from '../src/products/code/agentTools/shellPermission.ts';
import {
  DEFAULT_LIVE_PREVIEW_CONFIG,
  STATIC_LIVE_PREVIEW_PROFILE,
  VITE_LIVE_PREVIEW_PROFILE,
  withBuiltinLivePreviewProfiles,
} from '../src/products/code/livePreview/contracts.ts';
import { createCodeLivePreviewSupervisor, createOptInProcessAdapter } from '../src/products/code/livePreview/host.ts';
import type {
  LivePreviewProcessAdapter,
  LivePreviewProcessExit,
  LivePreviewProcessHandle,
  LivePreviewProcessSpawnInput,
} from '../src/products/code/livePreview/processAdapter.ts';
import { resolveLivePreviewExecutable } from '../src/products/code/livePreview/realProcessAdapter.ts';
import { createCodeLivePreviewProcessAdapter } from '../src/products/code/livePreview/staticAdapter.ts';
import { LivePreviewSupervisor } from '../src/products/code/livePreview/supervisor.ts';
import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
} from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import { ArtifactCanvasRenderIntentHub } from '../src/products/shared/artifactCanvas/renderIntent.ts';
import type { ArtifactCanvasNavigateIntent } from '../src/products/shared/artifactCanvas/contracts.ts';
import { resolvePlatformPreferencesPath } from '../src/shared/platformPreferences.ts';

const CHANNEL = 'channel-1';

function makeWorkspace(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), 'cats-dev-preview-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeViteProject(root: string, options: { script?: string; installed?: boolean } = {}): string {
  const dir = join(root, 'pomodoro');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'pomodoro',
    scripts: { dev: options.script ?? 'vite', build: 'vite build' },
    devDependencies: { vite: '^6.0.0' },
  }));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Pomodoro</title>');
  if (options.installed !== false) {
    mkdirSync(join(dir, 'node_modules', 'vite', 'bin'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), '');
  }
  return dir;
}

class FakeHandle implements LivePreviewProcessHandle {
  stopped = 0;
  private readonly stderr: Array<(chunk: string) => void> = [];
  constructor(readonly processId: number, private readonly failureLog: string | null) {}
  onStdout(): void {}
  onStderr(listener: (chunk: string) => void): void { this.stderr.push(listener); }
  onExit(listener: (exit: LivePreviewProcessExit) => void): void {
    // The supervisor subscribes to exit last; a failing server logs, then exits.
    if (this.failureLog === null) return;
    for (const log of this.stderr) log(this.failureLog);
    listener({ code: 1, signal: null });
  }
  async stop(): Promise<void> { this.stopped += 1; }
}

class FakeAdapter implements LivePreviewProcessAdapter {
  readonly spawned: LivePreviewProcessSpawnInput[] = [];
  readonly handles: FakeHandle[] = [];
  failNext: string | null = null;
  async spawn(input: LivePreviewProcessSpawnInput): Promise<LivePreviewProcessHandle> {
    this.spawned.push(input);
    const handle = new FakeHandle(4000 + this.handles.length, this.failNext);
    this.failNext = null;
    this.handles.push(handle);
    return handle;
  }
}

function setup(
  root: string,
  { binding, ...overrides }: Partial<Omit<DevPreviewContext, 'binding'>> & { binding?: Partial<CodeAgentToolGrantBinding> } = {},
) {
  const adapter = new FakeAdapter();
  const supervisor = new LivePreviewSupervisor({
    config: withBuiltinLivePreviewProfiles({
      ...DEFAULT_LIVE_PREVIEW_CONFIG,
      commandProfiles: [{ ...VITE_LIVE_PREVIEW_PROFILE, enabled: true }],
    }),
    processAdapter: createCodeLivePreviewProcessAdapter(adapter),
    // The static profile's readiness is its own server; the fake Vite is ready at once.
    readinessProbe: async (url) => (url.endsWith(STATIC_LIVE_PREVIEW_PROFILE.readiness.path)
      ? { status: 204 } : { status: adapter.handles.at(-1)?.stopped ? 0 : 200 }),
    sleep: async () => {},
  });
  const conversationId = `conversation-channel-${CHANNEL}`;
  const store = new MemoryCoreStore(upsertCoreConversation(createDefaultCoreState(), {
    id: conversationId, title: 'Pomodoro', kind: 'code_thread', status: 'active',
  }).core);
  const hub = new ArtifactCanvasRenderIntentHub();
  const context: DevPreviewContext = {
    binding: {
      channelId: CHANNEL,
      conversationId,
      workspacePath: root,
      actorId: 'cat-1',
      shellExecution: true,
      ...binding,
    },
    supervisor,
    devLeases: new Map(),
    staticLeases: new Map(),
    previewServersEnabled: async () => true,
    updateCore: (mutator) => store.updateCore(mutator),
    policyConfig: DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
    hub,
    now: () => new Date(),
    ...overrides,
  };
  return { adapter, supervisor, store, hub, context };
}

function result(value: { structuredContent?: unknown; isError?: boolean }) {
  return value.structuredContent as Record<string, unknown> & { error?: { code: string; message: string } };
}

test('Vite dev scripts are recognized from the command, not the script name', () => {
  assert.equal(isViteDevCommand('vite'), true);
  assert.equal(isViteDevCommand('vite dev'), true);
  assert.equal(isViteDevCommand('vite serve --open'), true);
  assert.equal(isViteDevCommand('vite --port 3000'), true);
  assert.equal(isViteDevCommand('vite build'), false);
  assert.equal(isViteDevCommand('vite preview'), false);
  assert.equal(isViteDevCommand('next dev'), false);
  assert.equal(isViteDevCommand('tsc && vite'), false);
});

test('dev preview detection names the missing piece and picks a profile', async () => {
  const workspace = makeWorkspace();
  try {
    const dir = writeViteProject(workspace.root, { installed: false });
    const code = async (directory: string, script: string) => {
      const detected = await detectDevServerProfile(directory, script, workspace.root);
      return 'code' in detected ? detected.code : detected.profileId;
    };
    assert.equal(await code(dir, 'dev'), 'dependencies_missing');
    assert.equal(await code(dir, 'start'), 'script_missing');
    const missing = await detectDevServerProfile(dir, 'start');
    assert.match('message' in missing ? missing.message : '', /scripts: dev, build/u);
    assert.equal(await code(dir, 'build'), 'profile_unsupported');
    assert.equal(await code(workspace.root, 'dev'), 'package_json_missing');
    writeFileSync(join(dir, 'package.json'), '{');
    assert.equal(await code(dir, 'dev'), 'package_json_invalid');
    const installed = writeViteProject(join(workspace.root, 'other'));
    assert.equal(await code(installed, 'dev'), 'vite', 'Vite in the directory runs directly');
  } finally {
    workspace.cleanup();
  }
});

test('npm-script adapters follow the last command of the script (PLAN-116 D3)', async () => {
  const workspace = makeWorkspace();
  try {
    const project = (name: string, scripts: Record<string, string>, dependencies: Record<string, string> = { x: '1' }) => {
      const dir = join(workspace.root, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts, dependencies }));
      return dir;
    };
    // Dependencies hoisted to a parent (a monorepo) count as installed.
    mkdirSync(join(workspace.root, 'node_modules'));
    const pick = async (dir: string, script = 'dev') => {
      const detected = await detectDevServerProfile(dir, script, workspace.root);
      return 'code' in detected ? detected.code : detected.profileId;
    };
    assert.equal(await pick(project('hoisted-vite', { dev: 'vite' })), 'npm-script:vite');
    assert.equal(await pick(project('built-first', { dev: 'tsc -b && vite --open' })), 'npm-script:vite');
    assert.equal(await pick(project('env-vite', { dev: 'cross-env NODE_ENV=development vite' })), 'npm-script:vite');
    assert.equal(await pick(project('next', { dev: 'next dev --turbo' })), 'npm-script:next');
    assert.equal(await pick(project('astro', { dev: 'astro dev' })), 'npm-script:astro');
    assert.equal(await pick(project('nuxt', { dev: 'nuxi dev' })), 'npm-script:nuxt');
    assert.equal(await pick(project('webpack', { start: 'webpack serve --mode development' }), 'start'), 'npm-script:webpack');
    assert.equal(await pick(project('parcel', { dev: 'parcel index.html' })), 'npm-script:parcel');
    assert.equal(await pick(project('cra', { start: 'react-scripts start' }), 'start'), 'npm-script');
    const bare = join(workspace.root, 'outside');
    mkdirSync(bare);
    writeFileSync(join(bare, 'package.json'), JSON.stringify({ scripts: { dev: 'node server.js' } }));
    assert.equal(await pick(bare), 'npm-script', 'no dependencies, nothing to install');
    assert.deepEqual(parseScriptCommand('FOO=1 BAR=2 next dev'), { tool: 'next', subcommand: 'dev', simple: false });
  } finally {
    workspace.cleanup();
  }
});

test('shell permission follows the session posture (CAP-08)', () => {
  assert.equal(hasShellExecutionPermission({}), true);
  assert.equal(hasShellExecutionPermission({ permissionMode: 'skip' }), true);
  assert.equal(hasShellExecutionPermission({ workspaceAccess: 'read_only' }), false);
  assert.equal(hasShellExecutionPermission({ permissionMode: 'default' }), false);
  assert.equal(hasShellExecutionPermission({ permissionMode: 'whitelist', allowedTools: ['Read'] }), false);
  assert.equal(hasShellExecutionPermission({ permissionMode: 'whitelist', allowedTools: ['Bash'] }), true);
  assert.equal(hasShellExecutionPermission({ permissionMode: 'whitelist', allowedTools: ['exec_command'] }), true);
  assert.equal(hasShellExecutionPermission({ permissionMode: 'whitelist', allowedTools: ['BashOutput'] }), false);
});

test('start_dev_preview refuses before spawning unless the user and the session allow it', async () => {
  const workspace = makeWorkspace();
  try {
    writeViteProject(workspace.root);
    const off = setup(workspace.root, { previewServersEnabled: async () => false });
    const disabled = result(await runStartDevPreview({ directory: 'pomodoro' }, off.context));
    assert.equal(disabled.error?.code, 'preview_servers_disabled');
    assert.match(disabled.error?.message ?? '', /Settings > Code/u);

    const noShell = setup(workspace.root, { binding: { shellExecution: false } });
    assert.equal(result(await runStartDevPreview({ directory: 'pomodoro' }, noShell.context)).error?.code,
      'shell_permission_required');
    assert.equal(off.adapter.spawned.length + noShell.adapter.spawned.length, 0);

    const on = setup(workspace.root);
    assert.equal(result(await runStartDevPreview({ directory: '../outside' }, on.context)).error?.code, 'path_not_found');
    assert.equal(result(await runStartDevPreview({ directory: 'pomodoro/index.html' }, on.context)).error?.code,
      'directory_required');
    assert.equal(result(await runStartDevPreview({ directory: 'pomodoro', script: 'dev; rm -rf /' }, on.context)).error?.code,
      'script_invalid');
    assert.equal(result(await runStartDevPreview({ directory: '.' }, on.context)).error?.code, 'package_json_missing');
    assert.equal(on.adapter.spawned.length, 0);
  } finally {
    workspace.cleanup();
  }
});

test('start_dev_preview runs the reviewed Vite profile, shows it and replaces the previous one', async () => {
  const workspace = makeWorkspace();
  const { context, adapter, supervisor, store, hub } = setup(workspace.root);
  try {
    const dir = writeViteProject(workspace.root);
    const intents: ArtifactCanvasNavigateIntent[] = [];
    hub.subscribe({
      surface: { kind: 'code_conversation', surfaceId: CHANNEL },
      sessionId: 'browser-1',
      send: (intent) => intents.push(intent),
    });

    // A static page is already open, as in the M2 path; it must not block the dev server.
    mkdirSync(join(workspace.root, 'notes'));
    writeFileSync(join(workspace.root, 'notes', 'index.html'), '<p>notes</p>');
    const staticLease = await supervisor.start({
      commandProfileId: STATIC_LIVE_PREVIEW_PROFILE.id,
      workspace: { kind: 'code_workspace', id: `code-conversation:${CHANNEL}`, rootPath: workspace.root },
      artifactDirectory: join(workspace.root, 'notes'),
      surface: { kind: 'code_conversation', surfaceId: CHANNEL },
    });
    assert.equal(staticLease.status, "accepted", JSON.stringify(staticLease));

    const started = result(await runStartDevPreview({ directory: 'pomodoro', title: 'Pomodoro' }, context));
    assert.equal(started.error, undefined, JSON.stringify(started));
    assert.equal(started.profileId, 'vite');
    assert.match(String(started.canvasPath), /^\/code\/chats\/channel-1\/canvas\//u);
    assert.match(String(started.previewUrl), /^http:\/\/127\.0\.0\.1:471\d\d\/$/u);
    assert.equal(adapter.spawned.length, 1);
    assert.equal(adapter.spawned[0]?.executable, 'node');
    assert.deepEqual(adapter.spawned[0]?.args.slice(0, 1), ['node_modules/vite/bin/vite.js']);
    assert.equal(adapter.spawned[0]?.cwd, dir);
    assert.equal(intents.at(-1)?.artifactId, started.artifactId);
    const artifact = (await store.readCore()).artifacts.find((entry) => entry.id === started.artifactId);
    assert.equal(artifact?.title, 'Pomodoro');
    assert.equal(supervisor.getLease(String(started.previewId))?.artifactId, started.artifactId);

    const status = result(runGetPreviewStatus({ previewId: started.previewId }, context));
    assert.equal(status.status, 'ready');
    assert.equal(status.previewUrl, started.previewUrl);

    const again = result(await runStartDevPreview({ directory: 'pomodoro' }, context));
    assert.equal(adapter.handles[0]?.stopped, 1, 'the earlier dev server was stopped');
    assert.equal(supervisor.getLease(String(started.previewId))?.stopReason, 'replaced');
    assert.equal(context.devLeases.get(CHANNEL), again.previewId);

    assert.deepEqual(result(await runStopPreview({ previewId: again.previewId }, context)), { status: 'stopped' });
    assert.deepEqual(result(await runStopPreview({ previewId: again.previewId }, context)), { status: 'stopped' });
    assert.equal(context.devLeases.has(CHANNEL), false);
    assert.equal(result(runGetPreviewStatus({ previewId: again.previewId }, context)).status, 'stopped');

    // Another conversation's grant cannot read or stop this conversation's preview.
    const other = { ...context, binding: { ...context.binding, channelId: 'channel-2' } };
    assert.equal(result(runGetPreviewStatus({ previewId: started.previewId }, other)).error?.code, 'preview_not_found');
    assert.equal(result(await runStopPreview({ previewId: started.previewId }, other)).error?.code, 'preview_not_found');
  } finally {
    await supervisor.stopAll('test_cleanup');
    workspace.cleanup();
  }
});

test('a failed start returns the error with a bounded log tail', async () => {
  const workspace = makeWorkspace();
  try {
    writeViteProject(workspace.root);
    const { context, adapter } = setup(workspace.root);
    adapter.failNext = `${Array.from({ length: 150 }, (_, index) => `line ${index}`).join('\n')}\n\u001b[31mError: Cannot find module 'react'\u001b[39m\n`;
    const failed = result(await runStartDevPreview({ directory: 'pomodoro' }, context));
    assert.equal(failed.error?.code, 'live_preview_process_exited');
    const tail = String(failed.logTail).split('\n');
    assert.equal(tail.length, 80);
    assert.equal(tail.at(-1), "Error: Cannot find module 'react'");
    assert.equal(context.devLeases.has(CHANNEL), false);
  } finally {
    workspace.cleanup();
  }
});

test('the policy names the dev preview tools', () => {
  for (const tool of ['start_dev_preview', 'get_preview_status', 'stop_preview', 'show_in_canvas']) {
    assert.ok(CODE_AGENT_PREVIEW_POLICY.includes(`mcp__cats__${tool}`), tool);
  }
  assert.match(CODE_AGENT_PREVIEW_POLICY, /install dependencies first/u);
});

test('the host runs a profile\'s node on its own runtime', () => {
  assert.deepEqual(resolveLivePreviewExecutable('node', { execPath: '/opt/node', electron: false }),
    { executable: '/opt/node', env: {} });
  assert.deepEqual(resolveLivePreviewExecutable('node', { execPath: 'C:/Cats/Cats.exe', electron: true }),
    { executable: 'C:/Cats/Cats.exe', env: { ELECTRON_RUN_AS_NODE: '1' } });
  assert.deepEqual(resolveLivePreviewExecutable('npm', { execPath: '/opt/node', electron: false }),
    { executable: 'npm', env: {} });
});

test('process previews are opt-in: the host spawns only while the user allows it', async () => {
  let allowed = false;
  const real = new FakeAdapter();
  const gated = createOptInProcessAdapter(async () => allowed, real);
  const input = {
    commandProfileId: 'vite', executable: 'node', args: [], cwd: '.', env: {}, port: 47100, origin: 'http://127.0.0.1:47100',
  };
  await assert.rejects(gated.spawn(input), /Cats may run preview servers/u);
  allowed = true;
  await gated.spawn(input);
  assert.equal(real.spawned.length, 1);

  // Without the opt-in hook the default config has no enabled process profile.
  const plain = createCodeLivePreviewSupervisor(DEFAULT_LIVE_PREVIEW_CONFIG);
  const rejected = await plain.start({
    commandProfileId: 'vite',
    workspace: { kind: 'code_workspace', id: 'w', rootPath: tmpdir() },
    surface: { kind: 'code_conversation', surfaceId: CHANNEL },
  });
  assert.equal(rejected.status === 'rejected' ? rejected.error.code : rejected.status, 'live_preview_command_profile_not_found');
});

test('Settings > Code preview servers: opt-in, and turning it off stops dev previews', async (t) => {
  const workspace = makeWorkspace();
  t.after(() => workspace.cleanup());
  const chatStatePath = join(workspace.root, 'platform', 'state', 'chat-state.local.json');
  const stops: string[] = [];
  const supervisor = { stopProcessPreviews: async (reason: string) => { stops.push(reason); return ['preview-1']; } };
  const server = createServer(async (request, response) => {
    const handled = await routeCodeLivePreviewApi({
      request,
      response,
      url: new URL(request.url ?? '/', 'http://localhost'),
      method: request.method ?? 'GET',
      dependencies: { config: { chatStatePath }, livePreviewSupervisor: supervisor } as never,
    });
    if (!handled) response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/code/preview-settings`;
  const post = (body: unknown) => fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

  assert.deepEqual(await (await fetch(url)).json(), { previewServersEnabled: false });
  assert.equal((await post({ previewServersEnabled: 'yes' })).status, 400);
  assert.deepEqual(await (await post({ previewServersEnabled: true })).json(),
    { previewServersEnabled: true, stoppedPreviewIds: [] });
  assert.deepEqual(await (await fetch(url)).json(), { previewServersEnabled: true });
  assert.deepEqual(stops, []);
  assert.deepEqual(await (await post({ previewServersEnabled: false })).json(),
    { previewServersEnabled: false, stoppedPreviewIds: ['preview-1'] });
  assert.deepEqual(stops, ['preview_servers_disabled']);
  const stored = JSON.parse(readFileSync(resolvePlatformPreferencesPath(chatStatePath), 'utf8'));
  assert.equal(stored.codePreviewServersEnabled, false);
});

test('the supervisor skips loopback ports another program holds', async () => {
  const adapter = new FakeAdapter();
  const probed: number[] = [];
  const supervisor = new LivePreviewSupervisor({
    config: { ...DEFAULT_LIVE_PREVIEW_CONFIG, commandProfiles: [{ ...VITE_LIVE_PREVIEW_PROFILE, enabled: true }] },
    processAdapter: adapter,
    readinessProbe: async () => ({ status: 200 }),
    sleep: async () => {},
    portAvailable: async (host, port) => {
      probed.push(port);
      assert.equal(host, '127.0.0.1');
      return port !== 47_100;
    },
  });
  const started = await supervisor.start({
    commandProfileId: 'vite',
    workspace: { kind: 'code_workspace', id: 'w', rootPath: tmpdir() },
    surface: { kind: 'code_conversation', surfaceId: CHANNEL },
  });
  assert.equal(started.status === 'accepted' ? started.origin : started.status, 'http://127.0.0.1:47101');
  assert.deepEqual(probed, [47_100, 47_101]);
  assert.equal(adapter.spawned[0]?.port, 47_101);
  await supervisor.stopAll('test_cleanup');
});
