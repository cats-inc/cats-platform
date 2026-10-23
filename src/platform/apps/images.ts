import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CoreStore } from '../../core/store.js';
import { upsertCoreTask, upsertCoreRun, upsertCoreArtifact } from '../../core/model/index.js';
import { touchCoreState } from '../../core/model/shared.js';
import { ownerRecordDependencies } from '../../core/ownerManagement.js';
import { ownerSubjectKey } from '../../core/ownerLifecycle.js';
import type { CatsCoreState } from '../../core/types.js';
import type { RuntimeClient } from '../../runtime/client.js';
import { minimumVersion } from '#cats-app-package';
import {
  IMAGE_ID, IMAGE_MAX_BYTES, IMAGE_PROVIDERS, RuntimeImageError,
  type RuntimeImageCapabilities, type RuntimeImageJob, type RuntimeImageMetadata, type RuntimeImageProvider,
} from '../../runtime/images.js';
import { FileCatsAppRegistry } from './registry.js';
import { resolveCatsAppStoragePathsFromChatState } from './paths.js';

type AppImageStatus = 'submitting' | 'running' | 'collecting' | 'succeeded' | 'failed' | 'cancelling' | 'cancelled' | 'interrupted';
/** Persisted in Core task metadata. Schema 1 entries are read as their schema 2 equivalent and rewritten on update. */
export interface AppImageJob {
  schemaVersion: 2; id: string; requestId: string; appId: string; appVersion: string; accountId: string;
  prompt: string; targetId: string; provider: RuntimeImageProvider; instance: string;
  profileId: string; profileRevision: string; agentConfigId: string | null; operation: 'image.generate';
  agentModel: string | null; agentEffort: string | null; status: AppImageStatus;
  createdAt: string; updatedAt: string; error: string | null; warnings: string[];
  executionOutcome: 'completed' | 'stopped_after_image' | null; output: RuntimeImageMetadata | null;
}
interface SchemaOneAppImageJob {
  schemaVersion: 1; id: string; requestId: string; appId: string; appVersion: string; accountId: string;
  prompt: string; instance: string; provider: 'grok'; agentModel: string | null; status: AppImageStatus;
  createdAt: string; updatedAt: string; error: string | null; output: Omit<RuntimeImageMetadata, 'transparency'> | null;
}
/** Schema 1 jobs are Grok square JPEG generations; nothing beyond what that implies is invented. */
function upgradeJob(job: SchemaOneAppImageJob): AppImageJob {
  return { schemaVersion: 2, id: job.id, requestId: job.requestId, appId: job.appId, appVersion: job.appVersion, accountId: job.accountId,
    prompt: job.prompt, targetId: `grok/${job.instance}`, provider: 'grok', instance: job.instance, profileId: 'grok-generate',
    profileRevision: '1', agentConfigId: null, operation: 'image.generate', agentModel: job.agentModel, agentEffort: null,
    status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, error: job.error, warnings: [],
    executionOutcome: job.status === 'succeeded' ? 'completed' : null, output: job.output ? { ...job.output, transparency: 'opaque' } : null };
}
export class AppImageError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
export interface AppImageScope { appId: string; version: string; accountId: string; }
/**
 * The image contract an App sees. SDK 1.x Apps keep schema 1 (Grok generation, JPEG); an App whose manifest
 * requires App SDK 1.7.0 or later gets contract 2. A host never offers an App more than it declared.
 */
