import {
  DEFAULT_LIVE_PREVIEW_CONFIG,
  type LivePreviewCommandProfile,
  type LivePreviewConfig,
  type LivePreviewError,
  type LivePreviewErrorCode,
  type LivePreviewLease,
  type LivePreviewStartAcceptedResult,
  type LivePreviewStartResult,
  type LivePreviewStopResult,
} from './contracts.js';
import {
  type LivePreviewProcessAdapter,
  type LivePreviewProcessExit,
  type LivePreviewProcessHandle,
  type LivePreviewProcessSpawnInput,
  type LivePreviewReadinessProbe,
  fetchLivePreviewReadiness,
} from './processAdapter.js';
import {
  validateLivePreviewConfig,
  validateLivePreviewStartRequest,
} from './profileValidation.js';

export interface LivePreviewSupervisorOptions {
  config?: LivePreviewConfig;
  processAdapter: LivePreviewProcessAdapter;
  readinessProbe?: LivePreviewReadinessProbe;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  idFactory?: () => string;
}

interface ManagedPreview {
  lease: LivePreviewLease;
  profile: LivePreviewCommandProfile;
  handle: LivePreviewProcessHandle | null;
  logs: string;
}

const ACTIVE_STATUSES = new Set<LivePreviewLease['status']>(['ready', 'starting']);

export class LivePreviewSupervisor {
  private readonly config: LivePreviewConfig;
  private readonly processAdapter: LivePreviewProcessAdapter;
  private readonly readinessProbe: LivePreviewReadinessProbe;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly idFactory: () => string;
  private readonly previews = new Map<string, ManagedPreview>();
  private readonly leasedPorts = new Set<number>();

  constructor(options: LivePreviewSupervisorOptions) {
    this.config = options.config ?? DEFAULT_LIVE_PREVIEW_CONFIG;
    validateLivePreviewConfig(this.config);
    this.processAdapter = options.processAdapter;
    this.readinessProbe = options.readinessProbe ?? fetchLivePreviewReadiness;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.idFactory = options.idFactory ?? createPreviewId;
  }

  getLease(previewId: string): LivePreviewLease | null {
    return this.previews.get(previewId)?.lease ?? null;
  }

  readLogs(previewId: string): string | null {
    return this.previews.get(previewId)?.logs ?? null;
  }

  listLeases(): LivePreviewLease[] {
    return [...this.previews.values()].map((preview) => preview.lease);
  }

  async start(input: unknown): Promise<LivePreviewStartResult> {
    const validation = validateLivePreviewStartRequest(input, this.config);
    if (validation.status === 'rejected') {
      return validation;
    }

    const activeGlobal = this.activePreviews().length;
    if (activeGlobal >= this.config.maxConcurrentGlobal) {
      return rejected(
        'live_preview_concurrency_limit_exceeded',
        'Global Cats Code live-preview concurrency limit reached.',
      );
    }
    const activeWorkspace = this.activePreviews().filter(
      (preview) => preview.lease.workspaceRef.id === validation.request.workspace.id,
    ).length;
    if (activeWorkspace >= this.config.maxConcurrentPerWorkspace) {
      return rejected(
        'live_preview_concurrency_limit_exceeded',
        'Workspace Cats Code live-preview concurrency limit reached.',
      );
    }

    const port = this.allocatePort();
    if (port === null) {
      return rejected(
        'live_preview_port_unavailable',
        'No Cats Code live-preview ports are available.',
      );
    }

    const previewId = this.idFactory();
    const startedAt = this.now();
    const host = this.config.allowIpv6Loopback ? '[::1]' : '127.0.0.1';
    const origin = `http://${host}:${port}`;
    const lease: LivePreviewLease = {
      previewId,
      commandProfileId: validation.profile.id,
      surface: validation.request.surface,
      workspaceRef: validation.request.workspace,
      origin,
      host,
      port,
      processId: null,
      status: 'starting',
      logPath: `live-preview/${previewId}.log`,
      artifactId: null,
      createdAt: startedAt.toISOString(),
      readyAt: null,
      expiresAt: new Date(startedAt.getTime() + this.config.defaultLeaseTtlMs).toISOString(),
      stoppedAt: null,
      stopReason: null,
    };
    const managed: ManagedPreview = {
      lease,
      profile: validation.profile,
      handle: null,
      logs: '',
    };
    this.previews.set(previewId, managed);

    try {
      const handle = await this.processAdapter.spawn(
        buildSpawnInput(validation.profile, validation.request.workspace.rootPath, port, origin),
      );
      managed.handle = handle;
      lease.processId = handle.processId;
      this.attachProcessListeners(managed, handle);
    } catch (error) {
      lease.status = 'failed';
      lease.stopReason = 'spawn_failed';
      lease.stoppedAt = this.now().toISOString();
      this.releasePort(port);
      return rejected(
        'live_preview_spawn_failed',
        error instanceof Error ? error.message : 'Live preview process failed to spawn.',
      );
    }

    const readiness = await this.waitForReadiness(managed);
    if (readiness.status === 'rejected') {
      return readiness;
    }

    return {
      status: 'accepted',
      previewId,
      origin,
      artifactId: null,
    };
  }

