import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { DesktopHostConfig } from './config.js';
import type { ManagedServiceName, ManagedServiceSnapshot } from './contracts.js';
import {
  waitForServiceReadiness,
  type AppHealthPayload,
  type RuntimeDiagnosticsHealthPayload,
} from './readiness.js';

export interface ManagedServiceSpec {
  name: ManagedServiceName;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  healthUrl: string;
}

interface ManagedServiceHandle {
  child: ChildProcessWithoutNullStreams | null;
  snapshot: ManagedServiceSnapshot;
  expectedExit: boolean;
}

interface ProcessSupervisorDependencies {
  spawn?: typeof spawn;
  now?: () => Date;
  waitForServiceReadiness?: typeof waitForServiceReadiness;
  onStateChange?: (snapshot: ManagedServiceSnapshot) => void;
}

function writeTaggedOutput(
  stream: NodeJS.WriteStream,
  serviceName: ManagedServiceName,
  chunk: Buffer,
): void {
  const text = chunk.toString('utf8');
  const normalized = text.replace(/\r?\n$/u, '');
  if (!normalized) {
    return;
  }
  stream.write(`[${serviceName}] ${normalized}\n`);
}

function createInitialSnapshot(name: ManagedServiceName, healthUrl: string): ManagedServiceSnapshot {
  return {
    name,
    status: 'stopped',
    ready: false,
    pid: null,
    startedAt: null,
    healthUrl,
    error: null,
    exitCode: null,
  };
}

async function ensureLaunchAssets(config: DesktopHostConfig): Promise<void> {
  await access(config.paths.appEntryScript);
  await access(config.paths.runtimeEntryScript);
  await access(config.paths.preloadScript);
  await mkdir(dirname(config.paths.appStatePath), { recursive: true });
  await mkdir(config.paths.runtimeDataDir, { recursive: true });
  await mkdir(config.paths.runtimeSessionBaseDir, { recursive: true });
  await mkdir(dirname(config.paths.runtimeConfigPath), { recursive: true });
}

export function buildManagedServiceSpecs(
  config: DesktopHostConfig,
  env: NodeJS.ProcessEnv = process.env,
): ManagedServiceSpec[] {
  return [
    {
      name: 'cats-runtime',
      command: process.execPath,
      args: [
        config.paths.runtimeEntryScript,
        '--startup-mode=app-managed',
        '--managed-by=cats-electron',
        '--ready-output=json',
      ],
      cwd: config.runtimePackageRoot,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
        CATS_RUNTIME_HOST: config.runtimeHost,
        CATS_RUNTIME_PORT: String(config.runtimePort),
        CATS_RUNTIME_DATA_DIR: config.paths.runtimeDataDir,
        CATS_RUNTIME_SESSION_BASE_DIR: config.paths.runtimeSessionBaseDir,
        CATS_RUNTIME_CONFIG_PATH: config.paths.runtimeConfigPath,
      },
      healthUrl: `${config.runtimeBaseUrl}/health`,
    },
    {
      name: 'cats',
      command: process.execPath,
      args: [
        config.paths.appEntryScript,
        '--startup-mode=app-managed',
        '--managed-by=cats-electron',
        '--ready-output=json',
      ],
      cwd: config.packageRoot,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
        CATS_HOST: config.appHost,
        CATS_PORT: String(config.appPort),
        CATS_STATE_PATH: config.paths.appStatePath,
        CATS_RUNTIME_BASE_URL: config.runtimeBaseUrl,
      },
      healthUrl: `${config.appBaseUrl}/health`,
    },
  ];
}

export class ManagedServiceSupervisor {
  private readonly handles = new Map<ManagedServiceName, ManagedServiceHandle>();

  private readonly spawnImpl: typeof spawn;

  private readonly now: () => Date;

  private readonly waitForReadiness: typeof waitForServiceReadiness;

  private readonly onStateChange?: (snapshot: ManagedServiceSnapshot) => void;

  constructor(
    private readonly config: DesktopHostConfig,
    private readonly dependencies: ProcessSupervisorDependencies = {},
  ) {
    this.spawnImpl = dependencies.spawn ?? spawn;
    this.now = dependencies.now ?? (() => new Date());
    this.waitForReadiness = dependencies.waitForServiceReadiness ?? waitForServiceReadiness;
    this.onStateChange = dependencies.onStateChange;

    for (const spec of buildManagedServiceSpecs(config)) {
      this.handles.set(spec.name, {
        child: null,
        snapshot: createInitialSnapshot(spec.name, spec.healthUrl),
        expectedExit: false,
      });
    }
  }