export type AppImageContract = 1 | 2;
export const IMAGE_CONTRACT_2_SDK = [1, 7, 0] as const;
export function imageContractFor(appSdk: string): AppImageContract {
  const floor = minimumVersion(appSdk);
  if (!floor) return 1;
  return (floor[0]! - IMAGE_CONTRACT_2_SDK[0] || floor[1]! - IMAGE_CONTRACT_2_SDK[1] || floor[2]! - IMAGE_CONTRACT_2_SDK[2]) >= 0 ? 2 : 1;
}
/** What a request asks Runtime to run, independent of the contract it arrived in. */
interface AppImageInput {
  requestId: string; prompt: string; targetId: string; provider: RuntimeImageProvider; instance: string;
  profile: { id: string; revision: string; agentConfigId: string } | null;
}
export type ImageRuntimeClient = Pick<RuntimeClient, 'getImageCapabilities' | 'submitImageJob' | 'getImageJob' | 'cancelImageJob' | 'deleteImageJob' | 'getImageBytes'>;
// Only finished work can be deleted; anything in flight or unconfirmed could still produce an image.
const deletableStatuses = new Set(['succeeded', 'failed', 'cancelled']);
export interface AppImageDependencies { coreStore: CoreStore; runtimeClient: ImageRuntimeClient; chatStatePath: string; }
const activeStatuses = new Set(['submitting', 'running', 'collecting', 'cancelling']);
const sourceFailure = (job: AppImageJob) => job.status === 'failed' && job.error === 'invalid_image_source';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const taskId = (id: string) => `task-app-image-${id}`;
const runId = (id: string) => `run-app-image-${id}`;
const jobs = (core: CatsCoreState) => core.tasks.flatMap((task) => {
  const job = task.metadata.appImage as { schemaVersion?: unknown } | undefined;
  if (!job || typeof job !== 'object') return [];
  if (job.schemaVersion === 2) return [job as AppImageJob];
  return job.schemaVersion === 1 ? [upgradeJob(job as SchemaOneAppImageJob)] : [];
});
const extension = (output: Pick<RuntimeImageMetadata, 'mimeType'> | null) => output?.mimeType === 'image/png' ? 'png' : 'jpg';
/** Schema 1 can describe only Grok JPEG work; anything else stays hidden from those Apps, never altered. */
export const visibleToContract = (job: AppImageJob, contract: AppImageContract) =>
  contract === 2 || (job.provider === 'grok' && (!job.output || job.output.mimeType === 'image/jpeg'));
/** The renderer projection: host account and package bookkeeping never leave the host. */
export function presentImageJob(job: AppImageJob, contract: AppImageContract) {
  const { mimeType, bytes, width, height, sha256, transparency } = job.output ?? {} as RuntimeImageMetadata;
  if (contract === 1) {
    return { schemaVersion: 1, id: job.id, requestId: job.requestId, prompt: job.prompt, instance: job.instance, provider: 'grok',
      agentModel: job.agentModel, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, error: job.error,
      output: job.output ? { mimeType, bytes, width, height, sha256 } : null };
  }
  return { schemaVersion: 2, id: job.id, requestId: job.requestId, provider: job.provider, targetId: job.targetId, instanceLabel: job.instance,
    operation: job.operation, profileId: job.profileId, profileRevision: job.profileRevision, agentConfigId: job.agentConfigId,
    agentModel: job.agentModel, agentEffort: job.agentEffort, prompt: job.prompt, sources: [], options: {}, status: job.status,
    error: job.error, warnings: job.warnings, executionOutcome: job.executionOutcome,
    output: job.output ? { mimeType, bytes, width, height, sha256, transparency } : null, createdAt: job.createdAt, updatedAt: job.updatedAt };
}
/** Schema 1 sees each Grok instance with a native 1:1 generation profile, as SDK 1.x always did. */
function schemaOneCapabilities(capabilities: RuntimeImageCapabilities) {
  const targets = capabilities.targets.filter((target) => target.provider === 'grok').flatMap((target) => {
    const profile = capabilities.profiles.find((entry) => entry.targetIds.includes(target.id)
      && entry.aspectRatio.mode === 'native' && entry.aspectRatio.options[0] === '1:1');
    return profile ? [{ provider: 'grok' as const, instance: target.instance, agentModel: profile.agentConfigs[0]!.model }] : [];
  });
  return { schemaVersion: 1, operation: 'image.generate', aspectRatio: '1:1', maxPromptLength: capabilities.maxPromptLength,
    maxImageBytes: capabilities.maxImageBytes, targets };
}
const artifactId = (id: string) => `artifact-app-image-${id}`;
const ownRecords = (id: string) => [['task', taskId(id)], ['run', runId(id)], ['artifact', artifactId(id)]] as const;
// References to a job's records from outside the job itself, such as Work links or activities.
function externalDependencies(core: CatsCoreState, id: string) {
  const own = new Set<string>(ownRecords(id).map(([, record]) => record));
  return ownRecords(id).flatMap(([family, record]) => ownerRecordDependencies(core, family, record)).filter((dependency) => !own.has(dependency.id));
}
function removeJob(core: CatsCoreState, id: string): CatsCoreState {
  const now = new Date().toISOString();
  let next: CatsCoreState = { ...core,
    tasks: core.tasks.filter((task) => task.id !== taskId(id)),
    runs: core.runs.filter((run) => run.id !== runId(id)),
    artifacts: core.artifacts.filter((artifact) => artifact.id !== artifactId(id)) };
  const lifecycle = core.ownerLifecycle;
  const keys = ownRecords(id).map(([family, record]) => ownerSubjectKey(family, record)).filter((key) => lifecycle?.entries[key]);
  if (lifecycle && keys.length) {
    // Archive/pin state of records that no longer exist would otherwise linger.
    const entries = { ...lifecycle.entries };
    for (const key of keys) delete entries[key];
    next = { ...next, ownerLifecycle: { ...lifecycle, entries, revision: lifecycle.revision + 1 } };
  }
  return touchCoreState(next, now);
}
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
    next = upsertCoreArtifact(next, { id: artifactId(job.id), title, kind: 'attachment', status: 'ready',
      taskId: taskId(job.id), runId: runId(job.id), mimeType: job.output.mimeType, sizeBytes: job.output.bytes,
      metadata: { appId: job.appId, accountId: job.accountId, runtimeImageJobId: job.id, ...job.output } }).core;
  }
  return next;
}

