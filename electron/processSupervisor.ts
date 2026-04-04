import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, appendFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
  logPath: string;
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

function waitForTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function createInitialSnapshot(
  name: ManagedServiceName,
  healthUrl: string,
  logPath: string,
): ManagedServiceSnapshot {
  return {
    name,
    status: 'stopped',
    ready: false,
    pid: null,
    startedAt: null,
    healthUrl,
    error: null,
    exitCode: null,
    logPath,
    lastOutput: null,
    lastOutputAt: null,
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
  await mkdir(config.paths.hostLogsDir, { recursive: true });
}

function buildPreviousLogPath(logPath: string): string {
  return `${logPath}.previous`;
}

export async function prepareManagedServiceLog(logPath: string): Promise<void> {
  await mkdir(dirname(logPath), { recursive: true });
  const previousLogPath = buildPreviousLogPath(logPath);
  await rm(previousLogPath, { force: true });
  try {
    await rename(logPath, previousLogPath);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  await writeFile(logPath, '', 'utf8');
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
        CATS_RUNTIME_WSL_DISCOVERY_POLICY: env.CATS_RUNTIME_WSL_DISCOVERY_POLICY || 'manual_only',
        CATS_RUNTIME_DOCKER_DISCOVERY_POLICY: env.CATS_RUNTIME_DOCKER_DISCOVERY_POLICY || 'manual_only',
        CATS_RUNTIME_NATIVE_DISCOVERY_INTERVAL_MS:
          env.CATS_RUNTIME_NATIVE_DISCOVERY_INTERVAL_MS || '0',
      },
      healthUrl: `${config.runtimeBaseUrl}/health`,
      logPath: join(config.paths.hostLogsDir, 'cats-runtime.log'),
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
        CATS_DESKTOP_HOST_STATE_PATH: config.paths.hostStatePath,
        CATS_RUNTIME_BASE_URL: config.runtimeBaseUrl,
      },
      healthUrl: `${config.appBaseUrl}/health`,
      logPath: join(config.paths.hostLogsDir, 'cats.log'),
    },
  ];
}

export class ManagedServiceSupervisor {
  private readonly handles = new Map<ManagedServiceName, ManagedServiceHandle>();

  private readonly shutdownOrder: ManagedServiceName[];

  private readonly spawnImpl: typeof spawn;

  private readonly now: () => Date;

  private readonly waitForReadiness: typeof waitForServiceReadiness;

  private readonly onStateChange?: (snapshot: ManagedServiceSnapshot) => void;

  private readonly logQueues = new Map<ManagedServiceName, Promise<void>>();

  constructor(
    private readonly config: DesktopHostConfig,
    private readonly dependencies: ProcessSupervisorDependencies = {},
  ) {
    const specs = buildManagedServiceSpecs(config);
    this.spawnImpl = dependencies.spawn ?? spawn;
    this.now = dependencies.now ?? (() => new Date());
    this.waitForReadiness = dependencies.waitForServiceReadiness ?? waitForServiceReadiness;
    this.onStateChange = dependencies.onStateChange;
    this.shutdownOrder = specs.map((spec) => spec.name).reverse();

    for (const spec of specs) {
      this.handles.set(spec.name, {
        child: null,
        snapshot: createInitialSnapshot(spec.name, spec.healthUrl, spec.logPath),
        expectedExit: false,
      });
      this.logQueues.set(spec.name, Promise.resolve());
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
    for (const name of this.shutdownOrder) {
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

  private queueLogWrite(
    serviceName: ManagedServiceName,
    logPath: string,
    line: string,
  ): void {
    const previous = this.logQueues.get(serviceName) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await appendFile(logPath, line, 'utf8');
      });
    this.logQueues.set(serviceName, next.catch(() => undefined));
  }

  private recordServiceOutput(
    serviceName: ManagedServiceName,
    logPath: string,
    text: string,
    stream: 'stdout' | 'stderr',
  ): void {
    const lines = text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      return;
    }

    const timestamp = this.now().toISOString();
    for (const line of lines) {
      this.queueLogWrite(
        serviceName,
        logPath,
        `[${timestamp}] [${stream}] ${line}\n`,
      );
    }

    this.updateSnapshot(serviceName, {
      lastOutput: lines[lines.length - 1] ?? null,
      lastOutputAt: timestamp,
    });
  }

  private async startService(spec: ManagedServiceSpec): Promise<void> {
    const handle = this.handles.get(spec.name);
    if (!handle) {
      throw new Error(`Unknown managed service: ${spec.name}`);
    }
    if (handle.child && handle.child.exitCode === null && handle.child.signalCode === null) {
      return;
    }

    await (this.logQueues.get(spec.name) ?? Promise.resolve()).catch(() => undefined);
    await prepareManagedServiceLog(spec.logPath);

    handle.expectedExit = false;
    this.updateSnapshot(spec.name, {
      status: 'starting',
      ready: false,
      pid: null,
      startedAt: this.now().toISOString(),
      error: null,
      exitCode: null,
      logPath: spec.logPath,
      lastOutput: null,
      lastOutputAt: null,
    });
    this.queueLogWrite(
      spec.name,
      spec.logPath,
      `\n[${this.now().toISOString()}] [host] starting ${spec.name} (${spec.command} ${spec.args.join(' ')})\n`,
    );

    const child = this.spawnImpl(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;

    handle.child = child;
    this.updateSnapshot(spec.name, {
      pid: child.pid ?? null,
    });

    child.stdout.on('data', (chunk) => {
      writeTaggedOutput(process.stdout, spec.name, chunk as Buffer);
      this.recordServiceOutput(spec.name, spec.logPath, (chunk as Buffer).toString('utf8'), 'stdout');
    });
    child.stderr.on('data', (chunk) => {
      writeTaggedOutput(process.stderr, spec.name, chunk as Buffer);
      this.recordServiceOutput(spec.name, spec.logPath, (chunk as Buffer).toString('utf8'), 'stderr');
    });
    child.on('exit', (code, signal) => {
      const exitMessage = handle.expectedExit
        ? `${spec.name} exited after host shutdown.`
        : `${spec.name} exited before readiness (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`;
      this.queueLogWrite(
        spec.name,
        spec.logPath,
        `[${this.now().toISOString()}] [host] ${exitMessage}\n`,
      );
      this.updateSnapshot(spec.name, {
        status: handle.expectedExit ? 'stopped' : 'failed',
        ready: false,
        pid: null,
        exitCode: typeof code === 'number' ? code : null,
        error: handle.expectedExit ? null : exitMessage,
      });
      handle.child = null;
    });

    let exitBeforeReadyListener: ((code: number | null, signal: NodeJS.Signals | null) => void)
      | null = null;
    const exitBeforeReady = new Promise<never>((_resolve, reject) => {
      exitBeforeReadyListener = (code, signal) => {
        reject(new Error(
          `${spec.name} exited before readiness (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`,
        ));
      };
      child.once('exit', exitBeforeReadyListener);
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
    } finally {
      if (exitBeforeReadyListener) {
        child.off('exit', exitBeforeReadyListener);
      }
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

    await Promise.race([waitForExit, waitForTimeout(this.config.gracefulShutdownMs)]);

    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([waitForExit, waitForTimeout(this.config.gracefulShutdownMs)]);
    }

    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }

    await waitForExit;
  }
}
