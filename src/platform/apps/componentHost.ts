import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateRendererPackage } from './packageInstaller.js';
import { resolveCatsAppStoragePathsFromChatState, resolveCatsAppDataDir } from './paths.js';
import { FileCatsAppRegistry, type CatsAppRegistryInstallInput } from './registry.js';
import type { CatsInstalledAppRecord } from '../../shared/catsAppManifest.js';
import { startAppProcess, type AppProcess } from './componentProcess.js';
import { createAppGateway, type AppViewAuthority } from './componentGateway.js';

interface RunningApp {
  record: CatsInstalledAppRecord;
  processes: Map<string, AppProcess>;
  gateway: Awaited<ReturnType<typeof createAppGateway>>;
  stopping: boolean;
}

/** A host instance belongs to one configured owner/profile. It never accepts a client-selected data root. */
export class AppComponentHost {
  private readonly registry: FileCatsAppRegistry;
  private readonly paths;
  private readonly running = new Map<string, RunningApp>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly restarts = new Map<string, number>();
  private readonly failures = new Map<string, string>();
  private closed = false;
  private shutdown?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private ingressSnapshot: () => { state: string; url?: string | null } = () => ({ state: 'disconnected' });

  constructor(private readonly options: { chatStatePath: string; ownerId: string; readinessTimeoutMs?: number }) {
    this.paths = resolveCatsAppStoragePathsFromChatState(options.chatStatePath);
    this.registry = new FileCatsAppRegistry({ registryPath: this.paths.registryPath });
  }

  async install(input: CatsAppRegistryInstallInput): Promise<CatsInstalledAppRecord> {
    return this.serialize(input.manifest.id, async () => {
      const previous = (await this.registry.readState()).apps.find(item => item.id === input.manifest.id);
      if (previous && previous.packageSha256 === input.packageSha256 && previous.dataGeneration) {
        const record = await this.registry.installApp({ ...input, dataGeneration: previous.dataGeneration });
        await this.stopUnlocked(record.id);
        this.failures.delete(record.id); this.restarts.delete(record.id);
        if (record.enabled) await this.startUnlocked(record);
        return record;
      }
      await this.stopUnlocked(input.manifest.id);
      const generation = randomUUID();
      const target = this.dataDir(input.manifest.id, generation);
      await mkdir(path.dirname(target), { recursive: true });
      try {
        if (previous?.dataGeneration) {
          const source = this.dataDir(previous.id, previous.dataGeneration);
          await this.validateSnapshot(source);
          await cp(source, target, { recursive: true, errorOnExist: true, force: false });
        } else await mkdir(target);
        const record: CatsInstalledAppRecord = { ...input, id: input.manifest.id,
          enabled: input.enabled === true, installState: input.enabled ? 'enabled' : 'disabled',
          installedAt: previous?.installedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(),
          dataGeneration: generation };
        const components = record.manifest.components!;
        const oldSchema = previous?.manifest.components?.data.schemaVersion ?? 0;
        if (oldSchema > components.data.schemaVersion) throw new Error('App data downgrade requires an explicit migration.');
        if (oldSchema !== 0 && oldSchema !== components.data.schemaVersion && !components.data.migration) {
          throw new Error('App data upgrade requires an App-owned migration.');
        }
        const decoded = await this.verifiedFiles(record);
        if (components.data.migration && oldSchema !== components.data.schemaVersion) {
          const migration = await startAppProcess({ kind: 'migration',
            entrypoint: path.join(record.packagePath, 'files', components.data.migration),
            context: { appId: record.id, componentId: 'migration', dataDir: target, services: {},
              fromSchemaVersion: oldSchema, toSchemaVersion: components.data.schemaVersion },
            timeoutMs: this.options.readinessTimeoutMs });
          await migration.stop();
        }
        // Readiness runs on the new data copy before the single registry activation write.
        const candidate = record.enabled ? await this.launch(record, decoded) : undefined;
        try {
          const installed = await this.registry.installApp({ ...input, dataGeneration: generation });
          if (candidate) candidate.record = installed;
          this.failures.delete(record.id); this.restarts.delete(record.id);
          if (candidate) this.running.set(record.id, candidate);
          return installed;
        } catch (error) { if (candidate) await this.stopInstance(candidate); throw error; }
      } catch (error) {
        // Neither old data nor registry was replaced. Retain the failed staged copy for recovery.
        if (previous?.enabled) await this.startUnlocked(previous).catch(() => {});
        throw error;
      }
    });
  }

  async open(appId: string, version: string, boot: Record<string, string>, ownerId: string, frontend?: string, authority?: AppViewAuthority) {
    if (ownerId !== this.options.ownerId) throw new Error('App owner mismatch.');
    return this.serialize(appId, async () => {
      const record = await this.registry.getInstalledApp(appId);
      if (!record || !record.enabled || record.installState !== 'enabled' || record.manifest.version !== version) {
        throw new Error('App access revoked.');
      }
      if (this.failures.has(appId)) throw new Error(this.failures.get(appId));
      let current = this.running.get(appId);
      if (current && !this.sameGeneration(current.record, record)) { await this.stopUnlocked(appId); current = undefined; }
      current ??= await this.startUnlocked(record);
      return current.gateway.open(frontend, boot, ownerId, authority);
    });
  }

