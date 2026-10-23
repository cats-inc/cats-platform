import path from 'node:path';

import { IMAGE_ID, type RuntimeImageCapabilities } from '../../runtime/images.js';
import { ImageExecutionService, MediaImageError, isActiveImage, presentMediaImage, type ImageRuntimeClient } from './imageExecution.js';
import { CatImageLedger } from './catImageLedger.js';
import {
  authorizeCatImagePolicy,
  type CatImageCaller, type CatImageJob, type CatImageRequest,
} from './catImagePolicy.js';

export interface CatImageServiceDependencies {
  ledger: CatImageLedger;
  runtimeClient: ImageRuntimeClient;
  assetsDir: string;
  /** Host checks active Cat, owner, original conversation and exact binding; never supplied by the agent. */
  authorizeCaller(caller: CatImageCaller): Promise<void>;
  /** Startup recovery must prove the originating turn is no longer running before releasing held work. */
  canReleaseTurn?(runtimeSessionId: string): Promise<boolean>;
  now?(): Date;
}

export const presentCatImage = presentMediaImage;

/** Cat admission adapter for the same execution service used by Studio's App SDK. */
export class CatImageService {
  private readonly execution: ImageExecutionService<CatImageJob>;
  private readonly now: () => Date;

  constructor(private readonly dependencies: CatImageServiceDependencies) {
    if (!path.isAbsolute(dependencies.assetsDir)) throw new MediaImageError('invalid_media_store');
    this.now = dependencies.now ?? (() => new Date());
    this.execution = new ImageExecutionService({
      runtimeClient: dependencies.runtimeClient,
      read: async (id) => dependencies.ledger.get(id),
      update: async (id, patch) => dependencies.ledger.update(id, patch, this.now()),
      observeRuntime: async (job, remote) => dependencies.ledger.observeRuntime(job.id, remote, this.now()),
      beforeDispatch: async (job) => dependencies.ledger.claimDispatch(job.id, this.now()),
      resumeReceipt: async job => dependencies.ledger.recover(job.id, this.now()),
      sourceSessionId: (job) => job.runtimeSessionId,
      authorize: async (job) => {
        try {
        await dependencies.authorizeCaller(job);
        const policy = authorizeCatImagePolicy(dependencies.ledger.policy(job), job, this.now());
        if (policy.id !== job.policyId || policy.revision !== job.policyRevision
          || policy.bindingId !== job.bindingId || policy.bindingRevision !== job.bindingRevision) {
          throw new MediaImageError('image_not_authorized', 403);
        }
        } catch (error) {
          dependencies.ledger.cancelUndispatched(job.id, this.now());
          throw error;
        }
      },
      imagePath: (job, output) => path.join(dependencies.assetsDir, job.id + (output?.mimeType === 'image/png' ? '.png' : '.jpg')),
      revokedCode: 'image_not_authorized',
    });
  }

  async capabilities(caller: CatImageCaller): Promise<RuntimeImageCapabilities> {
    await this.dependencies.authorizeCaller(caller);
    const policy = authorizeCatImagePolicy(this.dependencies.ledger.policy(caller), caller, this.now());
    if (!this.dependencies.runtimeClient.getImageCapabilities) throw new MediaImageError('image_service_unavailable', 503);
    const capabilities = await this.dependencies.runtimeClient.getImageCapabilities();
    if (!capabilities.sourceSessionYield) throw new MediaImageError('image_runtime_upgrade_required', 503);
    return { ...capabilities,
      targets: capabilities.targets.filter((target) => target.id === policy.targetId),
      profiles: capabilities.profiles.filter((profile) => profile.id === policy.profileId
        && String(profile.revision) === policy.profileRevision && profile.targetIds.includes(policy.targetId))
        .map((profile) => ({ ...profile, targetIds: [policy.targetId],
          agentConfigs: profile.agentConfigs.filter((config) => config.id === policy.agentConfigId) }))
        .filter((profile) => profile.agentConfigs.length > 0) };
  }

