import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ingressServiceUrl } from '#cats-app-package';
import { startAppProcess, type AppProcess } from './componentProcess.js';
import { createPlatformIngressListener } from './ingressBoundary.js';
import { PlatformIngressSettingsStore, emptyIngressSettings, validateIngressSettings, validatePublicOrigin,
  type PlatformIngressSettings } from './ingressSettings.js';

/** A single host lifecycle. No App owns, configures or closes this service. */
export class PlatformIngress {
  private settings = { ...emptyIngressSettings };
  private state: 'disconnected' | 'connecting' | 'connected' | 'configured' | 'unavailable' | 'migration_required' = 'disconnected';
  private legacySources: string[] = [];
  private readonly store: PlatformIngressSettingsStore;
  private listener?: Awaited<ReturnType<typeof createPlatformIngressListener>>;
  private worker?: AppProcess;
  private closed = false;
  private epoch = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private shutdown?: Promise<void>;
  private readonly cleanups = new Set<Promise<void>>();

  constructor(private readonly options: {
    platformDir: string;
    dispatch(request: IncomingMessage, response: ServerResponse): Promise<void>;
    ready(): Promise<boolean>;
    onOrigin?(origin: string | undefined): void;
    start?: typeof startAppProcess;
  }) {
    this.store = new PlatformIngressSettingsStore(path.join(options.platformDir, 'config', 'ingress.local.json'),
      path.join(options.platformDir, 'apps', 'ingress'));
  }
  snapshot() {
    const available = this.state === 'connected' || this.state === 'configured';
    return { provider: this.settings.provider, state: this.state, enabled: this.settings.enabled,
      configured: this.settings.provider === 'external' ? !!this.settings.publicOrigin : !!this.settings.authtoken,
      url: available ? this.settings.publicOrigin ?? null : null,
      configuredOrigin: this.settings.publicOrigin ?? '', listenPort: this.settings.listenPort,
      target: this.listener?.target ?? null, legacySources: [...this.legacySources] };
  }
  publicOrigin() { return this.settings.enabled ? this.settings.publicOrigin : undefined; }

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
            this.settings = { ...old[0]!.settings, enabled: old.some(row => row.settings.enabled) };
            await this.store.save(this.settings, old.map(row => row.filename));
          }
        }
        if (this.settings.enabled) await this.connect();
      } catch { this.state = 'unavailable'; }
    });
  }

  async configure(value: unknown) {
    return this.serialize(async () => {
      const input = value as Record<string, unknown> | null;
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !['enabled', 'provider', 'authtoken', 'publicOrigin', 'listenPort', 'migrationSource'].includes(key))) throw new Error('Invalid ingress settings.');
      let previous = this.settings;
      let legacyFiles: string[] = [];
      if (this.state === 'migration_required') {
        const old = await this.store.legacy();
        const selected = old.find(row => row.appId === input.migrationSource);
        if (!selected) throw new Error('Select an existing ingress configuration.');
        previous = selected.settings; legacyFiles = old.map(row => row.filename);
      }
      const next = validateIngressSettings({ ...previous, schemaVersion: 2,
        enabled: input.enabled, provider: input.provider ?? previous.provider,
        listenPort: input.listenPort ?? previous.listenPort,
        authtoken: input.authtoken ?? previous.authtoken,
        publicOrigin: input.publicOrigin === '' ? undefined : input.publicOrigin ?? previous.publicOrigin });
      if (next.enabled && !await this.options.ready()) throw new Error('Complete Cats authentication setup before enabling remote access.');
      await this.store.save(next, legacyFiles);
      await this.stop(); this.settings = next; this.legacySources = [];
      if (next.enabled) await this.connect();
      return this.snapshot();
    });
  }

  close(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.closed = true; this.options.onOrigin?.(undefined);
    this.shutdown = (async () => { await this.stop(); await this.queue.catch(() => {}); await this.stop(); })();
    return this.shutdown;
  }

  private async connect() {
    if (this.closed || !this.settings.enabled) return;
    this.state = 'connecting';
    const epoch = ++this.epoch;
    try {
      this.listener = await createPlatformIngressListener({ port: this.settings.listenPort,
        origin: () => this.publicOrigin(), ready: this.options.ready, dispatch: this.options.dispatch });
      if (this.closed) { await this.stop(); return; }
      if (this.settings.provider === 'external') {
        this.options.onOrigin?.(this.settings.publicOrigin); this.state = 'configured'; return;
      }
      const worker = await (this.options.start ?? startAppProcess)({ kind: 'ingress',
        entrypoint: fileURLToPath(ingressServiceUrl), timeoutMs: 30_000,
        context: { appId: 'cats.platform', componentId: 'ingress', dataDir: path.dirname(this.store.filename), services: {},
          ingress: { target: this.listener.target, authtoken: this.settings.authtoken, url: this.settings.publicOrigin } },
        onExit: () => { if (!this.closed && this.epoch === epoch) {
          const stoppedEpoch = this.epoch + 1;
          void this.stop().then(() => { if (!this.closed && this.epoch === stoppedEpoch) this.state = 'unavailable'; });
        } } });
      this.worker = worker;
      if (this.closed || this.epoch !== epoch) { await this.stop(); if (!this.closed) this.state = 'unavailable'; return; }
      const publicOrigin = validatePublicOrigin(worker.publicUrl);
      const next = { ...this.settings, publicOrigin };
      await this.store.save(next);
      if (this.closed || this.epoch !== epoch) return;
      this.settings = next;
      this.options.onOrigin?.(publicOrigin); this.state = 'connected';
    } catch { await this.stop(); this.state = this.closed ? 'disconnected' : 'unavailable'; }
  }

  private async stop() {
    ++this.epoch; this.options.onOrigin?.(undefined); this.state = 'disconnected';
    const worker = this.worker; const listener = this.listener;
    this.worker = undefined; this.listener = undefined;
    const pending = Promise.all([...this.cleanups, worker?.stop(), listener?.close()]).then(() => {});
    this.cleanups.add(pending);
    void pending.then(() => this.cleanups.delete(pending), () => this.cleanups.delete(pending));
    await pending;
  }
  private serialize<T>(operation: () => Promise<T>) {
    const pending = this.queue.catch(() => {}).then(() => {
      if (this.closed) throw new Error('Platform ingress is closed.');
      return operation();
    });
    this.queue = pending; return pending;
  }
}
