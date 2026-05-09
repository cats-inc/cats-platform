import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_LIVE_PREVIEW_CONFIG,
  type LivePreviewCommandProfile,
  type LivePreviewConfig,
} from '../src/products/code/livePreview/contracts.ts';
import {
  type LivePreviewProcessAdapter,
  type LivePreviewProcessExit,
  type LivePreviewProcessHandle,
  type LivePreviewProcessSpawnInput,
  type LivePreviewProcessStopOptions,
} from '../src/products/code/livePreview/processAdapter.ts';
import { LivePreviewSupervisor } from '../src/products/code/livePreview/supervisor.ts';

const VITE_PROFILE: LivePreviewCommandProfile = {
  id: 'vite',
  label: 'Vite dev server',
  executable: 'npm',
  args: ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '{port}'],
  workingDirectory: 'workspaceRoot',
  env: { CATS_PREVIEW_PORT: '{port}' },
  port: { mode: 'argument', name: '--port' },
  readiness: { path: '/', timeoutMs: 10, intervalMs: 5, expectedStatus: 200 },
  stop: { graceMs: 2_000, killProcessTree: true },
};

test('LivePreviewSupervisor starts a ready preview with leased port and bounded logs', async () => {
  const adapter = new FakeProcessAdapter();
  const supervisor = new LivePreviewSupervisor({
    config: baseConfig({ logMaxBytes: 8 }),
    processAdapter: adapter,
    readinessProbe: async (url) => {
      assert.equal(url, 'http://127.0.0.1:47100/');
      return { status: 200 };
    },
    sleep: async () => {},
    idFactory: () => 'preview-ready',
  });

  const result = await supervisor.start(startRequest());

  assert.equal(result.status, 'accepted');
  assert.deepEqual(adapter.spawned[0], {
    commandProfileId: 'vite',
    executable: 'npm',
    args: ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '47100'],
    cwd: 'C:/repo/app',
    env: { CATS_PREVIEW_PORT: '47100' },
    port: 47100,
    origin: 'http://127.0.0.1:47100',
  });
  const lease = supervisor.getLease('preview-ready');
  assert.equal(lease?.status, 'ready');
  assert.equal(lease?.origin, 'http://127.0.0.1:47100');

  adapter.handles[0]?.emitStdout('hello');
  adapter.handles[0]?.emitStderr(' world');
  assert.equal(supervisor.readLogs('preview-ready'), 'lo world');
});

test('LivePreviewSupervisor releases a port after spawn failure', async () => {
  const adapter = new FakeProcessAdapter();
  adapter.nextSpawnError = new Error('spawn denied');
  const supervisor = new LivePreviewSupervisor({
    config: baseConfig(),
    processAdapter: adapter,
    readinessProbe: async () => ({ status: 200 }),
    sleep: async () => {},
    idFactory: createSequentialId('preview-spawn'),
  });

  const failed = await supervisor.start(startRequest());
  assert.equal(failed.status, 'rejected');
  if (failed.status === 'rejected') {
    assert.equal(failed.error.code, 'live_preview_spawn_failed');
  }

  const retried = await supervisor.start(startRequest());
  assert.equal(retried.status, 'accepted');
  assert.equal(adapter.spawned[1]?.port, 47100);
});

test('LivePreviewSupervisor stops and releases after readiness timeout', async () => {
  const adapter = new FakeProcessAdapter();
  let probeCalls = 0;
  const supervisor = new LivePreviewSupervisor({
    config: baseConfig(),
    processAdapter: adapter,
    readinessProbe: async () => {
      probeCalls += 1;
      return { status: probeCalls <= 2 ? 503 : 200 };
    },
    sleep: async () => {},
    idFactory: () => 'preview-timeout',
  });

  const result = await supervisor.start(startRequest());

  assert.equal(result.status, 'rejected');
  if (result.status === 'rejected') {
    assert.equal(result.error.code, 'live_preview_readiness_timeout');
  }
  assert.equal(adapter.handles[0]?.stopCalls.length, 1);
  assert.equal(supervisor.getLease('preview-timeout')?.status, 'failed');

  const retry = await supervisor.start({ ...startRequest(), workspace: workspace('workspace-2') });
  assert.equal(retry.status, 'accepted');
  assert.equal(adapter.spawned[1]?.port, 47100);
});

