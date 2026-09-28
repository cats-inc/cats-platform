import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CoreStore } from '../../core/store.js';
import { upsertCoreTask, upsertCoreRun, upsertCoreArtifact } from '../../core/model/index.js';
import type { CatsCoreState } from '../../core/types.js';
import type { RuntimeClient } from '../../runtime/client.js';
import { IMAGE_ID, IMAGE_MAX_BYTES, RuntimeImageError, type RuntimeImageJob, type RuntimeImageMetadata } from '../../runtime/images.js';
import { FileCatsAppRegistry } from './registry.js';
import { resolveCatsAppStoragePathsFromChatState } from './paths.js';

export interface AppImageJob {
  schemaVersion: 1; id: string; requestId: string; appId: string; appVersion: string; accountId: string;
  prompt: string; instance: string; provider: 'grok'; agentModel: string | null;
  status: 'submitting' | 'running' | 'collecting' | 'succeeded' | 'failed' | 'cancelling' | 'cancelled' | 'interrupted';
  createdAt: string; updatedAt: string; error: string | null; output: RuntimeImageMetadata | null;
}
export class AppImageError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
export interface AppImageScope { appId: string; version: string; accountId: string; }
export interface AppImageInput { requestId: string; instance: string; prompt: string; }
export type ImageRuntimeClient = Pick<RuntimeClient, 'getImageCapabilities' | 'submitImageJob' | 'getImageJob' | 'cancelImageJob' | 'getImageBytes'>;
export interface AppImageDependencies { coreStore: CoreStore; runtimeClient: ImageRuntimeClient; chatStatePath: string; }
const activeStatuses = new Set(['submitting', 'running', 'collecting', 'cancelling']);
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const taskId = (id: string) => `task-app-image-${id}`;
const runId = (id: string) => `run-app-image-${id}`;
const jobs = (core: CatsCoreState) => core.tasks.flatMap((task) => {
  const job = task.metadata.appImage;
  return job && typeof job === 'object' && (job as AppImageJob).schemaVersion === 1 ? [job as AppImageJob] : [];
});
function replaceJob(core: CatsCoreState, job: AppImageJob): CatsCoreState {
  const terminal = !activeStatuses.has(job.status);
  const title = `Studio · ${job.prompt.slice(0, 70)}`;
  let next = upsertCoreTask(core, { id: taskId(job.id), title, orchestratorActorId: null,
    status: job.status === 'succeeded' ? 'completed' : job.status === 'cancelled' ? 'cancelled' : terminal ? 'blocked' : 'in_progress',
    metadata: { appImage: job }, createdAt: job.createdAt }).core;
  next = upsertCoreRun(next, { id: runId(job.id), taskId: taskId(job.id), title, orchestratorActorId: null,
    status: job.status === 'succeeded' ? 'completed' : job.status === 'cancelled' ? 'cancelled' : terminal ? 'failed' : 'running',
    createdAt: job.createdAt, startedAt: job.createdAt, completedAt: terminal ? job.updatedAt : null,
    metadata: { appId: job.appId, accountId: job.accountId, runtimeImageJobId: job.id, error: job.error } }).core;
  if (job.status === 'succeeded' && job.output) {
    next = upsertCoreArtifact(next, { id: `artifact-app-image-${job.id}`, title, kind: 'attachment', status: 'ready',
      taskId: taskId(job.id), runId: runId(job.id), mimeType: job.output.mimeType, sizeBytes: job.output.bytes,
      metadata: { appId: job.appId, accountId: job.accountId, runtimeImageJobId: job.id, ...job.output } }).core;
  }
  return next;
}

export function parseAppImageInput(value: unknown): AppImageInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppImageError('invalid_image_request');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['requestId', 'instance', 'prompt'].includes(key))
    || typeof input.requestId !== 'string' || !IMAGE_ID.test(input.requestId)
    || typeof input.instance !== 'string' || !input.instance || input.instance.length > 100
    || typeof input.prompt !== 'string' || !input.prompt.trim() || Array.from(input.prompt).length > 2000) throw new AppImageError('invalid_image_request');
  return { requestId: input.requestId, instance: input.instance, prompt: input.prompt.trim() };
}