  async setEnabled(appId: string, enabled: boolean) {
    return this.serialize(appId, async () => {
      if (!enabled) {
        const record = await this.registry.updateAppState(appId, { installState: 'disabled' });
        await this.stopUnlocked(appId);
        return record;
      }
      await this.stopUnlocked(appId);
      this.failures.delete(appId); this.restarts.delete(appId);
      const record = await this.registry.updateAppState(appId, { installState: enabled ? 'enabled' : 'disabled' });
      if (enabled && record.manifest.components) await this.startUnlocked(record);
      return record;
    });
  }

  async remove(appId: string, purge: boolean) {
    return this.serialize(appId, async () => {
      const existing = (await this.registry.readState()).apps.find(item => item.id === appId);
      if (purge && existing?.manifest.components) throw new Error('Component App data must remain recoverable; purge is not supported.');
      const record = await this.registry.uninstallApp(appId, { purge });
      await this.stopUnlocked(appId);
      return record;
    });
  }

  status(appId: string) {
    const current = this.running.get(appId);
    return { running: !!current, error: this.failures.get(appId) ?? null,
      components: current ? [...current.processes.keys()] : [], mountPath: `/apps/${appId}` };
  }

  setIngressSnapshot(snapshot: () => { state: string; url?: string | null }) { this.ingressSnapshot = snapshot; }

  async authorizeBridge(appId: string, version: string, nonce: string, permission: string) {
    const current = this.running.get(appId);
    return !!current && current.record.manifest.version === version
      && current.record.manifest.permissions.some(value => value === permission)
      && await current.gateway.authorizeBridge(nonce);
  }