test('LivePreviewSupervisor reports process exit before readiness', async () => {
  const adapter = new FakeProcessAdapter();
  let firstProbe = true;
  const supervisor = new LivePreviewSupervisor({
    config: baseConfig(),
    processAdapter: adapter,
    readinessProbe: async () => {
      if (firstProbe) {
        firstProbe = false;
        adapter.handles[0]?.emitExit({ code: 1, signal: null });
      }
      return { status: 503 };
    },
    sleep: async () => {},
    idFactory: () => 'preview-exit',
  });

  const result = await supervisor.start(startRequest());

  assert.equal(result.status, 'rejected');
  if (result.status === 'rejected') {
    assert.equal(result.error.code, 'live_preview_process_exited');
  }
  assert.equal(supervisor.getLease('preview-exit')?.status, 'failed');
});

test('LivePreviewSupervisor stop is idempotent and releases port', async () => {
  const adapter = new FakeProcessAdapter();
  const supervisor = new LivePreviewSupervisor({
    config: baseConfig(),
    processAdapter: adapter,
    readinessProbe: async () => ({ status: 200 }),
    sleep: async () => {},
    idFactory: () => 'preview-stop',
  });

  assert.equal((await supervisor.start(startRequest())).status, 'accepted');
  assert.equal((await supervisor.stop('preview-stop')).status, 'accepted');
  assert.equal((await supervisor.stop('preview-stop')).status, 'accepted');
  assert.equal(adapter.handles[0]?.stopCalls.length, 1);
  assert.equal(supervisor.getLease('preview-stop')?.status, 'stopped');

  const retry = await supervisor.start({ ...startRequest(), workspace: workspace('workspace-2') });
  assert.equal(retry.status, 'accepted');
  assert.equal(adapter.spawned[1]?.port, 47100);
});

test('LivePreviewSupervisor enforces concurrency and port availability limits', async () => {
  const adapter = new FakeProcessAdapter();
  const singleConcurrency = new LivePreviewSupervisor({
    config: baseConfig({
      portRange: { start: 47_100, end: 47_101 },
      maxConcurrentGlobal: 1,
      maxConcurrentPerWorkspace: 1,
    }),
    processAdapter: adapter,
    readinessProbe: async () => ({ status: 200 }),
    sleep: async () => {},
    idFactory: createSequentialId('preview-limit'),
  });
  assert.equal((await singleConcurrency.start(startRequest())).status, 'accepted');
  const concurrencyRejected = await singleConcurrency.start({
    ...startRequest(),
    workspace: workspace('workspace-2'),
  });
  assert.equal(concurrencyRejected.status, 'rejected');
  if (concurrencyRejected.status === 'rejected') {
    assert.equal(concurrencyRejected.error.code, 'live_preview_concurrency_limit_exceeded');
  }

  const portLimited = new LivePreviewSupervisor({
    config: baseConfig({
      maxConcurrentGlobal: 3,
      maxConcurrentPerWorkspace: 3,
    }),
    processAdapter: new FakeProcessAdapter(),
    readinessProbe: async () => ({ status: 200 }),
    sleep: async () => {},
    idFactory: createSequentialId('preview-port'),
  });
  assert.equal((await portLimited.start(startRequest())).status, 'accepted');
  const portRejected = await portLimited.start({
    ...startRequest(),
    workspace: workspace('workspace-2'),
  });
  assert.equal(portRejected.status, 'rejected');
  if (portRejected.status === 'rejected') {
    assert.equal(portRejected.error.code, 'live_preview_port_unavailable');
  }
});

test('LivePreviewSupervisor expires active leases', async () => {
  const adapter = new FakeProcessAdapter();
  let now = new Date('2026-05-09T00:00:00.000Z');
  const supervisor = new LivePreviewSupervisor({
    config: baseConfig({ defaultLeaseTtlMs: 100 }),
    processAdapter: adapter,
    readinessProbe: async () => ({ status: 200 }),
    now: () => now,
    sleep: async () => {},
    idFactory: () => 'preview-expire',
  });

  assert.equal((await supervisor.start(startRequest())).status, 'accepted');
  now = new Date('2026-05-09T00:00:00.101Z');
  assert.deepEqual(await supervisor.expireLeases(now), ['preview-expire']);
  assert.equal(supervisor.getLease('preview-expire')?.status, 'expired');
  assert.equal(adapter.handles[0]?.stopCalls.length, 1);
});

