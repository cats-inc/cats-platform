import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { CatsImageCapabilitiesV2, CatsImageJobV2 } from '#cats-app-format';

import type { RuntimeClient } from '../../runtime/client.js';
import {
  IMAGE_MAX_BYTES,
  RuntimeImageError,
  type RuntimeImageCapabilities,
  type RuntimeImageJob,
  type RuntimeImageMetadata,
  type RuntimeImageProvider,
} from '../../runtime/images.js';

export type MediaImageStatus = 'submitting' | 'running' | 'collecting' | 'succeeded'
  | 'failed' | 'cancelling' | 'cancelled' | 'interrupted';

/** Shared execution data. Caller identity and authority stay in the admission adapter. */
export interface MediaImageExecution {
  id: string;
  requestId: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  targetId: string;
  provider: RuntimeImageProvider;
  instance: string;
  profileId: string;
  profileRevision: string;
  agentConfigId: string | null;
  operation: 'image.generate';
  status: MediaImageStatus;
  agentModel: string | null;
  agentEffort: string | null;
  error: string | null;
  warnings: string[];
  executionOutcome: 'completed' | 'stopped_after_image' | null;
  output: RuntimeImageMetadata | null;
}

export type MediaImagePatch = Partial<Pick<MediaImageExecution,
  'status' | 'error' | 'agentModel' | 'agentEffort' | 'warnings' | 'executionOutcome' | 'output'>>;

export class MediaImageError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}

export type ImageRuntimeClient = Pick<RuntimeClient, 'getImageCapabilities' | 'submitImageJob'
  | 'getImageJob' | 'cancelImageJob' | 'deleteImageJob' | 'getImageBytes'>;

export interface ImageExecutionDependencies<Job extends MediaImageExecution> {
  runtimeClient: ImageRuntimeClient;
  /** Durable lookup, shared with the adapter's atomic admission and cancellation. */
  read(id: string): Promise<Job | undefined>;
  /** Must preserve cancellation and never resurrect deleted or terminal work. */
  update(id: string, patch: MediaImagePatch): Promise<Job | undefined>;
  /** Rechecked before dispatch, collection and exposing bytes. Never derived from model input. */
  authorize(job: Job): Promise<unknown>;
  observeRuntime?(job: Job, remote: RuntimeImageJob): Promise<void>;
  /** Atomically claim a durable dispatch after a Cat's source turn has released it. */
  beforeDispatch?(job: Job): Promise<boolean>;
  resumeReceipt?(job: Job): Promise<Job | undefined>;
  sourceSessionId?(job: Job): string;
  /** Managed asset location; an adapter must never accept a caller-supplied path. */
  imagePath(job: Job, output: Pick<RuntimeImageMetadata, 'mimeType'> | null): string;
  /** Collection-only repair of a previously validated legacy source failure. */
  reviveSource?(job: Job): Promise<void>;
  revokedCode: string;
}

export const isActiveImage = (job: Pick<MediaImageExecution, 'status'>): boolean =>
  ['submitting', 'running', 'collecting', 'cancelling'].includes(job.status);

export const isImageSourceFailure = (job: Pick<MediaImageExecution, 'status' | 'error'>): boolean =>
  job.status === 'failed' && job.error === 'invalid_image_source';

/** Runtime rejects these before invoking a media provider; unknown outcomes are never refunded. */
export const IMAGE_PREEXECUTION_REFUSALS: ReadonlySet<string> = new Set([
  'image_service_busy', 'runtime_capacity_full', 'image_transport_unsupported', 'invalid_image_request',
  'image_profile_unavailable', 'image_profile_changed', 'image_storage_limit', 'image_source_busy', 'image_source_unavailable',
]);

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
/** Shared public projection; private caller, policy, file and installation data never leave it. */
export function presentMediaImage(job: MediaImageExecution): CatsImageJobV2 {
  return { schemaVersion: 2, id: job.id, requestId: job.requestId, provider: job.provider,
    targetId: job.targetId, instanceLabel: job.instance, operation: job.operation,
    profileId: job.profileId, profileRevision: job.profileRevision, agentConfigId: job.agentConfigId,
    agentModel: job.agentModel, agentEffort: job.agentEffort, prompt: job.prompt, sources: [], options: {},
    status: job.status, error: job.error, warnings: [...job.warnings], executionOutcome: job.executionOutcome,
    output: job.output ? { ...job.output } : null, createdAt: job.createdAt, updatedAt: job.updatedAt };
}

