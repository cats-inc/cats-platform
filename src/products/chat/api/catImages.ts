import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { createCatActorId } from '../../../core/actors.js';
import type { BotBindingRecord } from '../../../core/types.js';
import { RuntimeSessionNotFoundError, type RuntimeSendMessageInput } from '../../../platform/runtime/client.js';
import { CatImageLedger } from '../../../platform/multimedia/catImageLedger.js';
import { CatImageService, presentCatImage } from '../../../platform/multimedia/catImages.js';
import type { CatImageTurnResolution } from '../../../platform/multimedia/catImageTools.js';
import { createCatImageDelivery } from '../../../platform/multimedia/catImageDelivery.js';
import { authorizeCatImagePolicy, type CatImageCaller, type CatImageJob, type CatImagePolicy } from '../../../platform/multimedia/catImagePolicy.js';
import { MediaImageError, presentMediaCapabilities } from '../../../platform/multimedia/imageExecution.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { RUNTIME_SUPERVISION_BOUNDARY } from '../../../platform/supervision/runtimeBoundary.js';
import { isCompanionCat } from '../../../shared/companionRole.js';
import { resolveCompanionDesiredPresence } from '../companion/life/rhythm.js';
import { sendBinary, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import type { TelegramConversationBinding, TelegramRelayContext } from '../../../platform/transports/telegram/contracts.js';
import { resolveLeadParticipantLease, appendMessage } from '../state/model/index.js';
import { findCompanionDirectLane } from '../companion/life/presence.js';
import { updateChatState } from '../state/store.js';
import { buildRoomMessageMutationDetail, publishRoomMutation } from './transportEventPublisher.js';
import type { ChatApiDependencies, ChatApiRouteContext } from './routeSupport.js';

type Dependencies = Pick<ChatApiDependencies, 'chatStore' | 'runtimeClient' | 'config' | 'mutationGate' | 'telegramRelay' | 'eventHub' | 'now'>
  & Partial<Pick<ChatApiDependencies, 'companionStore' | 'authStore'>> & { isTurnActive?(sessionId: string): boolean };
const editable = ['enabled', 'manual', 'proactive', 'targetId', 'profileId', 'profileRevision', 'agentConfigId',
  'dailyLimit', 'totalLimit', 'minIntervalMinutes', 'timeZone', 'windowStart', 'windowEnd', 'expiresAt', 'bindingId'] as const;
const fingerprint = (binding: BotBindingRecord, mapped: TelegramConversationBinding): string => createHash('sha256')
  .update(JSON.stringify([binding.id, binding.botToken, binding.updatedAt, binding.catActorId, binding.bossCatActorId,
    binding.status, mapped.telegramChatId, mapped.conversationId, mapped.linkedRoomId,
    mapped.linkRevision ?? mapped.createdAt])).digest('hex');

/** Chat owns Cat/lane/owner identity and message append; the multimedia service owns the execution. */
export function createChatCatImages(dependencies: Dependencies) {
  const directory = path.join(dependencies.config.platformDir, 'state', 'multimedia');
  const filename = path.join(directory, 'cat-images.sqlite');
  const assetsDir = path.join(directory, 'assets');
  const now = () => dependencies.now?.() ?? new Date();
  let ledger: CatImageLedger | undefined;
  let execution: CatImageService | undefined;
  let delivery: ReturnType<typeof createCatImageDelivery> | undefined;
  let stopped = false;
  let closing = false;

  async function context(catId: string, bindingId?: string) {
    const [state, core] = await Promise.all([dependencies.chatStore.read(), dependencies.chatStore.readCore()]);
    const cat = state.cats.find(row => row.id === catId);
    const lane = cat ? findCompanionDirectLane(state, cat.id) : null;
    const binding = core.botBindings.find(row => row.platform === 'telegram' && row.status === 'active'
      && (row.catActorId ?? row.bossCatActorId) === createCatActorId(catId) && (!bindingId || row.id === bindingId));
    const mapped = lane && binding ? dependencies.telegramRelay?.resolveBinding({ roomId: lane.id, bindingId: binding.id }) : null;
    return { state, core, cat, lane, binding, mapped };
  }

  async function authorizeCaller(caller: CatImageCaller) {
    const source = await context(caller.catId);
    if (stopped || !source.cat || source.cat.status !== 'active' || !source.lane
      || (source.lane.status !== 'active' && !(caller.trigger === 'manual' && source.lane.status === 'watching'))
      || source.core.ownerProfile.actorId !== caller.ownerActorId
      || buildChatConversationId(source.lane.id) !== caller.conversationId) throw new MediaImageError('image_not_authorized', 403);
    if (dependencies.authStore && !(dependencies.config.auth?.mode === 'unsafe_disabled'
      && caller.accountId === source.core.ownerProfile.actorId)) {
      const auth = await dependencies.authStore.readStateStatus();
      if (auth.status !== 'ready' || !auth.state.accounts.some(account => account.id === caller.accountId && account.status === 'active')
        || !auth.state.memberships.some(membership => membership.accountId === caller.accountId
          && membership.roles.some(role => role === 'owner' || role === 'admin'))) throw new MediaImageError('image_not_authorized', 403);
    }
    if (caller.trigger === 'heartbeat' && isCompanionCat(source.cat) && dependencies.companionStore) {
      const life = await dependencies.companionStore.getLifeProfile(source.cat.id);
      if ((life.sleepUntil && Date.parse(life.sleepUntil) > now().getTime())
        || !life.enabled || resolveCompanionDesiredPresence(life, source.cat.id, now()).presence !== 'awake') {
        throw new MediaImageError('image_not_authorized', 403);
      }
    }
  }

  async function authorizeDelivery(job: CatImageJob) {
    await authorizeCaller(job);
    const policy = authorizeCatImagePolicy((ledger ?? open()).policy(job), job, now());
    const source = await context(job.catId, job.bindingId);
    if (policy.id !== job.policyId || policy.revision !== job.policyRevision
      || !source.binding || !source.mapped || source.mapped.bindingId !== job.bindingId
      || source.mapped.linkedRoomId !== source.lane?.id
      || fingerprint(source.binding, source.mapped) !== job.bindingRevision) throw new MediaImageError('image_not_authorized', 403);
    return source;
  }

  function open(): CatImageLedger {
    if (stopped || closing) throw new MediaImageError('image_service_unavailable', 503);
    if (!ledger) {
      ledger = new CatImageLedger(filename);
      execution = new CatImageService({ ledger, runtimeClient: dependencies.runtimeClient, assetsDir, now,
        async canReleaseTurn(sessionId) {
          if (dependencies.isTurnActive?.(sessionId)) return false;
          try {
            const result = await dependencies.runtimeClient.observeSession(sessionId);
            return result.session.turnInFlight === false
              && ['ready', 'closed', 'terminated', 'terminated_with_error'].includes(String(result.session.status));
          } catch (error) { return error instanceof RuntimeSessionNotFoundError; }
        },
        async authorizeCaller(caller) {
          await authorizeCaller(caller);
          const policy = ledger!.policy(caller);
          const source = await context(caller.catId, policy?.bindingId);
          if (!policy || !source.binding || !source.mapped || source.mapped.bindingId !== policy.bindingId
            || fingerprint(source.binding, source.mapped) !== policy.bindingRevision) throw new MediaImageError('image_not_authorized', 403);
        } });
      delivery = createCatImageDelivery({ ledger, now, authorize: async job => { await authorizeDelivery(job); },
        async append(job, assertClaim) {
          const source = await authorizeDelivery(job);
          if (!source.lane || !source.cat) throw new MediaImageError('image_not_authorized', 403);
          let messageId = '';
          let appended: ReturnType<typeof appendMessage>['message'] | undefined;
          await dependencies.mutationGate.run(source.lane.id, async () => {
            await updateChatState(dependencies.chatStore, latest => {
              assertClaim();
              const lane = latest.channels.find(row => row.id === source.lane!.id);
              if (!lane || (lane.status !== 'active' && !(job.trigger === 'manual' && lane.status === 'watching'))) {
                throw new MediaImageError('image_not_authorized', 403);
              }
              const existing = lane.messages.find(row => row.metadata.catImageJobId === job.id);
              if (existing) { messageId = existing.id; return latest; }
              const next = appendMessage(latest, lane.id, { senderKind: 'agent', senderName: source.cat!.name, body: job.caption }, now(), {
                origin: 'runtime', incrementUnread: true,
                metadata: { event: 'cat_image_generated', catImageJobId: job.id, catImageCatId: job.catId,
                  catImageAttachment: { schemaVersion: 1, catId: job.catId, jobId: job.id, ...job.output },
                  targetKind: 'cat', targetId: job.catId, sessionId: job.runtimeSessionId,
                  // This intent has its own durable transport dispatcher; ordinary fanout must skip it.
                  transportDeliveryManaged: true },
              });
              appended = next.message; messageId = next.message.id; return next.state;
            });
          });
          if (appended) publishRoomMutation(dependencies.eventHub, source.lane.id, 'message_added', buildRoomMessageMutationDetail(appended));
          return messageId;
        },
        async deliver(job, assertClaim) {
          const source = await authorizeDelivery(job);
          if (!source.binding || !source.mapped || !dependencies.telegramRelay) throw new MediaImageError('image_not_authorized', 403);
          await execution!.image(job, job.id); // Validate/recollect the original bytes; never regenerate.
          const confirmed = await authorizeDelivery(job);
          if (!confirmed.binding || !confirmed.mapped) throw new MediaImageError('image_not_authorized', 403);
          const relayContext: TelegramRelayContext = { bossCatId: null, bossCatName: null, bossCatActorId: null,
            botBindings: [confirmed.binding], selectedBotBinding: confirmed.binding, defaultBotBinding: confirmed.binding };
          assertClaim();
          const receipt = await dependencies.telegramRelay.deliver({ context: relayContext,
            assertAllowed: async () => {
              await authorizeDelivery(job);
              assertClaim();
              const policy = authorizeCatImagePolicy(ledger!.policy(job), job, now());
              if (policy.revision !== job.policyRevision) throw new MediaImageError('image_not_authorized', 403);
            }, request: { operation: 'send_media',
            mediaKind: 'photo', conversationId: confirmed.mapped.conversationId, chatId: confirmed.mapped.telegramChatId,
            mediaFile: { path: path.join(assetsDir, job.id + (job.output?.mimeType === 'image/png' ? '.png' : '.jpg')),
              fileName: 'cat-image' + (job.output?.mimeType === 'image/png' ? '.png' : '.jpg') }, caption: job.caption || null } });
          const matched = receipt.bindingId === job.bindingId && receipt.chatId === confirmed.mapped.telegramChatId;
          return { status: receipt.reason === 'delivery_not_authorized' ? 'suppressed' as const
            : receipt.status === 'sent' && receipt.messageId && matched ? 'sent' as const
            : receipt.status !== 'failed' || !matched ? 'uncertain' as const
              : receipt.failureKind === 'retryable' ? 'retryable' as const
                : receipt.failureKind === 'rejected' ? 'failed' as const : 'uncertain' as const,
            receiptId: receipt.deliveryId, transportMessageId: receipt.messageId,
            error: receipt.status === 'failed' ? receipt.reason ?? 'telegram_delivery_failed' : null,
            retryAfterSeconds: receipt.retryAfterSeconds };
        } });
    }
    return ledger;
  }

  return {
    service(): CatImageService { open(); return execution!; },
    async resolveTurn(sessionId: string, input: RuntimeSendMessageInput): Promise<CatImageTurnResolution | null> {
      if (!ledger && !existsSync(filename)) return null;
      const meta = input.context?.metadata;
      if (meta?.supervisionBoundary !== RUNTIME_SUPERVISION_BOUNDARY || meta.supervisionProduct !== 'cats-chat'
        || !['runtime-dispatch', 'companion-heartbeat'].includes(String(meta.supervisionSurface))
        || meta.supervisionToolName !== 'cats.runtime.message.send' || typeof meta.supervisionRunId !== 'string'
        || typeof meta.supervisionActionId !== 'string') return null;
      const { channels, cats } = await dependencies.chatStore.read();
      const lane = channels.find(row => (row.id === meta.supervisionRunId || `chat:${row.id}` === meta.supervisionRunId)
        && resolveLeadParticipantLease(row)?.sessionId === sessionId);
      if (!lane || lane.status !== 'active') return null;
      const cat = cats.find(row => findCompanionDirectLane({ channels }, row.id)?.id === lane.id);
      if (!cat || cat.status !== 'active') return null;
      const core = await dependencies.chatStore.readCore();
      const policies = open().policies().filter(row => row.catId === cat.id && row.ownerActorId === core.ownerProfile.actorId);
      const enabled = policies.filter(row => row.enabled);
      const policy = enabled.length === 1 ? enabled[0] : policies.length === 1 ? policies[0] : undefined;
      if (!policy) return null;
      const caller: CatImageCaller = { accountId: policy.accountId, ownerActorId: core.ownerProfile.actorId,
        catId: cat.id, conversationId: buildChatConversationId(lane.id), runtimeSessionId: sessionId,
        trigger: meta.supervisionSurface === 'companion-heartbeat' ? 'heartbeat' : 'manual' };
      try {
        const capabilities = await execution!.capabilities(caller);
        if (!capabilities.targets.length || !capabilities.profiles.length) throw new MediaImageError('image_profile_unavailable', 503);
      } catch (error) {
        // A scoped but blocked turn needs a truthful explanation, not a silently
        // missing integration. This grants no MCP tool or execution authority.
        return { caller, actionId: meta.supervisionActionId, unavailable: {
          code: error instanceof MediaImageError ? error.code : 'image_service_unavailable',
          windowStart: policy.windowStart, windowEnd: policy.windowEnd, timeZone: policy.timeZone, expiresAt: policy.expiresAt,
        } };
      }
      return { caller, actionId: meta.supervisionActionId };
    },
    hasPending(catId: string) { return execution?.hasPending(catId) ?? false; },
    async tick() {
      if (stopped || closing) return;
      if (!ledger && !existsSync(filename)) return;
      open(); await execution!.recoverHeld(); execution!.reconcile(); await delivery!.tick();
    },
    isIdle: () => (!execution || execution.isIdle()) && (!delivery || delivery.isIdle()),
    async status(accountId: string, catId: string) {
      const source = await context(catId);
      if (!source.cat) throw new MediaImageError('cat_not_found', 404);
      const identity = { accountId, ownerActorId: source.core.ownerProfile.actorId, catId };
      const policy = open().policy(identity);
      const capabilities = await dependencies.runtimeClient.getImageCapabilities?.().catch(() => null);
      const bindings = source.core.botBindings.filter(row => row.platform === 'telegram' && row.status === 'active'
        && (row.catActorId ?? row.bossCatActorId) === createCatActorId(catId)).map(row => {
        const mapped = source.lane ? dependencies.telegramRelay?.resolveBinding({ roomId: source.lane.id, bindingId: row.id }) : null;
        return { id: row.id, name: row.botName, linked: Boolean(mapped && mapped.bindingId === row.id && mapped.linkedRoomId === source.lane?.id) };
      });
      const granted = policy?.enabled ? await context(catId, policy.bindingId) : null;
      const requiresBindingConfirmation = Boolean(granted && policy && (!granted.lane
        || buildChatConversationId(granted.lane.id) !== policy.conversationId
        || !granted.binding || !granted.mapped || granted.mapped.bindingId !== policy.bindingId
        || granted.mapped.linkedRoomId !== granted.lane.id
        || fingerprint(granted.binding, granted.mapped) !== policy.bindingRevision));
      return { policy: policy ?? null, capabilities: capabilities ? presentMediaCapabilities(capabilities) : null,
        ready: Boolean(capabilities?.sourceSessionYield && capabilities.profiles.length && source.lane && bindings.some(binding => binding.linked)),
        bindings, requiresBindingConfirmation,
        budget: policy ? ledger!.budget(identity, policy, now()) : null,
        jobs: ledger!.list(identity).slice(0, 50).map(job => ({ ...presentCatImage(job), delivery: ledger!.delivery(job.id) ?? null })) };
    },
    async save(accountId: string, catId: string, value: unknown) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MediaImageError('invalid_image_policy');
      const input = value as Record<string, unknown>;
      if (Object.keys(input).some(key => key !== 'revision' && !editable.includes(key as typeof editable[number]))
        || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new MediaImageError('invalid_image_policy');
      const core = await dependencies.chatStore.readCore();
      const identity = { accountId, ownerActorId: core.ownerProfile.actorId, catId };
      const previous = open().policy(identity);
      const explicitBinding = typeof input.bindingId === 'string';
      const source = await context(catId, explicitBinding ? input.bindingId as string : previous?.bindingId);
      if (!source.cat || source.cat.status !== 'active') throw new MediaImageError('cat_not_found', 404);
      if (input.enabled !== false && (!source.lane || !source.binding || !source.mapped
        || source.mapped.bindingId !== source.binding.id || source.mapped.linkedRoomId !== source.lane.id)) throw new MediaImageError('image_telegram_binding_required', 409);
      const policy = { ...previous, ...Object.fromEntries(editable.filter(key => key in input).map(key => [key, input[key]])),
        schemaVersion: 1, id: previous?.id ?? randomUUID(), ...identity, revision: Number(input.revision) + 1,
        conversationId: previous && !explicitBinding ? previous.conversationId
          : source.lane ? buildChatConversationId(source.lane.id) : previous?.conversationId,
        bindingId: previous && !explicitBinding ? previous.bindingId : source.binding?.id ?? previous?.bindingId,
        bindingRevision: previous && !explicitBinding ? previous.bindingRevision
          : source.binding && source.mapped ? fingerprint(source.binding, source.mapped) : previous?.bindingRevision,
        updatedAt: now().toISOString() } as CatImagePolicy;
      if (policy.enabled && ledger!.policies().some(row => row.enabled && row.catId === catId
        && row.ownerActorId === identity.ownerActorId && row.accountId !== accountId)) throw new MediaImageError('image_owner_scope_conflict', 409);
      if (policy.enabled) {
        const capabilities = await dependencies.runtimeClient.getImageCapabilities?.();
        if (!capabilities?.sourceSessionYield || !capabilities.profiles.some(profile => profile.id === policy.profileId
          && String(profile.revision) === policy.profileRevision && profile.targetIds.includes(policy.targetId)
          && profile.agentConfigs.some(config => config.id === policy.agentConfigId))) throw new MediaImageError('image_profile_unavailable', 409);
      }
      ledger!.savePolicy(policy, Number(input.revision));
      return this.status(accountId, catId);
    },
    async image(accountId: string, catId: string, id: string) {
      const ownerActorId = (await dependencies.chatStore.readCore()).ownerProfile.actorId;
      return this.service().ownerImage(accountId, ownerActorId, catId, id);
    },
    async retry(accountId: string, catId: string, id: string) {
      const ownerActorId = (await dependencies.chatStore.readCore()).ownerProfile.actorId;
      const job = open().get(id);
      if (!job || job.accountId !== accountId || job.ownerActorId !== ownerActorId || job.catId !== catId) throw new MediaImageError('image_not_found', 404);
      await authorizeDelivery(job); ledger!.retryDelivery(id, now()); return this.status(accountId, catId);
    },
    async cancel(accountId: string, catId: string, id: string) {
      const ownerActorId = (await dependencies.chatStore.readCore()).ownerProfile.actorId;
      await this.service().ownerCancel(accountId, ownerActorId, catId, id);
      return this.status(accountId, catId);
    },
    async close() {
      closing = true;
      await Promise.all([execution?.close(), delivery?.close()]);
      stopped = true;
      ledger?.close(); ledger = undefined;
    },
    async clearForReset() {
      if (!ledger && !existsSync(filename)) return;
      open();
      if (!execution!.isIdle() || !delivery!.isIdle() || ledger!.list().some(job => execution!.hasPending(job.catId))) {
        throw new MediaImageError('image_service_busy', 409);
      }
      ledger!.beginReset();
      try { await rm(assetsDir, { recursive: true, force: true }); ledger!.clearForReset(); }
      catch (error) { ledger!.cancelReset(); throw error; }
    },
  };
}

export type ChatCatImages = ReturnType<typeof createChatCatImages>;

export async function routeCatImages(context: ChatApiRouteContext): Promise<boolean> {
  const match = /^\/api\/cats\/([^/]+)\/(image-policy|images\/([a-f0-9-]+)\/(image|retry|cancel))$/.exec(context.url.pathname);
  if (!match) return false;
  try {
    if (context.auth?.principal && !context.auth.principal.membership.roles.some(role => role === 'owner' || role === 'admin')) {
      throw new MediaImageError('image_owner_required', 403);
    }
    const service = context.dependencies.catImages;
    if (!service) throw new MediaImageError('image_service_unavailable', 503);
    const accountId = context.auth?.principal?.account.id ?? (await context.dependencies.chatStore.readCore()).ownerProfile.actorId;
    const catId = decodeURIComponent(match[1]!);
    if (match[2] === 'image-policy') {
      if (context.method === 'GET') sendJson(context.response, 200, await service.status(accountId, catId), { 'Cache-Control': 'no-store' });
      else if (context.method === 'PUT') {
        let size = 0; const chunks: Buffer[] = [];
        for await (const chunk of context.request) { const bytes = Buffer.from(chunk); size += bytes.length;
          if (size > 8192) throw new MediaImageError('invalid_image_policy', 413); chunks.push(bytes); }
        let input: unknown; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new MediaImageError('invalid_image_policy'); }
        sendJson(context.response, 200, await service.save(accountId, catId, input));
      } else sendMethodNotAllowed(context.response, ['GET', 'PUT']);
    } else if (match[4] === 'image') {
      if (context.method !== 'GET') sendMethodNotAllowed(context.response, ['GET']);
      else { const image = await service.image(accountId, catId, match[3]!);
        sendBinary(context.response, 200, image.bytes, image.mimeType, { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); }
    } else if (context.method === 'POST') sendJson(context.response, 200, await service[match[4] === 'cancel' ? 'cancel' : 'retry'](accountId, catId, match[3]!));
    else sendMethodNotAllowed(context.response, ['POST']);
  } catch (error) { sendJson(context.response, error instanceof MediaImageError ? error.status : 503,
    { error: { code: error instanceof MediaImageError ? error.code : 'image_service_unavailable', message: error instanceof MediaImageError ? error.code : 'image_service_unavailable' } }); }
  return true;
}