export class AppImageService {
  private watchers = new Map<string, Promise<void>>();
  private mutations: Promise<unknown> = Promise.resolve();
  private paths;
  constructor(private readonly deps: AppImageDependencies) { this.paths = resolveCatsAppStoragePathsFromChatState(deps.chatStatePath); }
  private mutate(action: Parameters<CoreStore['updateCore']>[0]) {
    const next = this.mutations.catch(() => {}).then(() => this.deps.coreStore.updateCore(action));
    this.mutations = next; return next;
  }
  async authorize(scope: AppImageScope) {
    const app = await new FileCatsAppRegistry({ registryPath: this.paths.registryPath }).getInstalledApp(scope.appId);
    if (!app?.enabled || app.installState !== 'enabled' || app.manifest.version !== scope.version) throw new AppImageError('app_context_revoked', 409);
    if (!app.packageSha256 || !app.manifest.permissions.includes('media.images') || !app.manifest.permissions.includes('ui.route')) throw new AppImageError('app_permission_denied', 403);
    return app.packageSha256;
  }
  async capabilities(scope: AppImageScope) {
    const digest = await this.authorize(scope);
    if (!this.deps.runtimeClient.getImageCapabilities) throw new AppImageError('image_service_unavailable', 503);
    const result = await this.deps.runtimeClient.getImageCapabilities();
    if (digest !== await this.authorize(scope)) throw new AppImageError('app_context_revoked', 409);
    return result;
  }
  async list(scope: AppImageScope) {
    await this.authorize(scope);
    const own = jobs(await this.deps.coreStore.readCore()).filter((job) => job.appId === scope.appId && job.accountId === scope.accountId);
    for (const job of own) if (activeStatuses.has(job.status)) this.watch(job);
    return own.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  }
  async submit(scope: AppImageScope, value: unknown): Promise<AppImageJob> {
    const input = parseAppImageInput(value);
    await this.authorize(scope);
    if (!this.deps.runtimeClient.submitImageJob || !this.deps.runtimeClient.getImageJob) throw new AppImageError('image_service_unavailable', 503);
    // Deterministic ID prevents a lost HTTP response from admitting another Runtime execution.
    const digest = hash(JSON.stringify([scope.appId, scope.accountId, input.requestId]));
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
    let created = false; let result!: AppImageJob;
    await this.mutate((core) => {
      const own = jobs(core).filter((job) => job.appId === scope.appId && job.accountId === scope.accountId);
      const existing = own.find((job) => job.id === id);
      if (existing) {
        if (existing.prompt !== input.prompt || existing.instance !== input.instance) throw new AppImageError('image_request_conflict', 409);
        result = existing; return core;
      }
      if (own.some((job) => activeStatuses.has(job.status))) throw new AppImageError('image_service_busy', 429);
      if (own.length >= 100) throw new AppImageError('image_storage_limit', 409);
      const now = new Date().toISOString();
      result = { schemaVersion: 1, id, ...input, appId: scope.appId, appVersion: scope.version, accountId: scope.accountId,
        status: 'submitting', provider: 'grok', agentModel: null, createdAt: now, updatedAt: now, error: null, output: null };
      created = true; return replaceJob(core, result);
    });
    if (created) {
      const pending = this.dispatch(result).catch(() => {}).finally(() => this.watchers.delete(id));
      this.watchers.set(id, pending);
    }
    return result;
  }
  private async update(id: string, patch: Partial<AppImageJob>) {
    let result: AppImageJob | undefined;
    await this.mutate((core) => {
      const job = jobs(core).find((entry) => entry.id === id);
      if (!job || !activeStatuses.has(job.status)) { result = job; return core; }
      // A cancellation wins over a late successful/failed generation result.
      if (job.status === 'cancelling' && patch.status !== 'cancelled' && patch.status !== 'interrupted') { result = job; return core; }
      result = { ...job, ...patch, updatedAt: new Date().toISOString() };
      return replaceJob(core, result);
    });
    return result;
  }
  private scope(job: AppImageJob): AppImageScope { return { appId: job.appId, version: job.appVersion, accountId: job.accountId }; }
  private async dispatch(job: AppImageJob) {
    try {
      await this.authorize(this.scope(job));
      const before = jobs(await this.deps.coreStore.readCore()).find((entry) => entry.id === job.id);
      if (before?.status !== 'submitting') return;
      const remote = await this.deps.runtimeClient.submitImageJob!({ id: job.id, instance: job.instance, prompt: job.prompt });
      const after = jobs(await this.deps.coreStore.readCore()).find((entry) => entry.id === job.id);
      if (!after || !activeStatuses.has(after.status) || after.status === 'cancelling') {
        await this.deps.runtimeClient.cancelImageJob!(job.id); return;
      }
      await this.accept(job, remote);
      await this.poll(job);
    } catch (error) {
      // Do not resubmit after an ambiguous POST. A read can recover its existing receipt.
      if (error instanceof RuntimeImageError && ['image_service_busy', 'image_transport_unsupported', 'invalid_image_request'].includes(error.code)) {
        await this.update(job.id, { status: 'failed', error: error.code });
      } else await this.poll(job);
    }
  }
  private watch(job: AppImageJob) {
    if (this.watchers.has(job.id)) return;
    const pending = this.poll(job).catch(() => {}).finally(() => this.watchers.delete(job.id));
    this.watchers.set(job.id, pending);
  }
  private async poll(job: AppImageJob) {
    let readFailures = 0;
    try {
      for (let attempt = 0; attempt < 160; attempt++) {
        const current = jobs(await this.deps.coreStore.readCore()).find((entry) => entry.id === job.id);
        if (!current || !activeStatuses.has(current.status)) return;
        try { await this.authorize(this.scope(job)); } catch {
          await this.deps.runtimeClient.cancelImageJob?.(job.id);
          await this.update(job.id, { status: 'cancelled', error: 'app_context_revoked' }); return;
        }
        let remote: RuntimeImageJob;
        try {
          remote = current.status === 'cancelling'
            ? await this.deps.runtimeClient.cancelImageJob!(job.id) : await this.deps.runtimeClient.getImageJob!(job.id);
          readFailures = 0;
        } catch (error) {
          readFailures++;
          if (readFailures >= 3) {
            await this.update(job.id, error instanceof RuntimeImageError && error.code === 'image_not_found'
              ? { status: 'interrupted', error: 'execution_interrupted' }
              : { error: 'image_service_unavailable' });
            return; // list/reopen restarts reads, never the generating POST.
          }
          await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 2000); timer.unref?.(); });
          continue;
        }
        try { await this.accept(job, remote); }
        catch (error) {
          if (error instanceof AppImageError && error.code === 'invalid_image') await this.update(job.id, { status: 'failed', error: 'invalid_image' });
          else await this.update(job.id, { error: (error as NodeJS.ErrnoException).code === 'ENOSPC' ? 'storage_full' : 'image_service_unavailable' });
          return; // Retry collection of these same bytes on the next read.
        }
        if (remote.status !== 'running') return;
        await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 2000); timer.unref?.(); });
      }
      await this.deps.runtimeClient.cancelImageJob?.(job.id);
      await this.update(job.id, { status: 'interrupted', error: 'execution_interrupted' });
    } catch {
      await this.update(job.id, { error: 'image_service_unavailable' });
    }
  }
  async recover(scope: AppImageScope, id: string) {
    const job = await this.own(scope, id);
    if (job.status === 'interrupted') {
      await this.mutate((core) => {
        const latest = jobs(core).find((entry) => entry.id === id);
        return latest?.status === 'interrupted' ? replaceJob(core, { ...latest, status: 'running', error: null }) : core;
      });
    }
    this.watch(job);
    return this.own(scope, id);
  }
  private imagePath(job: AppImageJob) {
    return path.join(this.paths.dataDir, job.appId, 'images', hash(job.accountId), `${job.id}.jpg`);
  }
  private async accept(job: AppImageJob, remote: RuntimeImageJob) {
    if (remote.id !== job.id || remote.instance !== job.instance || remote.prompt !== job.prompt) throw new AppImageError('invalid_image');
    if (remote.status !== 'succeeded') {
      await this.update(job.id, { status: remote.status, error: remote.error, agentModel: remote.agentModel }); return;
    }
    if (!remote.output || !this.deps.runtimeClient.getImageBytes) throw new AppImageError('invalid_image');
    await this.update(job.id, { status: 'collecting' });
    const bytes = await this.deps.runtimeClient.getImageBytes(job.id);
    if (bytes.length > IMAGE_MAX_BYTES || bytes.length !== remote.output.bytes || hash(bytes) !== remote.output.sha256) throw new AppImageError('invalid_image');
    await this.authorize(this.scope(job));
    const target = this.imagePath(job);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, target);
    await this.authorize(this.scope(job));
    await this.update(job.id, { status: 'succeeded', error: null, output: remote.output, agentModel: remote.agentModel });
  }
  async cancel(scope: AppImageScope, id: string) {
    const job = await this.own(scope, id);
    if (!activeStatuses.has(job.status)) return job;
    await this.update(id, { status: 'cancelling' });
    try {
      const stopped = await this.deps.runtimeClient.cancelImageJob!(id);
      await this.update(id, stopped.status === 'interrupted'
        ? { status: 'interrupted', error: 'execution_interrupted' }
        : stopped.status === 'running' || stopped.status === 'cancelling'
          ? { status: 'cancelling' } : { status: 'cancelled', error: 'cancelled' });
    } catch (error) {
      await this.update(id, error instanceof RuntimeImageError && error.code === 'image_not_found'
        ? { status: 'interrupted', error: 'execution_interrupted' }
        : { status: 'cancelling', error: 'image_service_unavailable' });
      this.watch(job);
    }
    return this.own(scope, id);
  }
  private async own(scope: AppImageScope, id: string) {
    if (!IMAGE_ID.test(id)) throw new AppImageError('invalid_image_request');
    await this.authorize(scope);
    const job = jobs(await this.deps.coreStore.readCore()).find((entry) => entry.id === id && entry.appId === scope.appId && entry.accountId === scope.accountId);
    if (!job) throw new AppImageError('image_not_found', 404);
    return job;
  }
  async image(scope: AppImageScope, id: string) {
    const job = await this.own(scope, id);
    if (job.status !== 'succeeded' || !job.output) throw new AppImageError('image_not_ready', 409);
    const file = await open(this.imagePath(job), 'r');
    let bytes: Buffer;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size !== job.output.bytes || info.size > IMAGE_MAX_BYTES) throw new AppImageError('invalid_image', 503);
      bytes = Buffer.alloc(info.size);
      let offset = 0;
      while (offset < bytes.length) {
        const next = await file.read(bytes, offset, bytes.length - offset, offset);
        if (!next.bytesRead) throw new AppImageError('invalid_image', 503);
        offset += next.bytesRead;
      }
    } finally { await file.close(); }
    if (bytes.length !== job.output.bytes || hash(bytes) !== job.output.sha256) throw new AppImageError('invalid_image', 503);
    await this.authorize(scope); return bytes;
  }
  async revoke(appId: string) {
    for (const job of jobs(await this.deps.coreStore.readCore()).filter((entry) => entry.appId === appId && activeStatuses.has(entry.status))) {
      await this.update(job.id, { status: 'cancelling' });
      try { await this.deps.runtimeClient.cancelImageJob?.(job.id); await this.update(job.id, { status: 'cancelled', error: 'app_context_revoked' }); }
      catch { await this.update(job.id, { status: 'interrupted', error: 'execution_interrupted' }); }
    }
  }
}
const services = new WeakMap<CoreStore, AppImageService>();
export function appImages(deps: AppImageDependencies): AppImageService {
  let service = services.get(deps.coreStore);
  if (!service) { service = new AppImageService(deps); services.set(deps.coreStore, service); }
  return service;
}
