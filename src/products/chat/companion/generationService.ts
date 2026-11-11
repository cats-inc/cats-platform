import { createHash } from 'node:crypto';
import type { CatImageCaller, CatImageJob } from '../../../platform/multimedia/catImagePolicy.js';
import type { CatImageService } from '../../../platform/multimedia/catImages.js';
import type { RuntimeClient } from '../../../runtime/client.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { isCompanionCat } from '../../../shared/companionRole.js';
import { findCompanionDirectLane } from './life/presence.js';
import { CompanionPostError, type CompanionPostService } from './postService.js';
import type { CompanionMediaStore } from './mediaStore.js';
import type { CompanionBoxStore } from '../state/companion-box/storeTypes.js';
import type { ChatApiDependencies } from '../api/routeSupport.js';

/** Coordinates publication; execution receipts and reservations remain in CatImageService. */
export class CompanionGenerationService {
  constructor(private readonly deps: {
    store: CompanionBoxStore; media: CompanionMediaStore; posts: CompanionPostService;
    chatStore: ChatApiDependencies['chatStore']; runtime: RuntimeClient; service(): CatImageService | undefined; now(): Date;
  }) {}

  async authorize(caller: CatImageCaller, continuation = false) {
    const cat = (await this.deps.chatStore.read()).cats.find(row => row.id === caller.catId && row.status === 'active');
    if (!cat) throw new CompanionPostError('cat_not_found', 404);
    if ('sourceIds' in caller && Array.isArray(caller.sourceIds)) {
      await this.authorizeReferences(cat.id, caller.sourceIds);
    }
    if (caller.trigger !== 'heartbeat') return;
    const life = await this.deps.store.getLifeProfile(cat.id); const settings = await this.deps.media.settings(cat.id);
    if (!isCompanionCat(cat) || (!continuation && !life.enabled) || !settings.autoPost || (life.mode === 'auto' ? cat.group === 'admin' : life.mode !== 'companion')) {
      throw new CompanionPostError('automatic_posts_disabled', 409);
    }
  }
  private async authorizeReferences(catId: string, ids: string[]) {
    const settings = await this.deps.media.settings(catId);
    if (!settings.useProfileImages && (await this.deps.media.list(catId)).some(asset => ids.includes(asset.id) && ['avatar', 'cover'].includes(asset.origin))) {
      throw new CompanionPostError('profile_references_disabled', 409);
    }
  }
  async prepareSources(job: CatImageJob) {
    if (!this.deps.runtime.putMediaSource) throw new CompanionPostError('image_runtime_upgrade_required', 409);
    for (const id of job.sourceIds ?? []) {
      const { data, asset } = await this.deps.media.read(job.catId, id);
      await this.authorizeReferences(job.catId, [id]);
      const source = await this.deps.runtime.putMediaSource(id, data);
      if (source.metadata.sha256 !== asset.sha256) throw new CompanionPostError('invalid_media_source');
    }
  }
  job(catId: string, id: string) {
    const service = this.deps.service(); if (!service) throw new CompanionPostError('image_service_unavailable', 409);
    return service.publicationJob(catId, id);
  }
  async generate(caller: CatImageCaller, input: Record<string, unknown>, requestKey: string, assertAllowed = () => {}) {
    await this.authorize(caller);
    const service = this.deps.service(); if (!service) throw new CompanionPostError('image_service_unavailable', 409);
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 2000 || !['image', 'video'].includes(String(input.kind))) throw new CompanionPostError('invalid_generation_request');
    const supplied = input.referenceAssetIds ?? [];
    if (!Array.isArray(supplied) || supplied.some(id => typeof id !== 'string') || new Set(supplied).size !== supplied.length) throw new CompanionPostError('invalid_media_references');
    let references: string[] = supplied;
    const settings = await this.deps.media.settings(caller.catId);
    if (!references.length && settings.useProfileImages) {
      const cat = (await this.deps.chatStore.read()).cats.find(row => row.id === caller.catId);
      if (cat?.avatarUrl?.startsWith('data:image/')) references = [(await this.deps.media.dataUrl(caller.catId, cat.avatarUrl, 'avatar')).id];
    }
    if (!references.length || references.length > (input.kind === 'video' ? 1 : 3)) throw new CompanionPostError('reference_image_required');
    for (const id of references) {
      const { asset } = await this.deps.media.read(caller.catId, id);
      if (!settings.useProfileImages && ['avatar', 'cover'].includes(asset.origin)) throw new CompanionPostError('profile_references_disabled');
    }
    if (input.durationSeconds !== undefined && (typeof input.durationSeconds !== 'number' || ![6, 10].includes(input.durationSeconds))) throw new CompanionPostError('invalid_video_duration');
    const hash = createHash('sha256').update(`${caller.catId}:${requestKey}:generation`).digest('hex');
    const requestId = `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
    return service.submitPublication(caller, { requestId, prompt: input.prompt, caption: '', sourceIds: references,
      operation: input.kind === 'video' ? 'video.generate' : 'image.edit', options: input.kind === 'video' ? { durationSeconds: input.durationSeconds === 10 ? 10 : 6 } : {} },
      caller.trigger === 'heartbeat' ? { dailyLimit: settings.dailyLimit, intervalMinutes: settings.intervalMinutes } : { dailyLimit: 20, intervalMinutes: 0 }, true, assertAllowed);
  }
  async ownerGenerate(catId: string, input: Record<string, unknown>) {
    if (typeof input.requestKey !== 'string' || !input.requestKey || input.requestKey.length > 200
      || typeof input.body !== 'string' || input.body.length > 4000) throw new CompanionPostError('invalid_generation_request');
    const state = await this.deps.chatStore.read(); const core = await this.deps.chatStore.readCore();
    const lane = findCompanionDirectLane(state, catId);
    const caller: CatImageCaller = { catId, accountId: core.ownerProfile.actorId, ownerActorId: core.ownerProfile.actorId,
      conversationId: lane ? buildChatConversationId(lane.id) : `profile:${catId}`, runtimeSessionId: `owner-profile:${catId}`, trigger: 'manual' };
    // Admit held, persist publication, then release. An identical retry repairs this pair after interruption.
    const job = await this.generate(caller, input, input.requestKey);
    const intent = await this.deps.posts.queue(catId, { requestKey: input.requestKey, body: input.body, pendingJobIds: [job.id] }, { trigger: 'owner' });
    this.deps.service()?.releaseTurn(caller.runtimeSessionId);
    return { job: { id: job.id, status: job.status }, publication: intent };
  }
  async cancel(catId: string, intentId: string) {
    const ids = await this.deps.store.transaction(snapshot => {
      const intent = snapshot.publicationIntents.find(row => row.id === intentId && row.catId === catId);
      if (!intent || !['waiting_for_media', 'failed'].includes(intent.state)) throw new CompanionPostError('publication_not_cancellable', 409);
      intent.state = 'cancelled'; intent.updatedAt = this.deps.now().toISOString(); return intent.pendingJobIds;
    });
    for (const id of ids) { const service = this.deps.service(); const job = service?.publicationJob(catId, id);
      if (service && job) await service.ownerCancel(job.accountId, job.ownerActorId, catId, id); }
    return { cancelled: true };
  }
  async tick() {
    const service = this.deps.service(); if (!service) return;
    const jobs = service.publicationJobs();
    for (const job of jobs.filter(row => row.status === 'succeeded')) {
      if ((await this.deps.media.list(job.catId)).some(asset => asset.jobId === job.id)) continue;
      try {
        const result = await service.ownerImage(job.accountId, job.ownerActorId, job.catId, job.id);
        await this.deps.media.ingest(job.catId, result.bytes, 'generated', { sourceIds: job.sourceIds, jobId: job.id });
      } catch { /* Retry collection of this receipt later; other posts and notifications must still progress. */ }
    }
    for (const intent of (await this.deps.store.readSnapshot()).publicationIntents.filter(row => row.state === 'waiting_for_media')) {
      const attempts = intent.pendingJobIds.map(id => jobs.find(job => job.id === id && job.catId === intent.catId));
      const failed = attempts.find(job => job && (['failed', 'cancelled'].includes(job.status)
        || (job.status === 'interrupted' && job.runtimeTerminalObserved)));
      if (attempts.some(job => !job) || failed) { await this.fail(intent.id, failed?.error ?? 'generation_interrupted'); continue; }
      if (!attempts.every(job => job?.status === 'succeeded')) continue;
      try {
        await this.authorize({ ...attempts[0]!, trigger: intent.trigger === 'heartbeat' ? 'heartbeat' : 'manual' }, true);
        const assets = (await this.deps.media.list(intent.catId)).filter(asset => intent.pendingJobIds.includes(asset.jobId ?? ''));
        if (assets.length === intent.pendingJobIds.length) await this.deps.posts.completeMedia(intent.id, assets.map(asset => asset.id));
      } catch (error) { await this.fail(intent.id, error instanceof Error ? error.message : 'publication_failed'); }
    }
  }
  private async fail(id: string, error: string) {
    await this.deps.store.transaction(snapshot => { const row = snapshot.publicationIntents.find(row => row.id === id && row.state === 'waiting_for_media');
      if (row) { row.state = 'failed'; row.error = error; row.updatedAt = this.deps.now().toISOString(); } });
  }
}