  getSnapshots(): ManagedServiceSnapshot[] {
    return Array.from(this.handles.values()).map((handle) => ({ ...handle.snapshot }));
  }

  async startAll(): Promise<void> {
    await ensureLaunchAssets(this.config);
    const specs = buildManagedServiceSpecs(this.config);
    for (const spec of specs) {
      await this.startService(spec);
    }
  }

  async stopAll(): Promise<void> {
    const names: ManagedServiceName[] = ['cats', 'cats-runtime'];
    for (const name of names) {
      await this.stopService(name);
    }
  }

  private updateSnapshot(name: ManagedServiceName, update: Partial<ManagedServiceSnapshot>): void {
    const handle = this.handles.get(name);
    if (!handle) {
      return;
    }
    handle.snapshot = {
      ...handle.snapshot,
      ...update,
    };
    this.onStateChange?.({ ...handle.snapshot });
  }

  private async startService(spec: ManagedServiceSpec): Promise<void> {
    const handle = this.handles.get(spec.name);
    if (!handle) {
      throw new Error(`Unknown managed service: ${spec.name}`);
    }
    if (handle.child && handle.child.exitCode === null && handle.child.signalCode === null) {
      return;
    }

    handle.expectedExit = false;
    this.updateSnapshot(spec.name, {
      status: 'starting',
      ready: false,
      pid: null,
      startedAt: this.now().toISOString(),
      error: null,
      exitCode: null,
    });

    const child = this.spawnImpl(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    handle.child = child;
    this.updateSnapshot(spec.name, {
      pid: child.pid ?? null,
    });

    child.stdout.on('data', (chunk) => {
      writeTaggedOutput(process.stdout, spec.name, chunk as Buffer);
    });
    child.stderr.on('data', (chunk) => {
      writeTaggedOutput(process.stderr, spec.name, chunk as Buffer);
    });
    child.on('exit', (code) => {
      this.updateSnapshot(spec.name, {
        status: handle.expectedExit ? 'stopped' : 'failed',
        ready: false,
        pid: null,
        exitCode: typeof code === 'number' ? code : null,
        error: handle.expectedExit ? null : `${spec.name} exited before the host stopped it.`,
      });
      handle.child = null;
    });

    const exitBeforeReady = new Promise<never>((_resolve, reject) => {
      child.once('exit', (code, signal) => {
        reject(
          new Error(
            `${spec.name} exited before readiness (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`,
          ),
        );
      });
    });

    const readinessPromise = spec.name === 'cats'
      ? this.waitForReadiness<AppHealthPayload>(spec.healthUrl, {
        timeoutMs: this.config.readinessTimeoutMs,
        pollIntervalMs: this.config.readinessPollIntervalMs,
      })
      : this.waitForReadiness<RuntimeDiagnosticsHealthPayload>(spec.healthUrl, {
        timeoutMs: this.config.readinessTimeoutMs,
        pollIntervalMs: this.config.readinessPollIntervalMs,
      });

    try {
      await Promise.race([readinessPromise, exitBeforeReady]);
      this.updateSnapshot(spec.name, {
        status: 'ready',
        ready: true,
        error: null,
      });
    } catch (error) {
      this.updateSnapshot(spec.name, {
        status: 'failed',
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async stopService(name: ManagedServiceName): Promise<void> {
    const handle = this.handles.get(name);
    if (!handle?.child) {
      return;
    }

    const child = handle.child;
    handle.expectedExit = true;

    const waitForExit = new Promise<void>((resolve) => {
      child.once('exit', () => {
        resolve();
      });
    });

    if (child.stdin && !child.stdin.destroyed) {
      child.stdin.end();
    }

    const gracefulWait = new Promise<void>((resolve) => {
      setTimeout(resolve, this.config.gracefulShutdownMs);
    });
    await Promise.race([waitForExit, gracefulWait]);

    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([waitForExit, gracefulWait]);
    }

    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }

    await waitForExit;
  }
}