const key = (value: unknown, max = 120): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const CONTRACT_TWO_KEYS = ['requestId', 'targetId', 'profileId', 'profileRevision', 'agentConfigId', 'operation', 'prompt', 'sourceIds', 'options'];
/** Exact request shapes: schema 1 is `{requestId, instance, prompt}`; contract 2 names its target and profile. */
export function parseAppImageInput(value: unknown, contract: AppImageContract): AppImageInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppImageError('invalid_image_request');
  const input = value as Record<string, unknown>;
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (typeof input.requestId !== 'string' || !IMAGE_ID.test(input.requestId) || !prompt || Array.from(input.prompt as string).length > 2000) {
    throw new AppImageError('invalid_image_request');
  }
  if (contract === 1) {
    if (Object.keys(input).some((name) => !['requestId', 'instance', 'prompt'].includes(name)) || !key(input.instance, 100)) {
      throw new AppImageError('invalid_image_request');
    }
    return { requestId: input.requestId, prompt, targetId: `grok/${input.instance}`, provider: 'grok', instance: input.instance, profile: null };
  }
  const target = typeof input.targetId === 'string' ? /^([a-z]+)\/(.{1,100})$/.exec(input.targetId) : null;
  if (Object.keys(input).length !== CONTRACT_TWO_KEYS.length || CONTRACT_TWO_KEYS.some((name) => !(name in input))
    || !target || !IMAGE_PROVIDERS.includes(target[1] as RuntimeImageProvider) || !key(target[2], 100)
    || !key(input.profileId) || !key(input.profileRevision, 40) || !key(input.agentConfigId) || input.operation !== 'image.generate'
    || !Array.isArray(input.sourceIds) || input.sourceIds.length
    || !input.options || typeof input.options !== 'object' || Array.isArray(input.options) || Object.keys(input.options).length) {
    throw new AppImageError('invalid_image_request');
  }
  return { requestId: input.requestId, prompt, targetId: input.targetId as string, provider: target[1] as RuntimeImageProvider, instance: target[2]!,
    profile: { id: input.profileId as string, revision: input.profileRevision as string, agentConfigId: input.agentConfigId as string } };
}
const sameRequest = (job: AppImageJob, input: AppImageInput) => job.prompt === input.prompt && job.targetId === input.targetId
  // Schema 1 requests and jobs upgraded from schema 1 name no configuration of their own.
  && (!input.profile || job.agentConfigId === null || (job.profileId === input.profile.id
    && job.profileRevision === input.profile.revision && job.agentConfigId === input.profile.agentConfigId));