export function presentMediaCapabilities(capabilities: RuntimeImageCapabilities): CatsImageCapabilitiesV2 {
  return { schemaVersion: 2, revision: capabilities.revision, maxPromptLength: capabilities.maxPromptLength,
    maxImageBytes: capabilities.maxImageBytes,
    targets: capabilities.targets.map((target) => ({
      id: target.id, provider: target.provider, instanceLabel: target.instance, availability: 'available',
    })), profiles: structuredClone(capabilities.profiles) };
}
const delay = () => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, 2000);
  timer.unref?.();
});

/**
 * One bounded image lifecycle for App SDK and Cat tools. Admission persists identity and budgets
 * before start(); reconnect/reopen only watch the original Runtime receipt, never submit again.
 * This layer knows neither App installation nor Cat roles, conversations or Telegram.
 */
export class ImageExecutionService<Job extends MediaImageExecution> {
  private closed = false;
  private readonly watchers = new Map<string, Promise<void>>();
  private readonly resuming = new Set<string>();

  constructor(private readonly dependencies: ImageExecutionDependencies<Job>) {}

  start(job: Job): void {
    if (this.closed) return;
    if (this.watchers.has(job.id)) return;
    this.track(job, () => this.dispatch(job));
  }

  watch(job: Job): void {
    if (this.closed) return;
    if (this.watchers.has(job.id)) return;
    this.track(job, () => this.poll(job));
  }

