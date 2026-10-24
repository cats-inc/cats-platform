import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ingressServiceUrl } from '#cats-app-package';
import { startAppProcess, type AppProcess } from './componentProcess.js';
import { createPlatformIngressListener } from './ingressBoundary.js';
import { PlatformIngressSettingsStore, emptyIngressSettings, validateIngressSettings, validatePublicOrigin,
  type PlatformIngressSettings } from './ingressSettings.js';
import type { IngressSecretProtector } from '#cats-ingress-secrets';

type IngressState = 'off' | 'disconnected' | 'connecting' | 'connected' | 'configured' | 'retrying'
  | 'needs_action' | 'unavailable' | 'migration_required' | 'cleanup_pending';
const RETRY_DELAYS = [1000, 2000, 5000, 10_000, 30_000];

/** One profile-owned lifecycle; Apps never receive tunnel credentials or control it. */
export class PlatformIngress {
  private settings = { ...emptyIngressSettings };
  private state: IngressState = 'off';
  private errorCode: string | null = null;
  private legacySources: string[] = [];
  private readonly store: PlatformIngressSettingsStore;
  private listener?: Awaited<ReturnType<typeof createPlatformIngressListener>>;
  private worker?: AppProcess;
  private acquisition?: Promise<AppProcess>;
  private closed = false;
  private suspended = false;
  private offline = false;
  private get paused() { return this.suspended || this.offline; }
  private wanted = false;
  private epoch = 0;
  private revision = 0;
  private retryCount = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private stableTimer?: ReturnType<typeof setTimeout>;
  private connecting?: AbortController;
  private queue: Promise<unknown> = Promise.resolve();
  private shutdown?: Promise<void>;
  private readonly pendingStops = new Set<() => Promise<void>>();
  private readonly stopping = new Map<() => Promise<void>, Promise<boolean>>();
  private observedAt: string | null = null;