  async route(request: IncomingMessage, response: ServerResponse, transportOrigin: string): Promise<boolean> {
    const raw = request.url ?? '/';
    if (!raw.startsWith('/apps/') && raw !== '/apps') return false;
    const pathname = raw.split('?')[0]!;
    const fail = (status: number, error: string) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error }));
    };
    if (/%|\\|\/\/|[\u0000-\u0020\u007f]/.test(pathname) || pathname.split('/').some(part => part === '.' || part === '..')) {
      fail(400, 'invalid_app_path'); return true;
    }
    const match = /^\/apps\/([a-z][a-z0-9.-]{0,99})(\/.*)?$/.exec(pathname);
    if (!match) { fail(404, 'app_route_not_found'); return true; }
    // The exact App mount is the authenticated host shell, not an App document.
    if (!match[2] || match[2] === '/') {
      const record = await this.registry.getInstalledApp(match[1]!);
      if (record?.enabled && record.installState === 'enabled') return false;
      fail(404, 'app_unavailable'); return true;
    }
    const current = this.running.get(match[1]!);
    if (!current || current.stopping) { fail(404, 'app_unavailable'); return true; }
    await current.gateway.handle(request, response, transportOrigin); return true;
  }

  async restore() {
    for (const record of await this.registry.listInstalledApps()) {
      if (record.enabled && record.manifest.components) {
        await this.serialize(record.id, () => this.startUnlocked(record)).catch(() => this.failures.set(record.id, 'App startup failed.'));
      }
    }
    if (!this.timer && !this.closed) {
      this.timer = setInterval(() => { void this.reconcile(); }, 1000); this.timer.unref();
    }
  }

  close(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.closed = true; clearInterval(this.timer);
    this.shutdown = (async () => {
      await Promise.allSettled([...this.queues.values()]);
      await Promise.all([...this.running.keys()].map(id => this.stopUnlocked(id)));
    })();
    return this.shutdown;
  }

  private dataDir(appId: string, generation: string) {
    if (!/^[a-z][a-z0-9.-]{0,99}$/.test(appId) || !/^[a-f0-9-]{36}$/.test(generation)) throw new Error('Invalid App data identity.');
    return path.join(resolveCatsAppDataDir(this.paths, appId), 'generations', generation);
  }

  private async validateSnapshot(root: string) {
    let count = 0; let bytes = 0;
    const visit = async (directory: string) => {
      if ((await lstat(directory)).isSymbolicLink()) throw new Error('App data snapshot contains a link.');
      for (const item of await readdir(directory, { withFileTypes: true })) {
        if (++count > 10_000 || item.isSymbolicLink()) throw new Error('App data snapshot is unsafe or too large.');
        const target = path.join(directory, item.name);
        if (item.isDirectory()) await visit(target);
        else if (item.isFile()) {
          bytes += (await lstat(target)).size;
          if (bytes > 256 * 1024 * 1024) throw new Error('App data snapshot exceeds 256 MiB.');
        } else throw new Error('Unsupported App data entry.');
      }
    };
    await visit(root);
  }

  private sameGeneration(a: CatsInstalledAppRecord, b: CatsInstalledAppRecord) {
    return a.packageSha256 === b.packageSha256 && a.dataGeneration === b.dataGeneration
      && a.manifest.version === b.manifest.version;
  }

  private async verifiedFiles(record: CatsInstalledAppRecord) {
    if (!record.packageSha256 || !record.dataGeneration || !record.manifest.components
      || record.manifest.trustTier === 'third-party') throw new Error('A verified executable App installation is required.');
    const decoded = validateRendererPackage(await readFile(path.join(record.packagePath, 'payload.catsapp')),
      { id: record.id, version: record.manifest.version, sha256: record.packageSha256 });
    const root = await realpath(path.join(record.packagePath, 'files'));
    for (const file of decoded.files) {
      const target = await realpath(path.join(root, file.path));
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !(await readFile(target)).equals(file.data)) {
        throw new Error('App executable files changed; reinstall the verified package.');
      }
    }
    return decoded;
  }

  private async startUnlocked(record: CatsInstalledAppRecord) {
    if (this.closed) throw new Error('App host is closed.');
    const current = this.running.get(record.id);
    if (current) return current;
    const running = await this.launch(record, await this.verifiedFiles(record));
    this.running.set(record.id, running); return running;
  }

  private async launch(record: CatsInstalledAppRecord, decoded: Awaited<ReturnType<AppComponentHost['verifiedFiles']>>) {
    if (this.closed) throw new Error('App host is closed.');
    const processes = new Map<string, AppProcess>();
    const components = record.manifest.components!;
    const pending = [...components.services.map(item => ({ ...item, kind: 'service' as const })),
      ...components.workers.map(item => ({ ...item, kind: 'worker' as const }))];
    let stopping = false;
    try {
      while (pending.length) {
        const index = pending.findIndex(item => (item.dependsOn ?? []).every(id => processes.has(id)));
        if (index < 0) throw new Error('Invalid App startup dependency graph.');
        const item = pending.splice(index, 1)[0];
        const services = Object.fromEntries((item.dependsOn ?? []).flatMap(id => {
          const dependency = processes.get(id)!;
          return dependency.url ? [[id, { url: dependency.url, headers: { 'x-cats-component-key': dependency.key } }]] : [];
        }));
        processes.set(item.id, await startAppProcess({ entrypoint: path.join(record.packagePath, 'files', item.entrypoint),
          kind: item.kind, timeoutMs: this.options.readinessTimeoutMs,
          context: { appId: record.id, componentId: item.id, dataDir: this.dataDir(record.id, record.dataGeneration!), services },
          onExit: () => { if (!stopping) void this.recover(record.id); } }));
      }
      const gateway = await createAppGateway({ appId: record.id, version: record.manifest.version, components,
        ingress: () => {
          const status = this.ingressSnapshot();
          return { state: status.state, url: status.url ? `${status.url}/apps/${record.id}/mcp` : null,
            setupPath: '/settings/remote-access' };
        },
        files: new Map(decoded.files.map(file => [file.path, file.data])), processes,
        authorized: async () => {
          const active = await this.registry.getInstalledApp(record.id);
          return !!active?.enabled && active.installState === 'enabled' && this.sameGeneration(record, active);
        } });
      const result: RunningApp = { record, processes, gateway, get stopping() { return stopping; }, set stopping(value) { stopping = value; } };
      return result;
    } catch (error) {
      stopping = true; await Promise.all([...processes.values()].reverse().map(item => item.stop())); throw error;
    }
  }

  private async stopInstance(instance: RunningApp) {
    instance.stopping = true;
    await instance.gateway.close();
    for (const component of [...instance.processes.values()].reverse()) await component.stop();
  }

  private async stopUnlocked(appId: string) {
    const instance = this.running.get(appId); if (!instance) return;
    this.running.delete(appId); await this.stopInstance(instance);
  }

  private async recover(appId: string) {
    await this.serialize(appId, async () => {
      if (this.closed || !this.running.has(appId)) return;
      await this.stopUnlocked(appId);
      const attempts = (this.restarts.get(appId) ?? 0) + 1; this.restarts.set(appId, attempts);
      if (attempts > 2) { this.failures.set(appId, 'App stopped after repeated component failures. Disable and enable it to retry.'); return; }
      const record = await this.registry.getInstalledApp(appId);
      if (record?.enabled) await this.startUnlocked(record).catch(() => this.failures.set(appId, 'App restart failed.'));
    }).catch(() => {});
  }

  private async reconcile() {
    for (const [id, instance] of this.running) {
      const record = await this.registry.getInstalledApp(id).catch(() => null);
      if (!record?.enabled || !this.sameGeneration(instance.record, record)) {
        await this.serialize(id, () => this.stopUnlocked(id)).catch(() => {});
      }
    }
  }

  private async serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('App host is closed.');
    const pending = (this.queues.get(id) ?? Promise.resolve()).catch(() => {}).then(operation);
    this.queues.set(id, pending);
    try { return await pending; } finally { if (this.queues.get(id) === pending) this.queues.delete(id); }
  }
}