  async stop(previewId: string, reason = 'explicit_stop'): Promise<LivePreviewStopResult> {
    const managed = this.previews.get(previewId);
    if (!managed) {
      return rejected('live_preview_not_found', `Live preview was not found: ${previewId}.`);
    }
    if (managed.lease.status === 'stopped' || managed.lease.status === 'expired') {
      return {
        status: 'accepted',
        previewId,
        stopReason: managed.lease.stopReason ?? reason,
      };
    }
    if (managed.lease.status === 'failed') {
      return {
        status: 'accepted',
        previewId,
        stopReason: managed.lease.stopReason ?? 'failed',
      };
    }

    managed.lease.status = 'stopping';
    try {
      await managed.handle?.stop({
        graceMs: managed.profile.stop.graceMs,
        killProcessTree: managed.profile.stop.killProcessTree,
      });
    } catch (error) {
      managed.lease.status = 'failed';
      managed.lease.stopReason = 'stop_failed';
      this.releasePort(managed.lease.port);
      return rejected(
        'live_preview_stop_failed',
        error instanceof Error ? error.message : 'Live preview process failed to stop.',
      );
    }

    this.markStopped(managed, 'stopped', reason);
    return { status: 'accepted', previewId, stopReason: reason };
  }

  async expireLeases(now: Date = this.now()): Promise<string[]> {
    const expired: string[] = [];
    for (const managed of this.activePreviews()) {
      if (Date.parse(managed.lease.expiresAt) > now.getTime()) {
        continue;
      }
      const result = await this.stop(managed.lease.previewId, 'expired');
      if (result.status === 'accepted') {
        managed.lease.status = 'expired';
        expired.push(managed.lease.previewId);
      }
    }
    return expired;
  }

  private activePreviews(): ManagedPreview[] {
    return [...this.previews.values()].filter((preview) =>
      ACTIVE_STATUSES.has(preview.lease.status),
    );
  }

  private allocatePort(): number | null {
    for (let port = this.config.portRange.start; port <= this.config.portRange.end; port += 1) {
      if (!this.leasedPorts.has(port)) {
        this.leasedPorts.add(port);
        return port;
      }
    }
    return null;
  }

  private releasePort(port: number): void {
    this.leasedPorts.delete(port);
  }

  private attachProcessListeners(
    managed: ManagedPreview,
    handle: LivePreviewProcessHandle,
  ): void {
    handle.onStdout((chunk) => {
      this.appendLog(managed, chunk);
    });
    handle.onStderr((chunk) => {
      this.appendLog(managed, chunk);
    });
    handle.onExit((exit) => {
      this.handleProcessExit(managed, exit);
    });
  }