  constructor(private readonly options: {
    platformDir: string;
    dispatch(request: IncomingMessage, response: ServerResponse): Promise<void>;
    ready(): Promise<boolean>;
    onOrigin?(origin: string | undefined): void;
    start?: typeof startAppProcess;
    secrets?: IngressSecretProtector;
    retryDelaysMs?: readonly number[];
    cleanupTimeoutMs?: number;
    random?(): number;
  }) {
    this.store = new PlatformIngressSettingsStore(path.join(options.platformDir, 'config', 'ingress.local.json'),
      path.join(options.platformDir, 'apps', 'ingress'), options.secrets);
  }
  snapshot() {
    const available = this.state === 'connected' || this.state === 'configured';
    return { provider: this.settings.provider, state: this.state, enabled: this.settings.enabled,
      autoConnect: this.settings.autoConnect,
      configured: this.settings.provider === 'external' ? !!this.settings.publicOrigin : !!this.settings.credentialRef,
      url: available ? this.settings.publicOrigin ?? null : null,
      configuredOrigin: this.settings.provider === 'ngrok'
        ? this.settings.requestedOrigin ?? this.settings.publicOrigin ?? '' : this.settings.publicOrigin ?? '',
      listenPort: this.settings.listenPort,
      target: this.worker?.url ?? this.listener?.target ?? null, legacySources: [...this.legacySources],
      errorCode: this.errorCode, retryCount: this.retryCount,
      publicVerification: { state: 'unknown' as const, observedAt: this.observedAt } };
  }
  publicOrigin() {
    return ['connected', 'configured'].includes(this.state) ? this.settings.publicOrigin : undefined;
  }
  async restore() {
    return this.serialize(async () => {
      try {
        const stored = await this.store.read();
        if (stored) this.settings = stored;
        else {
          const old = await this.store.legacy();
          if (old.length) {
            const groups = new Set(old.map(row => JSON.stringify([row.settings.authtoken, row.settings.publicOrigin ?? ''])));
            if (groups.size !== 1) { this.legacySources = old.map(row => row.appId); this.state = 'migration_required'; return; }
            this.settings = await this.store.upgrade({ ...old[0]!.settings, enabled: old.some(row => row.settings.enabled) });
          }
        }
        this.wanted = this.settings.enabled && this.settings.autoConnect;
        this.state = this.settings.enabled ? 'disconnected' : 'off';
        if (this.wanted) await this.connect();
      } catch (error) { this.fail(error); }
    });
  }
  configure(value: unknown) {
    const input = value as Record<string, unknown> | null;
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || typeof input.enabled !== 'boolean'
      || Object.keys(input).some(key => !['enabled', 'autoConnect', 'provider', 'authtoken', 'publicOrigin', 'listenPort', 'migrationSource'].includes(key))
      || (input.authtoken !== undefined && (typeof input.authtoken !== 'string' || !/^[A-Za-z0-9_-]{20,512}$/.test(input.authtoken)))
      || (input.autoConnect !== undefined && typeof input.autoConnect !== 'boolean')) {
      return Promise.reject(new Error('Invalid ingress settings.'));
    }
    if (input.publicOrigin) { try { validatePublicOrigin(input.publicOrigin); } catch (error) { return Promise.reject(error); } }
    const revision = ++this.revision;
    this.revoke(); // Cancel a blocked old connection before waiting for the serialized mutation.
    return this.serialize(async () => {
      if (revision !== this.revision) throw new Error('Ingress configuration superseded.');
      let previous = this.settings;
      if (this.state === 'migration_required' || this.legacySources.length) {
        const selected = (await this.store.legacy()).find(row => row.appId === input.migrationSource);
        if (!selected) throw new Error('Select an existing ingress configuration.');
        previous = await this.store.upgrade(selected.settings);
      }
      if (input.enabled && !await this.options.ready()) {
        await this.cleanup(); this.fail(new Error('authentication_required'));
        throw new Error('Complete Cats authentication setup before enabling remote access.');
      }
      let next = { ...previous, enabled: input.enabled,
        autoConnect: input.autoConnect ?? previous.autoConnect,
        provider: input.provider ?? previous.provider, listenPort: input.listenPort ?? previous.listenPort,
        publicOrigin: input.publicOrigin === '' ? undefined : input.publicOrigin ?? previous.publicOrigin } as PlatformIngressSettings;
      if (next.provider === 'ngrok') {
        next.requestedOrigin = input.publicOrigin !== undefined ? input.publicOrigin as string
          : previous.requestedOrigin ?? previous.publicOrigin ?? '';
        next.publicOrigin = previous.publicOrigin;
      }
      try {
        next = await this.store.withCredential(next, input.authtoken as string | undefined);
        next = validateIngressSettings(next);
        if (revision !== this.revision || this.closed) throw new Error('Ingress configuration superseded.');
        await this.store.save(next);
        if (revision !== this.revision || this.closed) return this.snapshot();
      } catch (error) {
        if (await this.cleanup()) this.fail(error);
        throw new Error('Ingress settings were not saved.');
      }
      this.settings = next; this.legacySources = []; this.retryCount = 0;
      this.wanted = next.enabled; this.errorCode = null;
      if (!await this.cleanup()) return this.snapshot();
      if (!next.enabled) this.state = 'off';
      else if (this.paused) this.state = 'unavailable';
      else await this.connect();
      return this.snapshot();
    });
  }
  reconcile(event: 'suspend' | 'resume' | 'offline' | 'online') {
    if (event === 'suspend' || event === 'resume') this.suspended = event === 'suspend';
    else this.offline = event === 'offline';
    this.revoke();
    return this.serialize(async () => {
      if (!await this.cleanup()) return;
      if (this.paused) this.state = this.wanted ? 'unavailable' : (this.settings.enabled ? 'disconnected' : 'off');
      else if (this.wanted && this.settings.enabled) { this.retryCount = 0; await this.connect(); }
      else this.state = this.settings.enabled ? 'disconnected' : 'off';
    }).catch(() => {});
  }
  /** Disarm before data erasure; retain configuration for deliberate re-enablement. */
  resetForDataReset(): Promise<void> {
    const revision = ++this.revision;
    this.wanted = false;
    this.revoke();
    return this.serialize(async () => {
      try {
        if (revision !== this.revision) throw new Error('Ingress reset superseded.');
        // A failed restore may leave constructor defaults in memory despite a
        // valid primary file. Never overwrite retained metadata from that cache.
        const stored = await this.store.read();
        if (!stored && (await this.store.legacy()).length) throw new Error('Ingress migration is unresolved.');
        const next = { ...(stored ?? this.settings), enabled: false, autoConnect: false };
        await this.store.save(next);
        if (revision !== this.revision || this.closed) throw new Error('Ingress reset superseded.');
        this.settings = next;
        if (!await this.cleanup()) throw new Error('cleanup_pending');
        this.state = 'off'; this.errorCode = null; this.retryCount = 0;
      } catch (error) {
        // Failed persistence still stops the old generation. Data erasure must
        // not proceed until both durable disarm and worker cleanup succeed.
        if (this.state !== 'cleanup_pending') {
          if (await this.cleanup()) this.fail(error);
        }
        throw new Error('Remote access could not be prepared for data reset.');
      }
    });
  }
  close(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.closed = true; ++this.revision; this.wanted = false; this.revoke();
    this.shutdown = (async () => {
      await this.queue.catch(() => {});
      await this.cleanup();
      if (this.state !== 'cleanup_pending') this.state = 'off';
    })();
    return this.shutdown;
  }
  private revoke() {
    ++this.epoch; clearTimeout(this.retryTimer); this.retryTimer = undefined;
    clearTimeout(this.stableTimer); this.stableTimer = undefined;
    this.connecting?.abort(); this.connecting = undefined;
    this.options.onOrigin?.(undefined); this.observedAt = null;
    if (this.state !== 'migration_required') this.state = 'disconnected';
    const worker = this.worker; const listener = this.listener; const acquisition = this.acquisition;
    this.worker = undefined; this.listener = undefined; this.acquisition = undefined;
    listener?.revoke();
    if (worker || listener || acquisition) {
      // Keep the revoked target bound until even an acquiring worker is confirmed stopped.
      this.pendingStops.add(async () => {
        const ownedWorker = worker ?? (acquisition ? await acquisition.catch(() => undefined) : undefined);
        await ownedWorker?.stop();
        await listener?.close();
      });
    }
  }
  private async cleanup() {
    let success = true;
    await Promise.all([...this.pendingStops].map(async stop => {
      const existing = this.stopping.get(stop);
      if (existing) { if (!await existing) success = false; return; }
      const operation = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([stop(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('cleanup_pending')), this.options.cleanupTimeoutMs ?? 8000);
        })]);
        this.pendingStops.delete(stop);
        return true;
      } catch { return false; }
      finally { clearTimeout(timer); }
      })();
      this.stopping.set(stop, operation);
      try { if (!await operation) success = false; }
      finally { this.stopping.delete(stop); }
    }));
    if (!success) { this.state = 'cleanup_pending'; this.errorCode = 'cleanup_pending'; }
    return success;
  }
  private fail(error: unknown) {
    const secure = error instanceof Error && (['secure_storage_unavailable', 'credential_required', 'authentication_required'].includes(error.message)
      || /^ERR_NGROK_\d+$/.test(error.message));
    this.state = secure ? 'needs_action' : 'unavailable';
    this.errorCode = secure ? (error as Error).message : 'connection_or_settings_unavailable';
  }
  private retry() {
    const delays = this.options.retryDelaysMs ?? RETRY_DELAYS;
    if (this.closed || this.paused || !this.wanted || !this.settings.enabled) return;
    const delay = delays[this.retryCount];
    if (delay === undefined) { this.state = 'unavailable'; return; }
    this.retryCount++;
    this.state = 'retrying';
    const epoch = this.epoch;
    const jitter = 0.8 + 0.4 * (this.options.random?.() ?? Math.random());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (epoch === this.epoch && !this.closed) void this.serialize(() => this.connect()).catch(() => {});
    }, Math.round(delay * jitter));
    this.retryTimer.unref();
  }
  private async connect() {
    if (this.closed || this.paused || !this.wanted || !this.settings.enabled) return;
    if (!await this.cleanup()) return;
    this.state = 'connecting'; this.errorCode = null;
    const epoch = ++this.epoch;
    const controller = new AbortController(); this.connecting = controller;
    try {
      if (!await this.options.ready()) throw new Error('authentication_required');
      let authtoken = '';
      if (this.settings.provider === 'ngrok') {
        try { authtoken = await this.store.credential(this.settings); }
        catch { throw new Error('secure_storage_unavailable'); }
      }
      if (this.closed || epoch !== this.epoch) return;
      const listener = await createPlatformIngressListener({ port: this.settings.listenPort,
        origin: () => this.publicOrigin(), ready: this.options.ready, dispatch: this.options.dispatch });
      if (this.closed || epoch !== this.epoch) { await listener.close(); return; }
      this.listener = listener;
      if (this.settings.provider === 'external') {
        this.state = 'configured'; this.options.onOrigin?.(this.settings.publicOrigin); return;
      }
      const acquisition = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error('Connection cancelled.');
        return (this.options.start ?? startAppProcess)({ kind: 'ingress',
        entrypoint: fileURLToPath(ingressServiceUrl), timeoutMs: 30_000, signal: controller.signal,
        onIngressSocket: socket => {
          if (this.closed || epoch !== this.epoch || this.paused) socket.destroy();
          else listener.accept(socket);
        },
        context: { appId: 'cats.platform', componentId: 'ingress', dataDir: path.dirname(this.store.filename), services: {},
          ingress: { target: listener.target, authtoken,
            url: this.settings.requestedOrigin ?? this.settings.publicOrigin } },
        onExit: () => {
          if (!this.closed && this.epoch === epoch) {
            this.revoke();
            this.state = 'unavailable'; this.errorCode = 'provider_disconnected';
            const cleaning = this.cleanup();
            void this.serialize(async () => { if (await cleaning) this.retry(); }).catch(() => {});
          }
        } });
      });
      this.acquisition = acquisition;
      const worker = await acquisition;
      if (this.closed || this.epoch !== epoch) return; // revoke() owns the pending acquisition and its target.
      this.acquisition = undefined; this.worker = worker;
      const publicOrigin = validatePublicOrigin(worker.publicUrl);
      const next = { ...this.settings, publicOrigin };
      await this.store.save(next);
      if (this.closed || this.epoch !== epoch) return;
      this.settings = next; this.state = 'connected';
      this.stableTimer = setTimeout(() => { if (epoch === this.epoch) this.retryCount = 0; }, 60_000);
      this.stableTimer.unref();
      this.options.onOrigin?.(publicOrigin);
    } catch (error) {
      if (this.closed || epoch !== this.epoch) return;
      this.revoke();
      if (!await this.cleanup()) return;
      this.fail(error);
      if (!['secure_storage_unavailable', 'credential_required', 'authentication_required'].includes(this.errorCode ?? '')
        && !/^ERR_NGROK_\d+$/.test(this.errorCode ?? '')) this.retry();
    } finally { if (this.connecting === controller) this.connecting = undefined; }
  }
  private serialize<T>(operation: () => Promise<T>) {
    const pending = this.queue.catch(() => {}).then(() => {
      if (this.closed) throw new Error('Platform ingress is closed.');
      return operation();
    });
    this.queue = pending; return pending;
  }
}