  isIdle(): boolean { return this.watchers.size === 0; }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled(this.watchers.values());
  }

  private track(job: Job, execute: () => Promise<void>): void {
    const pending = Promise.resolve().then(execute).catch(async () => {
      await this.dependencies.update(job.id, { error: 'image_service_unavailable' }).catch(() => {});
    }).finally(() => this.watchers.delete(job.id));
    this.watchers.set(job.id, pending);
  }

  private continueWatching(job: Job): void {
    const current = this.watchers.get(job.id);
    if (!current) { this.watch(job); return; }
    if (this.resuming.has(job.id)) return;
    this.resuming.add(job.id);
    void current.then(async () => {
      const latest = await this.dependencies.read(job.id);
      if (latest && isActiveImage(latest)) this.watch(latest);
    }).catch(() => {}).finally(() => this.resuming.delete(job.id));
  }

  private matches(job: Job, remote: RuntimeImageJob): boolean {
    return remote.id === job.id && remote.targetId === job.targetId && remote.prompt === job.prompt
      && remote.operation === job.operation && remote.profileId === job.profileId
      && remote.profileRevision === job.profileRevision
      && (!this.dependencies.sourceSessionId || remote.sourceSessionId === this.dependencies.sourceSessionId(job))
      && (job.agentConfigId === null || remote.agentConfigId === job.agentConfigId);
  }

  private async observe(job: Job, remote: RuntimeImageJob): Promise<void> {
    if (!this.matches(job, remote)) throw new MediaImageError('invalid_image');
    await this.dependencies.observeRuntime?.(job, remote);
  }

  private async dispatch(job: Job): Promise<void> {
    const deps = this.dependencies;
    try {
      await deps.authorize(job);
      const before = await deps.read(job.id);
      if (this.closed || before?.status !== 'submitting') return;
      if (!job.agentConfigId || !deps.runtimeClient.submitImageJob) {
        throw new MediaImageError('image_service_unavailable', 503);
      }
      if (deps.beforeDispatch && !await deps.beforeDispatch(job)) return;
      if (this.closed) return;
      const remote = await deps.runtimeClient.submitImageJob({
        id: job.id, targetId: job.targetId, profileId: job.profileId,
        profileRevision: job.profileRevision, agentConfigId: job.agentConfigId,
        operation: job.operation, prompt: job.prompt, sourceIds: [], options: {},
        ...(deps.sourceSessionId ? { sourceSessionId: deps.sourceSessionId(job) } : {}),
      });
      let after = await deps.read(job.id);
      if (after?.status === 'interrupted' && deps.resumeReceipt) after = await deps.resumeReceipt(after);
      if (!after || after.status === 'cancelling' || after.status === 'cancelled') {
        await deps.runtimeClient.cancelImageJob?.(job.id);
        return;
      }
      if (!isActiveImage(after)) return;
      await this.accept(job, remote);
      await this.poll(job);
    } catch (error) {
      // Only definite pre-execution refusals are terminal. An unknown POST is read, never replayed.
      if (error instanceof RuntimeImageError && IMAGE_PREEXECUTION_REFUSALS.has(error.code)) {
        await deps.update(job.id, { status: 'failed', error: error.code });
      } else await this.poll(job);
    }
  }

  private async poll(job: Job): Promise<void> {
    const deps = this.dependencies;
    let readFailures = 0;
    try {
      for (let attempt = 0; attempt < 160; attempt++) {
        if (this.closed) return;
        const current = await deps.read(job.id);
        if (!current || (!isActiveImage(current) && !isImageSourceFailure(current))) return;
        try { await deps.authorize(current); } catch {
          await this.cancelRevoked(current);
          const cancelled = await deps.read(job.id);
          if (cancelled?.status === 'cancelling') { await delay(); continue; }
          return;
        }
        let remote: RuntimeImageJob;
        try {
          const read = current.status === 'cancelling' ? deps.runtimeClient.cancelImageJob : deps.runtimeClient.getImageJob;
          if (!read) throw new MediaImageError('image_service_unavailable', 503);
          remote = await read.call(deps.runtimeClient, job.id);
          readFailures = 0;
        } catch (error) {
          if (++readFailures >= 3) {
            await deps.update(job.id, error instanceof RuntimeImageError && error.code === 'image_not_found'
              ? { status: 'interrupted', error: 'execution_interrupted' }
              : { error: 'image_service_unavailable' });
            return;
          }
          await delay();
          continue;
        }
        if (current.status === 'cancelling') {
          await this.observe(current, remote);
          if (remote.status === 'running' || remote.status === 'cancelling') {
            await deps.update(job.id, { status: 'cancelling' });
            await delay();
            continue;
          }
          await deps.update(job.id, remote.status === 'interrupted'
            ? { status: 'interrupted', error: 'execution_interrupted' }
            : { status: 'cancelled', error: 'cancelled' });
          return;
        }
        if (isImageSourceFailure(current)) {
          if (remote.status !== 'succeeded' || !this.matches(job, remote) || !deps.reviveSource) return;
          await deps.reviveSource(current);
        }
        try { await this.accept(job, remote); } catch (error) {
          await deps.update(job.id, error instanceof MediaImageError && error.code === 'invalid_image'
            ? { status: 'failed', error: 'invalid_image' }
            : { error: (error as NodeJS.ErrnoException).code === 'ENOSPC' ? 'storage_full' : 'image_service_unavailable' });
          return;
        }
        if (remote.status !== 'running' && remote.status !== 'cancelling') return;
        await delay();
      }
      await this.cancel(job);
    } catch {
      await deps.update(job.id, { error: 'image_service_unavailable' });
    }
  }

  private async accept(job: Job, remote: RuntimeImageJob): Promise<void> {
    const deps = this.dependencies;
    await this.observe(job, remote);
    const execution = { agentModel: remote.agentModel, agentEffort: remote.agentEffort,
      warnings: remote.warnings, executionOutcome: remote.executionOutcome };
    if (remote.status !== 'succeeded') {
      await deps.update(job.id, { status: remote.status, error: remote.error, ...execution });
      return;
    }
    if (!remote.output || !deps.runtimeClient.getImageBytes) throw new MediaImageError('invalid_image');
    await deps.update(job.id, { status: 'collecting' });
    const bytes = await deps.runtimeClient.getImageBytes(job.id);
    if (bytes.length > IMAGE_MAX_BYTES || bytes.length !== remote.output.bytes || hash(bytes) !== remote.output.sha256) {
      throw new MediaImageError('invalid_image');
    }
    await deps.authorize(job);
    const target = deps.imagePath(job, remote.output);
    await this.persistAsset(target, bytes);
    await deps.authorize(job);
    const saved = await deps.update(job.id, { status: 'succeeded', error: null, output: remote.output, ...execution });
    if (saved?.status !== 'succeeded' || saved.output?.sha256 !== remote.output.sha256) await rm(target, { force: true });
  }

  private async persistAsset(target: string, bytes: Uint8Array): Promise<void> {
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
      await rename(temporary, target);
      // Windows does not expose directory fsync; reads can recollect the original receipt if needed.
      if (process.platform !== 'win32') {
        const directory = await open(path.dirname(target), 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      }
    } finally { await rm(temporary, { force: true }); }
  }

  async cancel(job: Job): Promise<void> {
    if (!isActiveImage(job)) return;
    const deps = this.dependencies;
    await deps.update(job.id, { status: 'cancelling' });
    try {
      if (!deps.runtimeClient.cancelImageJob) throw new MediaImageError('image_service_unavailable', 503);
      const stopped = await deps.runtimeClient.cancelImageJob(job.id);
      await this.observe(job, stopped);
      await deps.update(job.id, stopped.status === 'interrupted'
        ? { status: 'interrupted', error: 'execution_interrupted' }
        : stopped.status === 'running' || stopped.status === 'cancelling'
          ? { status: 'cancelling' } : { status: 'cancelled', error: 'cancelled' });
      if (stopped.status === 'running' || stopped.status === 'cancelling') this.continueWatching(job);
    } catch (error) {
      await deps.update(job.id, error instanceof RuntimeImageError && error.code === 'image_not_found'
        ? { status: 'interrupted', error: 'execution_interrupted' }
        : { status: 'cancelling', error: 'image_service_unavailable' });
      this.continueWatching(job);
    }
  }

  async cancelRevoked(job: Job): Promise<void> {
    const deps = this.dependencies;
    await deps.update(job.id, { status: 'cancelling' });
    try {
      if (!deps.runtimeClient.cancelImageJob) throw new MediaImageError('image_service_unavailable', 503);
      const remote = await deps.runtimeClient.cancelImageJob(job.id);
      await this.observe(job, remote);
      await deps.update(job.id, remote.status === 'running' || remote.status === 'cancelling'
        ? { status: 'cancelling', error: deps.revokedCode }
        : remote.status === 'interrupted' ? { status: 'interrupted', error: 'execution_interrupted' }
          : { status: 'cancelled', error: deps.revokedCode });
      if (remote.status === 'running' || remote.status === 'cancelling') this.continueWatching(job);
    } catch {
      await deps.update(job.id, { status: 'cancelling', error: deps.revokedCode });
      this.continueWatching(job);
    }
  }

  async image(job: Job, authorizeRead: () => Promise<unknown>): Promise<{ bytes: Buffer; mimeType: RuntimeImageMetadata['mimeType'] }> {
    if (job.status !== 'succeeded' || !job.output) throw new MediaImageError('image_not_ready', 409);
    await authorizeRead();
    try { return await this.readAsset(job, authorizeRead); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT'
        && !(error instanceof MediaImageError && error.code === 'invalid_image')) throw error;
      const client = this.dependencies.runtimeClient;
      if (!client.getImageJob || !client.getImageBytes) throw error;
      const original = await client.getImageJob(job.id);
      if (!this.matches(job, original) || original.status !== 'succeeded'
        || original.output?.sha256 !== job.output.sha256 || original.output.bytes !== job.output.bytes
        || original.output.mimeType !== job.output.mimeType) throw new MediaImageError('invalid_image', 503);
      const bytes = await client.getImageBytes(job.id);
      if (bytes.length !== job.output.bytes || bytes.length > IMAGE_MAX_BYTES || hash(bytes) !== job.output.sha256) {
        throw new MediaImageError('invalid_image', 503);
      }
      await authorizeRead();
      if (!await this.currentAsset(job)) throw new MediaImageError('image_not_found', 404);
      await this.persistAsset(this.dependencies.imagePath(job, job.output), bytes);
      if (!await this.currentAsset(job)) {
        await rm(this.dependencies.imagePath(job, job.output), { force: true });
        throw new MediaImageError('image_not_found', 404);
      }
      return this.readAsset(job, authorizeRead);
    }
  }

  private async readAsset(job: Job, authorizeRead: () => Promise<unknown>): Promise<{ bytes: Buffer; mimeType: RuntimeImageMetadata['mimeType'] }> {
    if (!job.output) throw new MediaImageError('image_not_ready', 409);
    if (!await this.currentAsset(job)) throw new MediaImageError('image_not_found', 404);
    const file = await open(this.dependencies.imagePath(job, job.output), 'r');
    let bytes: Buffer;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size !== job.output.bytes || info.size > IMAGE_MAX_BYTES) throw new MediaImageError('invalid_image', 503);
      bytes = Buffer.alloc(info.size);
      let offset = 0;
      while (offset < bytes.length) {
        const next = await file.read(bytes, offset, bytes.length - offset, offset);
        if (!next.bytesRead) throw new MediaImageError('invalid_image', 503);
        offset += next.bytesRead;
      }
    } finally { await file.close(); }
    if (bytes.length !== job.output.bytes || hash(bytes) !== job.output.sha256) throw new MediaImageError('invalid_image', 503);
    await authorizeRead();
    if (!await this.currentAsset(job)) throw new MediaImageError('image_not_found', 404);
    return { bytes, mimeType: job.output.mimeType };
  }

  private async currentAsset(job: Job): Promise<boolean> {
    const latest = await this.dependencies.read(job.id);
    return latest?.status === 'succeeded' && latest.output?.sha256 === job.output?.sha256
      && latest.output?.bytes === job.output?.bytes && latest.output?.mimeType === job.output?.mimeType;
  }
}