export class AppImageService {
  private watchers = new Map<string, Promise<void>>();
  private mutations: Promise<unknown> = Promise.resolve();
  private paths;
  constructor(private readonly deps: AppImageDependencies) { this.paths = resolveCatsAppStoragePathsFromChatState(deps.chatStatePath); }
  private mutate(action: Parameters<CoreStore['updateCore']>[0]) {
    const next = this.mutations.catch(() => {}).then(() => this.deps.coreStore.updateCore(action));
    this.mutations = next; return next;
  }
  private async installed(scope: AppImageScope) {
    const app = await new FileCatsAppRegistry({ registryPath: this.paths.registryPath }).getInstalledApp(scope.appId);
    if (!app?.enabled || app.installState !== 'enabled' || app.manifest.version !== scope.version) throw new AppImageError('app_context_revoked', 409);
    if (!app.packageSha256 || !app.manifest.permissions.includes('media.images') || !app.manifest.permissions.includes('ui.route')) throw new AppImageError('app_permission_denied', 403);
    return app;
  }
  async authorize(scope: AppImageScope) { return (await this.installed(scope)).packageSha256!; }
  /** Decided by the installed package's declared App SDK floor, so one App always sees one contract. */
  async contract(scope: AppImageScope): Promise<AppImageContract> {
    return imageContractFor((await this.installed(scope)).manifest.compatibility.appSdk);
  }
  private async runtimeCapabilities() {
    if (!this.deps.runtimeClient.getImageCapabilities) throw new AppImageError('image_service_unavailable', 503);
    return this.deps.runtimeClient.getImageCapabilities();
  }
  async capabilities(scope: AppImageScope) {
    const digest = await this.authorize(scope);
    const contract = await this.contract(scope);
    const capabilities = await this.runtimeCapabilities();
    if (digest !== await this.authorize(scope)) throw new AppImageError('app_context_revoked', 409);
    if (contract === 1) return schemaOneCapabilities(capabilities);
    return { schemaVersion: 2, revision: capabilities.revision, maxPromptLength: capabilities.maxPromptLength, maxImageBytes: capabilities.maxImageBytes,
      targets: capabilities.targets.map((target) => ({ id: target.id, provider: target.provider, instanceLabel: target.instance, availability: 'available' })),
      profiles: capabilities.profiles };
  }
  async list(scope: AppImageScope) {
    await this.authorize(scope);
    const contract = await this.contract(scope);
    const own = jobs(await this.deps.coreStore.readCore()).filter((job) => job.appId === scope.appId && job.accountId === scope.accountId);
    for (const job of own) if (activeStatuses.has(job.status) || sourceFailure(job)) this.watch(job);
    return own.filter((job) => visibleToContract(job, contract)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  }
  async submit(scope: AppImageScope, value: unknown): Promise<AppImageJob> {
    await this.authorize(scope);
    const input = parseAppImageInput(value, await this.contract(scope));
    if (!this.deps.runtimeClient.submitImageJob || !this.deps.runtimeClient.getImageJob) throw new AppImageError('image_service_unavailable', 503);
    // Deterministic ID prevents a lost HTTP response from admitting another Runtime execution.
    const digest = hash(JSON.stringify([scope.appId, scope.accountId, input.requestId]));
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
    const before = jobs(await this.deps.coreStore.readCore()).find((job) => job.id === id && job.appId === scope.appId && job.accountId === scope.accountId);
    if (before) {
      if (!sameRequest(before, input)) throw new AppImageError('image_request_conflict', 409);
      return before;
    }
    // A schema 1 request names only a Grok instance; it runs that instance's current native 1:1 generation profile.
    let profile = input.profile;
    if (!profile) {
      const capabilities = await this.runtimeCapabilities();
      const match = capabilities.profiles.find((entry) => entry.targetIds.includes(input.targetId)
        && entry.aspectRatio.mode === 'native' && entry.aspectRatio.options[0] === '1:1');
      if (!match) throw new AppImageError('image_transport_unsupported', 503);
      profile = { id: match.id, revision: String(match.revision), agentConfigId: match.agentConfigs[0]!.id };
    }
    const resolved = profile;
    let created = false; let result!: AppImageJob;
    const deleted = await this.deletedIds();
    await this.mutate((core) => {
      const own = jobs(core).filter((job) => job.appId === scope.appId && job.accountId === scope.accountId);
      const existing = own.find((job) => job.id === id);
      if (existing) {
        if (!sameRequest(existing, input)) throw new AppImageError('image_request_conflict', 409);
        result = existing; return core;
      }
      if (deleted.has(id)) throw new AppImageError('image_request_conflict', 409);
      if (own.some((job) => activeStatuses.has(job.status))) throw new AppImageError('image_service_busy', 429);
      if (own.length >= 100) throw new AppImageError('image_storage_limit', 409);
      const now = new Date().toISOString();
      result = { schemaVersion: 2, id, requestId: input.requestId, appId: scope.appId, appVersion: scope.version, accountId: scope.accountId,
        prompt: input.prompt, targetId: input.targetId, provider: input.provider, instance: input.instance, profileId: resolved.id,
        profileRevision: resolved.revision, agentConfigId: resolved.agentConfigId, operation: 'image.generate', agentModel: null,
        agentEffort: null, status: 'submitting', createdAt: now, updatedAt: now, error: null, warnings: [], executionOutcome: null, output: null };
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
      const remote = await this.deps.runtimeClient.submitImageJob!({ id: job.id, targetId: job.targetId, profileId: job.profileId,
        profileRevision: job.profileRevision, agentConfigId: job.agentConfigId!, operation: job.operation, prompt: job.prompt, sourceIds: [], options: {} });
      const after = jobs(await this.deps.coreStore.readCore()).find((entry) => entry.id === job.id);
      if (!after || !activeStatuses.has(after.status) || after.status === 'cancelling') {
        await this.deps.runtimeClient.cancelImageJob!(job.id); return;
      }
      await this.accept(job, remote);
      await this.poll(job);
    } catch (error) {
      // Do not resubmit after an ambiguous POST. A read can recover its existing receipt.
      if (error instanceof RuntimeImageError && ['image_service_busy', 'image_transport_unsupported', 'invalid_image_request',
        'image_profile_unavailable', 'image_profile_changed'].includes(error.code)) {
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
        if (!current || (!activeStatuses.has(current.status) && !sourceFailure(current))) return;
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
        // Runtime can recollect an existing image after a source-path fix. Never resubmit a failed job.
        if (sourceFailure(current)) {
          if (remote.status !== 'succeeded') return;
          if (remote.id !== job.id || remote.targetId !== job.targetId || remote.prompt !== job.prompt) return;
          await this.mutate((core) => {
            const latest = jobs(core).find((entry) => entry.id === job.id);
            return latest && sourceFailure(latest)
              ? replaceJob(core, { ...latest, status: 'collecting', error: null, updatedAt: new Date().toISOString() }) : core;
          });
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
  private imagePath(job: AppImageJob, output: Pick<RuntimeImageMetadata, 'mimeType'> | null = job.output) {
    return path.join(this.paths.dataDir, job.appId, 'images', hash(job.accountId), `${job.id}.${extension(output)}`);
  }
  private async accept(job: AppImageJob, remote: RuntimeImageJob) {
    if (remote.id !== job.id || remote.targetId !== job.targetId || remote.prompt !== job.prompt) throw new AppImageError('invalid_image');
    const execution = { agentModel: remote.agentModel, agentEffort: remote.agentEffort, warnings: remote.warnings, executionOutcome: remote.executionOutcome };
    if (remote.status !== 'succeeded') {
      await this.update(job.id, { status: remote.status, error: remote.error, ...execution }); return;
    }
    if (!remote.output || !this.deps.runtimeClient.getImageBytes) throw new AppImageError('invalid_image');
    await this.update(job.id, { status: 'collecting' });
    const bytes = await this.deps.runtimeClient.getImageBytes(job.id);
    if (bytes.length > IMAGE_MAX_BYTES || bytes.length !== remote.output.bytes || hash(bytes) !== remote.output.sha256) throw new AppImageError('invalid_image');
    await this.authorize(this.scope(job));
    const target = this.imagePath(job, remote.output);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, target);
    await this.authorize(this.scope(job));
    const saved = await this.update(job.id, { status: 'succeeded', error: null, output: remote.output, ...execution });
    // A job deleted while its bytes were being collected must not leave the file behind.
    if (!saved) await rm(target, { force: true });
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
  /**
   * Owner deletion of a finished job. Everything happens inside one Core mutation after the authoritative checks,
   * so a refusal changes nothing: reserve the request ID, remove the saved original, then drop the Core
   * task/run/artifact. A failed Core write leaves a listed job that can be deleted again. The Runtime receipt is
   * dropped afterwards, best effort.
   */
  async remove(scope: AppImageScope, id: string): Promise<{ deleted: true }> {
    const job = await this.own(scope, id);
    if (!deletableStatuses.has(job.status)) throw new AppImageError('image_not_deletable', 409);
    await this.mutate(async (latest) => {
      const current = jobs(latest).find((entry) => entry.id === id);
      if (!current) return latest;
      // Delete only what the owner saw: a status change in between (for example a recollected image) refuses.
      if (current.status !== job.status) throw new AppImageError('image_not_deletable', 409);
      if (externalDependencies(latest, id).length) throw new AppImageError('image_in_use', 409);
      await this.tombstone(id);
      await rm(this.imagePath(current), { force: true });
      return removeJob(latest, id);
    });
    // The App-visible work is gone either way; an unreachable or slow Runtime only keeps its own receipt.
    void Promise.resolve().then(() => this.deps.runtimeClient.deleteImageJob?.(id)).catch(() => {});
    return { deleted: true };
  }
  // Deleted job IDs stay reserved so a late or repeated submit of the same requestId never generates again.
  // The set is written only inside Core mutations, so writes are serialized; unknown or damaged data is never
  // overwritten and keeps image requests unavailable instead of silently dropping reservations.
  private deleted: Promise<Set<string>> | null = null;
  private get tombstonePath() { return path.join(this.paths.dataDir, 'image-deletions.json'); }
  private deletedIds(): Promise<Set<string>> {
    this.deleted ??= readFile(this.tombstonePath, 'utf8').then((content) => {
      const value = JSON.parse(content) as { schemaVersion?: unknown; ids?: unknown };
      if (value.schemaVersion !== 1 || !Array.isArray(value.ids)) throw new Error('Unsupported image deletion data');
      return new Set(value.ids.filter((entry): entry is string => typeof entry === 'string' && IMAGE_ID.test(entry)));
    }, (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return new Set<string>();
      throw error;
    }).catch(() => { this.deleted = null; throw new AppImageError('image_service_unavailable', 503); });
    return this.deleted;
  }
  private async tombstone(id: string) {
    const deleted = await this.deletedIds();
    const ids = [...deleted].filter((entry) => entry !== id).concat(id).slice(-2000);
    await mkdir(path.dirname(this.tombstonePath), { recursive: true });
    const temporary = `${this.tombstonePath}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx');
      try { await file.writeFile(JSON.stringify({ schemaVersion: 1, ids })); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.tombstonePath);
    } catch (error) { await rm(temporary, { force: true }); throw error; }
    // In place, so a submit already holding the set sees the reservation.
    deleted.clear(); for (const entry of ids) deleted.add(entry);
  }
  private async own(scope: AppImageScope, id: string) {
    if (!IMAGE_ID.test(id)) throw new AppImageError('invalid_image_request');
    await this.authorize(scope);
    const contract = await this.contract(scope);
    const job = jobs(await this.deps.coreStore.readCore()).find((entry) => entry.id === id && entry.appId === scope.appId && entry.accountId === scope.accountId);
    if (!job || !visibleToContract(job, contract)) throw new AppImageError('image_not_found', 404);
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
    await this.authorize(scope); return { bytes, mimeType: job.output.mimeType };
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
