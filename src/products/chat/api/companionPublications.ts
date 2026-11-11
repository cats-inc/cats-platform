import type { CompanionSnapshot } from '../companion/contracts.js';
import { CompanionGenerationService } from '../companion/generationService.js';
import { createHash } from 'node:crypto';
import { createCatActorId } from '../../../core/actors.js';
import type { RuntimeSendMessageInput } from '../../../platform/runtime/client.js';
import type { CatImageTurnResolution } from '../../../platform/multimedia/catImageTools.js';
import type { McpToolDefinition } from '../../../platform/mcp/jsonRpcServer.js';
import { RUNTIME_SUPERVISION_BOUNDARY } from '../../../platform/supervision/runtimeBoundary.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { ensurePlatformScopeId, resolvePlatformScopeIdPathFromChatState } from '../../../shared/platformScopeId.js';
import { isCompanionCat } from '../../../shared/companionRole.js';
import { CompanionPostError, CompanionPostService, companionPostRevision } from '../companion/postService.js';
import { CompanionMediaStore } from '../companion/mediaStore.js';
import { CompanionShareService } from '../companion/shareService.js';
import { CompanionNotificationService } from '../companion/notificationService.js';
import { projectCompanionProfile } from '../companion/profileReadModel.js';
import { findCompanionDirectLane } from '../companion/life/presence.js';
import { appendMessage, resolveLeadParticipantLease } from '../state/model/index.js';
import { updateChatState } from '../state/store.js';
import { buildRoomMessageMutationDetail, publishRoomMutation } from './transportEventPublisher.js';
import type { ChatApiDependencies } from './routeSupport.js';
import { MediaImageError } from '../../../platform/multimedia/imageExecution.js';
import type { CatImageCaller, CatImageJob } from '../../../platform/multimedia/catImagePolicy.js';
import type { CatImageService } from '../../../platform/multimedia/catImages.js';

const text = { type: 'string' };
const attachment = { type: 'object', additionalProperties: false, required: ['assetId', 'alt'], properties: { assetId: text, alt: text } };
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): McpToolDefinition => ({
  name, description, inputSchema: { type: 'object', additionalProperties: false, properties, required },
});
export const COMPANION_PUBLICATION_TOOLS: McpToolDefinition[] = [
  tool('media_list', 'List your managed assets, current avatar/cover, and relative source-directory filenames. Source files are private ingredients until explicitly attached.', {}),
  tool('media_import', 'Copy an image or video from your configured source directory into an immutable managed asset. Never modifies the source.', { path: text }, ['path']),
  tool('media_generate', 'Queue one new AI image or short video from your managed image/video assets. With no references, use your current avatar. Returns a jobId; call post_create with pendingJobIds then end this turn. A source video supplies its middle frame, not its original motion.', {
    prompt: text, kind: { type: 'string', enum: ['image', 'video'] }, referenceAssetIds: { type: 'array', maxItems: 3, items: text }, durationSeconds: { type: 'integer', enum: [6, 10] },
  }, ['prompt', 'kind']),
  tool('media_status', 'Read a generation receipt without starting another generation.', { jobId: text }, ['jobId']),
  tool('post_list', 'List your published profile posts, newest first. Returns a continuation cursor.', { cursor: text }),
  tool('post_get', 'Read one of your own posts including attachments and edit revision.', { postId: text }, ['postId']),
  tool('post_create', 'Publish one profile post with text and managed image/video attachments. Retrying this turn returns the original post. Source IDs alone are not attachments.', {
    body: { type: 'string', maxLength: 4000 }, title: { type: 'string', maxLength: 160 },
    attachments: { type: 'array', maxItems: 10, items: attachment }, sourceIds: { type: 'array', items: text }, tags: { type: 'array', items: text },
    pendingJobIds: { type: 'array', maxItems: 1, items: text }, share: { type: 'boolean' }, notify: { type: 'array', items: { type: 'string', enum: ['dm', 'telegram'] } },
  }),
  tool('post_update', 'Edit your post using its latest revision. Does not change its publication time or resurrect deleted content.', {
    postId: text, expectedRevision: { type: 'integer', minimum: 1 }, body: text, title: text, attachments: { type: 'array', maxItems: 10, items: attachment },
  }, ['postId', 'expectedRevision']),
  tool('post_delete', 'Remove your post and revoke its shared link and pending notifications. Original media/source files are retained.', { postId: text }, ['postId']),
  tool('post_share', 'Create a revocable link to one of your posts using the configured Remote Access origin. Does not send a message.', { postId: text }, ['postId']),
  tool('post_notify', 'Send a post link to the owner via DM or their pinned Telegram binding. The host selects the recipient; repeated requests do not send twice.',
    { postId: text, destination: { type: 'string', enum: ['dm', 'telegram'] }, retry: { type: 'boolean' } }, ['postId', 'destination']),
];
export const COMPANION_PUBLICATION_INSTRUCTIONS = 'Your Cats profile tools are available in the same cats MCP server. '
  + 'Use media_list for your avatar, cover and owner-selected source folder; media_import copies a source for attachments. '
  + 'Use post_create, post_update and post_delete to manage your own profile feed. post_share creates a link, post_notify queues its owner notification. '
  + 'For AI media call media_generate, then post_create with its pendingJobIds and the final post text, set share and notify on that post request if the owner wants a link, then end this turn. The host publishes when the media is ready; no second model turn is needed. '
  + 'Only claim an action succeeded when its receipt says so. Never describe an imported source image as newly AI generated. '
  + 'On a companion heartbeat, post only when automatic posting is enabled and there is a worthwhile new moment. Otherwise stay quiet. '
  + 'After publishing on a heartbeat, reply [quiet] to avoid repeating the same content as another conversation message.';