test('LivePreviewSupervisor reports cleanup failure and releases the port', async () => {
  const adapter = new FakeProcessAdapter();
  const supervisor = new LivePreviewSupervisor({
    config: baseConfig(),
    processAdapter: adapter,
    readinessProbe: async () => ({ status: 200 }),
    sleep: async () => {},
    idFactory: createSequentialId('preview-cleanup'),
  });

  assert.equal((await supervisor.start(startRequest())).status, 'accepted');
  adapter.handles[0]!.nextStopError = new Error('kill failed');
  const stopped = await supervisor.stop('preview-cleanup-0');
  assert.equal(stopped.status, 'rejected');
  if (stopped.status === 'rejected') {
    assert.equal(stopped.error.code, 'live_preview_stop_failed');
  }
  assert.equal(supervisor.getLease('preview-cleanup-0')?.status, 'failed');

  const retry = await supervisor.start({ ...startRequest(), workspace: workspace('workspace-2') });
  assert.equal(retry.status, 'accepted');
  assert.equal(adapter.spawned[1]?.port, 47100);
});

function baseConfig(overrides: Partial<LivePreviewConfig> = {}): LivePreviewConfig {
  return {
    ...DEFAULT_LIVE_PREVIEW_CONFIG,
    enabled: true,
    portRange: { start: 47_100, end: 47_100 },
    commandProfiles: [VITE_PROFILE],
    ...overrides,
  };
}

function startRequest(): Record<string, unknown> {
  return {
    commandProfileId: 'vite',
    workspace: workspace('workspace-1'),
    surface: {
      kind: 'code_task',
      surfaceId: 'task-1',
    },
  };
}

function workspace(id: string): Record<string, unknown> {
  return {
    kind: 'code_workspace',
    id,
    rootPath: 'C:/repo/app',
  };
}

function createSequentialId(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}-${next++}`;
}

class FakeProcessAdapter implements LivePreviewProcessAdapter {
  readonly spawned: LivePreviewProcessSpawnInput[] = [];
  readonly handles: FakeProcessHandle[] = [];
  nextSpawnError: Error | null = null;

  async spawn(input: LivePreviewProcessSpawnInput): Promise<LivePreviewProcessHandle> {
    this.spawned.push(input);
    if (this.nextSpawnError) {
      const error = this.nextSpawnError;
      this.nextSpawnError = null;
      throw error;
    }
    const handle = new FakeProcessHandle(this.handles.length + 1000);
    this.handles.push(handle);
    return handle;
  }
}

class FakeProcessHandle implements LivePreviewProcessHandle {
  readonly stopCalls: LivePreviewProcessStopOptions[] = [];
  nextStopError: Error | null = null;
  private readonly stdoutListeners: Array<(chunk: string) => void> = [];
  private readonly stderrListeners: Array<(chunk: string) => void> = [];
  private readonly exitListeners: Array<(exit: LivePreviewProcessExit) => void> = [];

  constructor(readonly processId: number) {}

  onStdout(listener: (chunk: string) => void): void {
    this.stdoutListeners.push(listener);
  }

  onStderr(listener: (chunk: string) => void): void {
    this.stderrListeners.push(listener);
  }

  onExit(listener: (exit: LivePreviewProcessExit) => void): void {
    this.exitListeners.push(listener);
  }

  async stop(options: LivePreviewProcessStopOptions): Promise<void> {
    this.stopCalls.push(options);
    if (this.nextStopError) {
      const error = this.nextStopError;
      this.nextStopError = null;
      throw error;
    }
  }

  emitStdout(chunk: string): void {
    for (const listener of this.stdoutListeners) {
      listener(chunk);
    }
  }

  emitStderr(chunk: string): void {
    for (const listener of this.stderrListeners) {
      listener(chunk);
    }
  }

  emitExit(exit: LivePreviewProcessExit): void {
    for (const listener of this.exitListeners) {
      listener(exit);
    }
  }
}