  private handleProcessExit(managed: ManagedPreview, exit: LivePreviewProcessExit): void {
    if (!ACTIVE_STATUSES.has(managed.lease.status)) {
      return;
    }
    managed.lease.status = 'failed';
    managed.lease.stopReason =
      `process_exited:${exit.code ?? 'null'}:${exit.signal ?? 'null'}`;
    managed.lease.stoppedAt = this.now().toISOString();
    this.releasePort(managed.lease.port);
  }

  private appendLog(managed: ManagedPreview, chunk: string): void {
    const next = `${managed.logs}${chunk}`;
    managed.logs = next.length > this.config.logMaxBytes
      ? next.slice(next.length - this.config.logMaxBytes)
      : next;
  }

  private async waitForReadiness(
    managed: ManagedPreview,
  ): Promise<LivePreviewStartAcceptedResult | { status: 'rejected'; error: LivePreviewError }> {
    const expectedStatus = managed.profile.readiness.expectedStatus ?? 200;
    const attempts = Math.max(
      1,
      Math.ceil(managed.profile.readiness.timeoutMs / managed.profile.readiness.intervalMs),
    );
    const probeUrl = `${managed.lease.origin}${managed.profile.readiness.path}`;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (managed.lease.status === 'failed') {
        return rejected(
          'live_preview_process_exited',
          'Live preview process exited before readiness.',
        );
      }
      try {
        const result = await this.readinessProbe(probeUrl);
        if (result.status === expectedStatus) {
          managed.lease.status = 'ready';
          managed.lease.readyAt = this.now().toISOString();
          return {
            status: 'accepted',
            previewId: managed.lease.previewId,
            origin: managed.lease.origin,
            artifactId: managed.lease.artifactId,
          };
        }
      } catch {
        // Retry until the readiness budget is exhausted.
      }
      await this.sleep(managed.profile.readiness.intervalMs);
    }

    await managed.handle?.stop({
      graceMs: managed.profile.stop.graceMs,
      killProcessTree: managed.profile.stop.killProcessTree,
    });
    managed.lease.status = 'failed';
    managed.lease.stopReason = 'readiness_timeout';
    managed.lease.stoppedAt = this.now().toISOString();
    this.releasePort(managed.lease.port);
    return rejected('live_preview_readiness_timeout', 'Live preview readiness timed out.');
  }

  private markStopped(
    managed: ManagedPreview,
    status: 'expired' | 'stopped',
    reason: string,
  ): void {
    managed.lease.status = status;
    managed.lease.stopReason = reason;
    managed.lease.stoppedAt = this.now().toISOString();
    this.releasePort(managed.lease.port);
  }
}

function buildSpawnInput(
  profile: LivePreviewCommandProfile,
  workspaceRoot: string,
  port: number,
  origin: string,
): LivePreviewProcessSpawnInput {
  const replacements = {
    artifactDirectory: workspaceRoot,
    port: String(port),
    workspaceRoot,
  };
  const env = Object.fromEntries(
    Object.entries(profile.env ?? {}).map(([key, value]) => [
      key,
      renderTemplate(value, replacements),
    ]),
  );
  if (profile.port.mode === 'env') {
    env[profile.port.name] = String(port);
  }
  return {
    commandProfileId: profile.id,
    executable: profile.executable,
    args: profile.args.map((arg) => renderTemplate(arg, replacements)),
    cwd: profile.workingDirectory === 'artifactDirectory'
      ? replacements.artifactDirectory
      : workspaceRoot,
    env,
    port,
    origin,
  };
}

function renderTemplate(input: string, replacements: Record<string, string>): string {
  return input.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/gu, (_match, key: string) =>
    replacements[key] ?? '',
  );
}

function createPreviewId(): string {
  return `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rejected(
  code: LivePreviewErrorCode,
  message: string,
  details?: unknown,
): { status: 'rejected'; error: LivePreviewError } {
  return {
    status: 'rejected',
    error: { code, message, details },
  };
}