  async submit(caller: CatImageCaller, value: unknown, deferUntilTurnEnd = false, assertAllowed: () => void = () => {}): Promise<CatImageJob> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MediaImageError('invalid_image_request');
    const request = value as Record<string, unknown>;
    if (Object.keys(request).length !== 3 || !['requestId', 'prompt', 'caption'].every((key) => key in request)
      || typeof request.requestId !== 'string' || !IMAGE_ID.test(request.requestId)
      || typeof request.prompt !== 'string' || typeof request.caption !== 'string') throw new MediaImageError('invalid_image_request');
    const policy = authorizeCatImagePolicy(this.dependencies.ledger.policy(caller), caller, this.now());
    const capabilities = await this.capabilities(caller);
    if (!capabilities.targets.length || !capabilities.profiles.length) throw new MediaImageError('image_profile_unavailable', 503);
    assertAllowed();
    const admission = this.dependencies.ledger.admit(caller, request as unknown as CatImageRequest, policy.revision, this.now(), deferUntilTurnEnd);
    if (admission.created && !deferUntilTurnEnd) this.execution.start(admission.job);
    return admission.job;
  }

  releaseTurn(runtimeSessionId: string): void {
    for (const job of this.dependencies.ledger.releaseTurn(runtimeSessionId, this.now())) this.execution.start(job);
  }

  hasPending(catId: string): boolean {
    return this.dependencies.ledger.list().some(job => job.catId === catId
      && (isActiveImage(job) || (job.status === 'interrupted' && !job.runtimeTerminalObserved)));
  }

  async cancelTurn(runtimeSessionId: string): Promise<void> {
    for (const job of this.dependencies.ledger.list().filter(job => job.runtimeSessionId === runtimeSessionId && isActiveImage(job))) {
      if (!this.dependencies.ledger.cancelUndispatched(job.id, this.now())) await this.execution.cancel(job);
    }
  }

  private async own(caller: CatImageCaller, id: string): Promise<CatImageJob> {
    await this.dependencies.authorizeCaller(caller);
    const job = this.dependencies.ledger.get(id);
    if (!job || job.accountId !== caller.accountId || job.ownerActorId !== caller.ownerActorId
      || job.catId !== caller.catId || job.conversationId !== caller.conversationId) throw new MediaImageError('image_not_found', 404);
    return job;
  }

  async get(caller: CatImageCaller, id: string): Promise<CatImageJob> {
    const job = await this.own(caller, id);
    if (job.status === 'interrupted' && !job.runtimeTerminalObserved) {
      const recovering = this.dependencies.ledger.recover(id, this.now());
      if (recovering) this.execution.watch(recovering);
    }
    return this.own(caller, id);
  }

  async status(caller: CatImageCaller, id: string) {
    const job = await this.get(caller, id);
    const delivery = this.dependencies.ledger.delivery(id);
    return { job: presentCatImage(job), delivery: delivery ? { status: delivery.status,
      transportMessageId: delivery.transportMessageId, error: delivery.error, stopped: Boolean(delivery.abandonedAt) } : null };
  }

  async cancel(caller: CatImageCaller, id: string): Promise<CatImageJob> {
    let job = await this.own(caller, id);
    if (this.dependencies.ledger.cancelUndispatched(id, this.now())) return this.own(caller, id);
    if (job.status === 'interrupted') job = this.dependencies.ledger.recover(id, this.now()) ?? job;
    await this.execution.cancel(job);
    return this.own(caller, id);
  }

  async image(caller: CatImageCaller, id: string) {
    const job = await this.own(caller, id);
    return this.execution.image(job, async () => { await this.own(caller, id); });
  }

  async ownerImage(accountId: string, ownerActorId: string, catId: string, id: string) {
    const own = async () => {
      const job = this.dependencies.ledger.get(id);
      if (!job || job.accountId !== accountId || job.ownerActorId !== ownerActorId || job.catId !== catId) {
        throw new MediaImageError('image_not_found', 404);
      }
      return job;
    };
    return this.execution.image(await own(), own);
  }

  async ownerCancel(accountId: string, ownerActorId: string, catId: string, id: string): Promise<void> {
    let job = this.dependencies.ledger.get(id);
    if (!job || job.accountId !== accountId || job.ownerActorId !== ownerActorId || job.catId !== catId) throw new MediaImageError('image_not_found', 404);
    if (job.status === 'succeeded') {
      this.dependencies.ledger.ensureDelivery(id, this.now());
      this.dependencies.ledger.abandonDelivery(id, this.now());
      return;
    }
    if (this.dependencies.ledger.cancelUndispatched(id, this.now())) return;
    if (job.status === 'interrupted') job = this.dependencies.ledger.recover(id, this.now()) ?? job;
    await this.execution.cancel(job);
  }

  /** A process restart reconciles saved attempts by reading them, never repeating the generating POST. */
  reconcile(): void {
    for (const job of this.dependencies.ledger.list()) {
      // Held work belongs to a tool turn. Routine polling must never release that turn.
      if (job.status === 'submitting' && job.dispatchState !== 'submitted') {
        if (job.dispatchState === 'released') this.execution.start(job);
      } else if (isActiveImage(job)) this.execution.watch(job);
      else if (job.status === 'interrupted' && !job.runtimeTerminalObserved) {
        const recovering = this.dependencies.ledger.recover(job.id, this.now());
        if (recovering) this.execution.watch(recovering);
      }
    }
  }

  async recoverHeld(): Promise<void> {
    if (!this.dependencies.canReleaseTurn) return;
    const sources = new Set(this.dependencies.ledger.list().filter(job => job.status === 'submitting'
      && job.dispatchState === 'held').map(job => job.runtimeSessionId));
    for (const source of sources) {
      if (await this.dependencies.canReleaseTurn(source)) this.releaseTurn(source);
    }
  }

  isIdle(): boolean { return this.execution.isIdle(); }
  close(): Promise<void> { return this.execution.close(); }
}