type Dependencies = Pick<ChatApiDependencies, 'companionStore' | 'chatStore' | 'mutationGate' | 'config' | 'telegramRelay' | 'eventHub' | 'now' | 'runtimeClient'>
  & { publicOrigin(): string | undefined; imageService?(): CatImageService | undefined };
export function createCompanionPublications(dependencies: Dependencies) {
  const { companionStore: store } = dependencies;
  const now = () => dependencies.now?.() ?? new Date();
  const posts = new CompanionPostService(store, now);
  const media = new CompanionMediaStore(store, dependencies.config.chatStatePath, now, dependencies.runtimeClient);
  const generation = new CompanionGenerationService({ store, media, posts, chatStore: dependencies.chatStore, runtime: dependencies.runtimeClient,
    service: () => dependencies.imageService?.(), now });
  const shares = new CompanionShareService(store, media, dependencies.publicOrigin, async catId => {
    const cat = (await dependencies.chatStore.read()).cats.find(row => row.id === catId && row.status === 'active');
    return cat?.name ?? null;
  }, now);
  async function recipient(catId: string, destination: 'dm' | 'telegram') {
    const state = await dependencies.chatStore.read();
    const core = await dependencies.chatStore.readCore();
    const cat = state.cats.find(row => row.id === catId && row.status === 'active');
    const lane = cat && findCompanionDirectLane(state, catId);
    if (!cat || !lane || !['active', 'watching'].includes(lane.status)) throw new CompanionPostError('owner_conversation_unavailable', 409);
    const base = { ownerId: core.ownerProfile.actorId, channelId: lane.id };
    if (destination === 'dm') return { target: base as Record<string, string>, cat, lane, binding: null, mapped: null };
    const bindings = core.botBindings.filter(row => row.platform === 'telegram' && row.status === 'active'
      && (row.catActorId ?? row.bossCatActorId) === createCatActorId(catId));
    const candidates = bindings.map(binding => ({ binding, mapped: dependencies.telegramRelay?.resolveBinding({ roomId: lane.id, bindingId: binding.id }) }))
      .filter(row => row.mapped?.bindingId === row.binding.id && row.mapped?.linkedRoomId === lane.id);
    if (candidates.length !== 1) throw new CompanionPostError('owner_telegram_unavailable', 409);
    const { binding, mapped } = candidates[0]!;
    const fingerprint = createHash('sha256').update(JSON.stringify([binding.id, binding.botToken, binding.updatedAt,
      mapped!.telegramChatId, mapped!.conversationId, mapped!.linkRevision ?? mapped!.createdAt])).digest('hex');
    return { target: { ...base, bindingId: binding.id, chatId: mapped!.telegramChatId, fingerprint }, cat, lane, binding, mapped: mapped! };
  }
  const notifications = new CompanionNotificationService({ store, shares, now,
    authorizeAutomatic: async catId => { await generation.authorize({ catId, trigger: 'heartbeat' } as CatImageCaller, true); },
    resolveTarget: async (catId, destination) => (await recipient(catId, destination)).target,
    async localLink(catId, postId, revision) {
      const post = await posts.get(catId, postId);
      if (post.metadata.profilePostStatus === 'removed') throw new CompanionPostError('companion_post_not_found', 404);
      if (companionPostRevision(post) !== revision) throw new CompanionPostError('post_revision_conflict', 409);
      const scopeId = await ensurePlatformScopeId({ filePath: resolvePlatformScopeIdPathFromChatState(dependencies.config.chatStatePath) });
      return { post, url: `cats://companion/v1/${scopeId}/${encodeURIComponent(catId)}/post/${encodeURIComponent(post.id)}` };
    },
    async send(intent, body, assertCurrent) {
      const source = await recipient(intent.catId, intent.destination);
      await assertCurrent();
      if (intent.destination === 'dm') {
        let messageId: string | null = null;
        let message: ReturnType<typeof appendMessage>['message'] | null = null;
        await dependencies.mutationGate.run(source.lane.id, async () => {
          await assertCurrent();
          await updateChatState(dependencies.chatStore, state => {
            const lane = state.channels.find(row => row.id === source.lane.id);
            if (!lane || !['active', 'watching'].includes(lane.status)) throw new CompanionPostError('owner_conversation_unavailable', 409);
            const existing = lane.messages.find(row => row.metadata.companionNotificationId === intent.id);
            if (existing) { messageId = existing.id; return state; }
            const result = appendMessage(state, lane.id, { senderKind: 'agent', senderName: source.cat.name, body }, now(), {
              origin: 'runtime', incrementUnread: true, metadata: { event: 'companion_post_shared',
                companionNotificationId: intent.id, companionPostId: intent.postId, transportDeliveryManaged: true,
                targetKind: 'cat', targetId: intent.catId },
            });
            message = result.message; messageId = result.message.id; return result.state;
          });
        });
        if (message) publishRoomMutation(dependencies.eventHub, source.lane.id, 'message_added', buildRoomMessageMutationDetail(message));
        return { state: 'sent', transportMessageId: messageId };
      }
      if (!source.binding || !source.mapped || !dependencies.telegramRelay) throw new CompanionPostError('owner_telegram_unavailable', 409);
      const receipt = await dependencies.telegramRelay.deliver({
        context: { bossCatId: null, bossCatName: null, bossCatActorId: null, botBindings: [source.binding],
          selectedBotBinding: source.binding, defaultBotBinding: source.binding },
        assertAllowed: assertCurrent,
        request: { operation: 'send', conversationId: source.mapped.conversationId, chatId: source.mapped.telegramChatId, text: body },
      });
      const matched = receipt.bindingId === source.binding.id && receipt.chatId === source.mapped.telegramChatId;
      return { state: receipt.reason === 'not_owner_chat' || receipt.reason === 'delivery_not_authorized' ? 'suppressed'
        : receipt.status === 'sent' && receipt.messageId && matched ? 'sent'
          : !matched || receipt.failureKind === 'uncertain' ? 'uncertain' : 'failed',
        transportMessageId: receipt.messageId, error: receipt.status === 'failed' ? receipt.reason ?? 'notification_delivery_failed' : undefined };
    },
  });
  async function project(records: Awaited<ReturnType<typeof posts.get>>[]) {
    return projectCompanionProfile({ derived: records, mediaAssets: (await store.readSnapshot()).mediaAssets }).posts;
  }
  async function resolveTurn(sessionId: string, input: RuntimeSendMessageInput): Promise<CatImageTurnResolution | null> {
    const meta = input.context?.metadata;
    if (meta?.supervisionBoundary !== RUNTIME_SUPERVISION_BOUNDARY || meta.supervisionProduct !== 'cats-chat'
      || !['runtime-dispatch', 'companion-heartbeat'].includes(String(meta.supervisionSurface))
      || meta.supervisionToolName !== 'cats.runtime.message.send' || typeof meta.supervisionActionId !== 'string') return null;
    const state = await dependencies.chatStore.read();
    const lane = state.channels.find(row => (row.id === meta.supervisionRunId || `chat:${row.id}` === meta.supervisionRunId)
      && row.status === 'active' && resolveLeadParticipantLease(row)?.sessionId === sessionId);
    const cat = lane && state.cats.find(row => row.status === 'active' && findCompanionDirectLane(state, row.id)?.id === lane.id);
    if (!cat || !lane) return null;
    const ownerId = (await dependencies.chatStore.readCore()).ownerProfile.actorId;
    return { caller: { accountId: ownerId, ownerActorId: ownerId, catId: cat.id,
      conversationId: buildChatConversationId(lane.id), runtimeSessionId: sessionId,
      trigger: meta.supervisionSurface === 'companion-heartbeat' ? 'heartbeat' : 'manual' },
      actionId: meta.supervisionActionId,
      publication: { channelId: lane.id,
        heartbeatKind: ['wake', 'regular', 'bedtime'].includes(String(meta.companionHeartbeatKind)) ? meta.companionHeartbeatKind as 'wake' | 'regular' | 'bedtime' : undefined,
        requestKey: typeof meta.sourceMessageId === 'string'
        ? `turn:${lane.id}:${meta.sourceMessageId}` : `turn:${meta.supervisionActionId}` },
      unavailable: { code: 'image_generation_not_configured', expiresAt: 'not configured' } };
  }
  async function callTool(name: string, args: Record<string, unknown>, turn: CatImageTurnResolution, assertAllowed = () => {}) {
    try {
      const state = await dependencies.chatStore.read();
      const cat = state.cats.find(row => row.id === turn.caller.catId && row.status === 'active');
      const lane = cat && findCompanionDirectLane(state, cat.id);
      if (!cat || !lane || lane.id !== turn.publication?.channelId || lane.status !== 'active'
        || resolveLeadParticipantLease(lane)?.sessionId !== turn.caller.runtimeSessionId) throw new CompanionPostError('post_scope_expired', 409);
      const definition = COMPANION_PUBLICATION_TOOLS.find(tool => tool.name === name);
      const properties = definition?.inputSchema.properties as Record<string, unknown> | undefined;
      if (!properties || Object.keys(args).some(key => !(key in properties))) throw new CompanionPostError('invalid_publication_request');
      const catId = cat.id;
      const settings = await media.settings(catId);
      const heartbeat = turn.caller.trigger === 'heartbeat';
      if (heartbeat && !['post_list', 'post_get', 'media_list', 'media_status'].includes(name)) {
        const life = await store.getLifeProfile(catId);
        if (!isCompanionCat(cat) || !life.enabled || (life.mode === 'auto' ? cat.group === 'admin' : life.mode !== 'companion') || !settings.autoPost
          || turn.publication.heartbeatKind === 'bedtime') {
          throw new CompanionPostError('automatic_posts_disabled', 409);
        }
        if (name === 'post_share' && !settings.autoShare) throw new CompanionPostError('automatic_sharing_disabled', 409);
        if (name === 'post_notify' && (!settings.notify.includes(args.destination as 'dm' | 'telegram')
          || (args.destination === 'telegram' && !settings.autoShare))) throw new CompanionPostError('automatic_notification_disabled', 409);
      }
      assertAllowed();
      const assertMutation = (snapshot: CompanionSnapshot) => {
        assertAllowed();
        if (!heartbeat) return;
        const current = snapshot.mediaSettings.find(row => row.catId === catId);
        const life = snapshot.boxes.find(row => row.catId === catId)?.life;
        if (!current?.autoPost || !life?.enabled || !isCompanionCat(cat)
          || (life.mode === 'auto' ? cat.group === 'admin' : life.mode !== 'companion')
          || turn.publication?.heartbeatKind === 'bedtime') throw new CompanionPostError('automatic_posts_disabled', 409);
        if ((name === 'post_share' || (name === 'post_notify' && args.destination === 'telegram')) && !current.autoShare) {
          throw new CompanionPostError('automatic_sharing_disabled', 409);
        }
        if (name === 'post_notify' && !current.notify.includes(args.destination as 'dm' | 'telegram')) {
          throw new CompanionPostError('automatic_notification_disabled', 409);
        }
      };
      let result: Record<string, unknown>;
      if (name === 'media_list') {
        let avatarId: string | null = null;
        if (settings.useProfileImages && cat.avatarUrl?.startsWith('data:image/')) avatarId = (await media.dataUrl(catId, cat.avatarUrl, 'avatar')).id;
        result = { assets: (await media.list(catId)).map(({ fileName: _fileName, ...asset }) => asset), sourceFiles: await media.sourceFiles(catId),
          avatarId, coverId: settings.useProfileImages ? settings.coverAssetId : null, automaticPosting: settings.autoPost };
      } else if (name === 'media_generate') { const job = await generation.generate(turn.caller, args, turn.publication!.requestKey, assertAllowed); result = { jobId: job.id, status: job.status, queued: true }; }
      else if (name === 'media_status') { const job = generation.job(catId, args.jobId as string); result = { jobId: job.id, status: job.status, error: job.error }; }
      else if (name === 'media_import') result = { asset: await media.importSource(catId, args.path as string, assertAllowed) };
      else if (name === 'post_list') { const page = await posts.list(catId, args.cursor as string | undefined); result = { posts: await project(page.items), nextCursor: page.nextCursor }; }
      else if (name === 'post_create') {
        const context = { trigger: heartbeat ? 'heartbeat' as const : 'owner' as const, actionId: turn.actionId, heartbeatKind: turn.publication.heartbeatKind, assertAllowed: assertMutation,
          share: heartbeat ? settings.autoShare : args.share === true, notify: heartbeat ? settings.notify.filter(destination => destination === 'dm' || settings.autoShare) : (Array.isArray(args.notify) ? args.notify.filter((row): row is 'dm' | 'telegram' => row === 'dm' || row === 'telegram') : []) };
        if (Array.isArray(args.pendingJobIds) && args.pendingJobIds.length) {
          for (const id of args.pendingJobIds) generation.job(catId, String(id));
          const intent = await posts.queue(catId, { ...args, requestKey: turn.publication.requestKey, pendingJobIds: args.pendingJobIds as string[] }, context);
          result = { publication: intent, queued: true };
        } else {
          const post = await posts.create(catId, { ...args, requestKey: turn.publication.requestKey }, context);
          result = { post: (await project([post]))[0], followup: context.share || context.notify.length ? 'pending' : 'none' };
        }
      } else {
        if (typeof args.postId !== 'string') throw new CompanionPostError('invalid_post_id');
        if (name === 'post_get') result = { post: (await project([await posts.get(catId, args.postId)]))[0] };
        else if (name === 'post_update') result = { post: (await project([await posts.update(catId, args.postId,
          { ...args, requestKey: `${turn.publication.requestKey}:edit`, expectedRevision: args.expectedRevision as number }, assertMutation)]))[0] };
        else if (name === 'post_delete') result = await posts.remove(catId, args.postId, assertMutation);
        else if (name === 'post_share') result = await shares.create(catId, args.postId, assertMutation);
        else if (name === 'post_notify') result = { notification: await notifications.enqueue(catId, args.postId, args.destination as 'dm' | 'telegram',
          { assertAllowed: assertMutation, retryFailed: args.retry === true, trigger: heartbeat ? 'heartbeat' : 'owner' }) };
        else throw new CompanionPostError('unknown_publication_tool');
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: error instanceof CompanionPostError || error instanceof MediaImageError ? error.code : 'publication_service_unavailable' }] };
    }
  }
  async function reconcilePublished() {
    const snapshot = await store.readSnapshot();
    for (const intent of snapshot.publicationIntents.filter(row => row.state === 'published'
      && row.followupState !== 'complete' && (row.share || row.notify.length))) {
      const settings = await media.settings(intent.catId);
      const life = await store.getLifeProfile(intent.catId);
      const cat = (await dependencies.chatStore.read()).cats.find(row => row.id === intent.catId && row.status === 'active');
      const automatic = intent.trigger === 'heartbeat';
      const allowed = !!cat && (!automatic || (isCompanionCat(cat)
        && (life.mode === 'companion' || (life.mode === 'auto' && cat.group !== 'admin')) && settings.autoPost));
      const destinations = intent.notify.filter(destination => !automatic || (settings.notify.includes(destination)
        && (destination === 'dm' || settings.autoShare)));
      const share = intent.share && (!automatic || settings.autoShare);
      // A blocked request retries when its actual prerequisites change, not every timer tick.
      const availability = await Promise.all(destinations.map(async destination => {
        try { return (await recipient(intent.catId, destination)).target; }
        catch (error) { return { error: error instanceof CompanionPostError ? error.code : 'recipient_unavailable' }; }
      }));
      const fingerprint = createHash('sha256').update(JSON.stringify([allowed, share, destinations, availability, dependencies.publicOrigin()])).digest('hex');
      if (intent.followupState === 'blocked' && intent.followupContext === fingerprint) continue;
      const assertFollowup = (latest: CompanionSnapshot) => {
        const current = latest.publicationIntents.find(row => row.id === intent.id);
        if (!current || current.state !== 'published' || current.followupState === 'complete') throw new CompanionPostError('publication_followup_cancelled', 409);
        if (automatic) {
          const currentSettings = latest.mediaSettings.find(row => row.catId === intent.catId);
          const currentLife = latest.boxes.find(row => row.catId === intent.catId)?.life;
          if (!currentSettings?.autoPost || !currentLife || (currentLife.mode === 'auto' ? cat?.group === 'admin' : currentLife.mode !== 'companion')
            || (share && !currentSettings.autoShare) || destinations.some(destination => !currentSettings.notify.includes(destination))) throw new CompanionPostError('automatic_publication_disabled', 409);
        }
      };
      let error: string | null = null;
      if (allowed) {
        if (share) try { await shares.create(intent.catId, intent.postId, assertFollowup); }
        catch (cause) { error = cause instanceof Error ? cause.message : 'share_failed'; }
        for (const destination of destinations) try {
          await notifications.enqueue(intent.catId, intent.postId, destination, { trigger: intent.trigger, assertAllowed: assertFollowup });
        } catch (cause) { error ??= cause instanceof Error ? cause.message : 'notification_failed'; }
      }
      await store.transaction(latest => {
        const row = latest.publicationIntents.find(row => row.id === intent.id && row.state === 'published' && row.followupState !== 'complete');
        if (row) { row.followupState = error ? 'blocked' : 'complete'; row.followupContext = fingerprint;
          row.error = !allowed ? 'automatic_publication_disabled' : error; row.updatedAt = now().toISOString(); }
      });
    }
  }
  let ticking: Promise<void> | null = null;
  let closed = false;
  return { posts, media, shares, notifications, resolveTurn, callTool, generation,
    async close() { closed = true; await ticking; },
    tick() {
      if (closed) return Promise.resolve();
      ticking ??= generation.tick().then(reconcilePublished).then(() => notifications.tick()).finally(() => { ticking = null; });
      return ticking;
    }, isIdle: () => ticking === null && notifications.isIdle() };
}
export type ChatCompanionPublications = ReturnType<typeof createCompanionPublications>;
