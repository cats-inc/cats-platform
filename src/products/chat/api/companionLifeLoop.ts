import {
  createCompanionLifeLoop,
  startCompanionLifeLoop,
  type CompanionHeartbeatRequest,
  type CompanionHeartbeatResult,
} from '../companion/life/loop.js';
import {
  buildCompanionHeartbeatPrompt,
  COMPANION_HEARTBEAT_METADATA_KEY,
  parseCompanionHeartbeatReply,
} from '../companion/life/heartbeat.js';
import {
  attachCompanionAlbumPhoto,
  buildCompanionPhotoTransportMetadata,
  extractCompanionPhotoDirective,
  formatCompanionPhotoAttachmentBlock,
} from '../companion/life/photos.js';
import { COMPANION_HEARTBEAT_EVENT, isCompanionCat } from '../../../shared/companionRole.js';
import { resolveFullResponseText } from '../../../platform/runtime/client.js';
import { sendSupervisedRuntimeMessage } from '../../../platform/supervision/runtimeBoundary.js';
import {
  appendMessage,
  buildChannelView,
  resolveLeadParticipantLease,
  setChannelParticipantLease,
} from '../state/model/index.js';
import {
  buildCatConversationContext,
  buildDefaultChatContinuityTransplantPackage,
} from '../state/prompts.js';
import { resolveRuntimeEnvelopeForTarget } from '../state/runtimeTargeting.js';
import { findAssignedParticipant } from '../shared/channelParticipants.js';
import { mergeRuntimeInvocationContextMetadata } from '../state/runtime-dispatch/context.js';
import {
  classifyRuntimeDispatchRecoveryError,
  describeProviderSessionUnavailableError,
  readRuntimeErrorSignal,
} from '../state/runtime-dispatch/recovery.js';
import { runWithSessionTurnGate } from '../state/runtime-dispatch/sessionTurnGate.js';
import type { ChatStore } from '../state/store.js';
import type { ChatState } from './contracts.js';
import { readConversationMetadata, readConversationsState, updateConversationsState } from './scopedConversationState.js';
import { ChatApiError } from './routeErrors.js';
import { isCatChatConversation } from '../companion/life/review.js';
import { isBossCatGroupConversation, isHiddenFromBossCat } from '../state/bossCatBoard.js';
import type { ChannelActivationResult } from './contracts.js';
import {
  activateChannelLocked,
  deactivateChannelLocked,
  publishChannelLifecycleEvents,
  type ChannelLifecycleDependencies,
} from './resources/channelActivation.js';
import type { ChatApiDependencies } from './routeSupport.js';
import { buildRoomMessageMutationDetail, publishRoomMutation } from './transportEventPublisher.js';
import { findCompanionDirectLane } from '../companion/life/presence.js';
import { withoutBossCatJoinRequests } from '../shared/ownerStarted.js';

export type ChatCompanionLifeLoopDependencies = ChannelLifecycleDependencies
  & Pick<ChatApiDependencies, 'mutationGate' | 'companionActivityStore' | 'catImages'>;

const RUNTIME_BUSY_PATTERN = /\bbusy\b/iu;

async function markCompanionLaneProviderSessionUnavailable(
  dependencies: ChatCompanionLifeLoopDependencies,
  request: CompanionHeartbeatRequest,
  error: string,
): Promise<void> {
  let changed = false;
  await dependencies.mutationGate.run(request.laneId, async () => {
    await updateConversationsState(dependencies.chatStore, [request.laneId], (latest) => {
      // A replacement or deliberately sleeping session must not be marked.
      if (!ownsHeartbeatLane(latest, request)) return latest;
      changed = true;
      const now = dependencies.now?.() ?? new Date();
      return setChannelParticipantLease(latest, request.laneId, request.catId, {
        status: 'error',
        lastError: describeProviderSessionUnavailableError(error),
        lastUsedAt: now.toISOString(),
      }, now);
    }, { excludeArchived: true });
  });
  if (changed) publishChannelLifecycleEvents(dependencies, request.laneId);
}

/**
 * SPEC-124 FR-21..FR-23: one hidden turn in the Cat's own lane session. A reply
 * other than `[quiet]` becomes an ordinary Cat message in the lane, and the
 * transport fanout mirrors it to a bound Telegram chat like any Desktop reply.
 */
export function createCompanionHeartbeatSpeaker(
  dependencies: ChatCompanionLifeLoopDependencies,
): (request: CompanionHeartbeatRequest) => Promise<CompanionHeartbeatResult> {
  async function speak(request: CompanionHeartbeatRequest): Promise<CompanionHeartbeatResult> {
    const state = await readConversationsState(dependencies.chatStore, [request.laneId], { excludeArchived: true });
    const cat = state.cats.find((candidate) => candidate.id === request.catId);
    if (!cat || cat.status !== 'active' || !isCompanionCat(cat)) {
      return 'failed';
    }
    const lane = state.channels.find(row => row.id === request.laneId);
    if (!lane) return 'failed';
    const channel = buildChannelView(state, lane.id);
    const participant = findAssignedParticipant(channel, request.catId);
    const lease = resolveLeadParticipantLease(lane);
    if (!participant || lane.status !== 'active' || lease?.participantId !== cat.id
      || lease.sessionId !== request.sessionId || !['ready', 'initializing'].includes(lease.status)) {
      return 'failed';
    }
    let companionSession: Awaited<ReturnType<typeof resolveRuntimeEnvelopeForTarget>>['companionSession'];
    let replyText: string;
    try {
      const envelope = await resolveRuntimeEnvelopeForTarget(state, channel, {
        participantKind: 'cat', participantId: cat.id, participantName: cat.name,
        sessionId: request.sessionId, laneId: lease.laneId ?? null,
      }, undefined, undefined, request.now, dependencies.companionStore);
      companionSession = envelope.companionSession;
      // Always bounded to the same product conversation. This also repairs
      // sessions created by older builds without continuity, including quiet
      // first turns that leave no visible message to mark hydration complete.
      // SPEC-139 FR-10: the owner's join card never enters a model's context.
      const continuity = buildDefaultChatContinuityTransplantPackage(withoutBossCatJoinRequests(lane.messages));
      const content = buildCompanionHeartbeatPrompt({
        kind: request.kind,
        now: request.now,
        awakeSince: request.awakeSince,
        lastOwnerMessageAt: request.lastOwnerMessageAt,
        companionContext: [
          buildCatConversationContext(channel, state.globalOrchestrator, participant, companionSession),
          !channel.responseLanguage || channel.responseLanguage === 'unspecified'
            ? 'Use the language of your owner\'s conversation. The language of this hidden system prompt is not a language preference.'
            : null,
        ].filter(Boolean).join('\n\n'),
        hasPhotoAlbum: request.mode === 'companion' && request.kind !== 'bedtime' && Boolean(companionSession?.photoAlbum),
        mode: request.mode,
        unanswered: request.unanswered,
        review: request.review,
        ...(request.peers ? { peers: true } : {}),
      });
      const result = await runWithSessionTurnGate(request.sessionId, async () => {
        const latest = await readConversationMetadata(dependencies.chatStore, request.laneId);
        if (!ownsHeartbeatLane(latest, request)) throw new ChatApiError(409, 'conversation_changed', 'The companion session changed.');
        return sendSupervisedRuntimeMessage({
        runtimeClient: dependencies.runtimeClient,
        sessionId: request.sessionId,
        content,
        input: {
          instructions: continuity.instructions ?? undefined,
          context: mergeRuntimeInvocationContextMetadata(envelope.context, {
            continuityMode: continuity.mode,
            continuityDeliveryMode: continuity.instructions ? 'turn_instructions' : 'none',
            companionHeartbeatKind: request.kind,
          }),
          skills: envelope.skills,
        },
        supervision: {
          product: 'cats-chat',
          surface: 'companion-heartbeat',
          runId: request.laneId,
          actionId: `companion-heartbeat:${request.catId}:${request.now.toISOString()}`,
          actorRef: request.catId,
          reason: 'companion_heartbeat',
        },
        });
      });
      replyText = resolveFullResponseText(result.segments);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (classifyRuntimeDispatchRecoveryError(message, readRuntimeErrorSignal(error))?.reason
        === 'provider_session_unavailable') {
        // The lane would otherwise stay `ready` on a session that can never answer.
        // Marking it lets the next wake rotate it in the same cwd (ADR-068 §2).
        await markCompanionLaneProviderSessionUnavailable(dependencies, request, message);
        return 'failed';
      }
      return RUNTIME_BUSY_PATTERN.test(message) ? 'busy' : 'failed';
    }

    // Even [quiet] completes a real Runtime turn. Persist that progress without
    // reviving a lane the owner closed, or overwriting a replacement session.
    let becameReady = false;
    await dependencies.mutationGate.run(request.laneId, async () => {
      await updateConversationsState(dependencies.chatStore, [request.laneId], (latest) => {
        const current = latest.channels.find((row) => row.id === request.laneId);
        const lease = current ? resolveLeadParticipantLease(current) : null;
        if (!ownsHeartbeatLane(latest, request) || lease?.status !== 'initializing') return latest;
        becameReady = true;
        const now = dependencies.now?.() ?? new Date();
        return setChannelParticipantLease(latest, request.laneId, request.catId,
          { status: 'ready', lastUsedAt: now.toISOString() }, now);
      }, { excludeArchived: true });
    });
    if (becameReady) publishChannelLifecycleEvents(dependencies, request.laneId);

    const directive = extractCompanionPhotoDirective(replyText);
    const reply = parseCompanionHeartbeatReply(directive.body);
    const heartbeatActionId = `companion-heartbeat:${request.catId}:${request.now.toISOString()}`;
    const published = (await dependencies.companionStore.readSnapshot()).derived.some(row => row.catId === request.catId
      && row.metadata.profileHeartbeatActionId === heartbeatActionId);
    if (reply.quiet && directive.requested === null) {
      return published ? 'spoke' : 'quiet';
    }
    const text = reply.quiet ? '' : reply.body;
    const photoState = await readConversationMetadata(dependencies.chatStore, request.laneId);
    if (!ownsHeartbeatLane(photoState, request)) return 'failed';
    const photo = await attachCompanionAlbumPhoto({
      state: photoState,
      laneId: request.laneId,
      album: companionSession?.photoAlbum ?? null,
      requested: directive.requested,
      runtimeDataDir: dependencies.config.runtimeDataDir,
    });
    const body = photo ? `${formatCompanionPhotoAttachmentBlock(photo)}${text}` : text;
    if (!body.trim() && !photo) {
      return 'quiet';
    }
    const message = await dependencies.mutationGate.run(request.laneId, async () => {
      let appended: ReturnType<typeof appendMessage>['message'] | null = null;
      await updateConversationsState(dependencies.chatStore, [request.laneId], (latest) => {
        if (!ownsHeartbeatLane(latest, request)) return latest;
        const currentCat = latest.cats.find(row => row.id === request.catId)!;
        const next = appendMessage(
          latest,
          request.laneId,
          { senderKind: 'agent', senderName: currentCat.name, body },
          dependencies.now?.() ?? new Date(),
          {
            metadata: {
              // Not an assistant turn segment: live indicators must not read it as a reply.
              event: COMPANION_HEARTBEAT_EVENT,
              [COMPANION_HEARTBEAT_METADATA_KEY]: { kind: request.kind, actionId: heartbeatActionId },
              targetKind: 'cat',
              targetId: request.catId,
              sessionId: request.sessionId,
              ...(photo ? buildCompanionPhotoTransportMetadata(photo) : {}),
            },
            origin: 'runtime',
            incrementUnread: true,
          },
        );
        appended = next.message;
        return next.state;
      }, { excludeArchived: true });
      return appended;
    });
    if (message) {
      publishRoomMutation(
        dependencies.eventHub,
        request.laneId,
        'message_added',
        buildRoomMessageMutationDetail(message),
      );
      dependencies.eventHub?.emit({
        kind: 'recents_changed',
        channelId: request.laneId,
        timestamp: new Date().toISOString(),
      });
    }
    return message ? 'spoke' : 'failed';
  }
  return async request => {
    let release: (() => Promise<void>) | null | undefined;
    try {
      if (dependencies.chatStore.reserveConversationOperation) {
        try { release = await dependencies.chatStore.reserveConversationOperation(request.laneId); }
        catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'conversation_archived') return 'failed';
          throw error;
        }
        if (!release) return 'failed';
      }
      return await speak(request);
    } finally { await release?.(); }
  };
}

/** Every post-await effect belongs to the same active Cat and Runtime session. */
function ownsHeartbeatLane(state: ChatState, request: CompanionHeartbeatRequest): boolean {
  const cat = state.cats.find(row => row.id === request.catId);
  const lane = state.channels.find(row => row.id === request.laneId);
  if (!cat || cat.status !== 'active' || !isCompanionCat(cat) || lane?.status !== 'active') return false;
  const lease = resolveLeadParticipantLease(lane);
  return !!findAssignedParticipant(buildChannelView(state, lane.id), cat.id) && lease?.participantId === cat.id
    && lease.sessionId === request.sessionId && ['ready', 'initializing'].includes(lease.status);
}

/** Life/review needs actual related history; preserve every header in canonical database order. */
export async function readCompanionLifeState(store: ChatStore): Promise<ChatState> {
  if (!store.readCatalog || !store.readChannelStates) return store.read();
  for (let attempt = 0; attempt < 3; attempt++) {
    const catalog = await store.readCatalog();
    const state: ChatState = { ...catalog.metadata, channels: catalog.headers.map(header => ({ ...header, messages: [] })) };
    const cats = state.cats.filter(cat => cat.status === 'active' && isCompanionCat(cat));
    const hasBoss = cats.some(cat => cat.group === 'admin');
    const lanes = new Set((hasBoss ? state.cats.filter(cat => cat.status === 'active' && !isHiddenFromBossCat(cat)) : cats)
      .map(cat => findCompanionDirectLane(state, cat.id)?.id).filter((id): id is string => !!id));
    const ids = state.channels.filter(channel => channel.status !== 'archived' && (lanes.has(channel.id)
      || cats.some(cat => isCatChatConversation(channel, cat.id)) || (hasBoss && isBossCatGroupConversation(channel)))).map(channel => channel.id);
    const selected = await store.readChannelStates(ids, { excludeArchived: true });
    const after = await store.readCatalog();
    if (!catalog.revision || !after.revision) throw new TypeError('Versioned Companion context is required');
    if (catalog.revision !== after.revision) continue;
    const byId = new Map(selected.channels.map(channel => [channel.id, channel]));
    return { ...state, channels: state.channels.map(channel => byId.get(channel.id) ?? channel) };
  }
  throw new ChatApiError(409, 'conversation_changed', 'Companion conversations changed. Retry on the next tick.');
}

/**
 * Wakes a companion lane for the life loop and reports the Cat's result by the
 * lease it leaves behind. Activation reports `started` even when it changed
 * nothing: a direct lane paused on a session error, which only the owner's reset
 * or retarget clears, kept its error lease while the loop logged a wake and
 * rewrote the profile every minute. Unless the lead lease is now ready or
 * initializing, the Cat's result becomes an error, so the loop backs off and
 * records the failure once.
 */
export async function activateCompanionLaneForLife(
  dependencies: ChannelLifecycleDependencies,
  channelId: string,
): Promise<ChannelActivationResult[]> {
  const activation = await activateChannelLocked(dependencies, channelId);
  publishChannelLifecycleEvents(dependencies, channelId);
  const lane = (await readConversationMetadata(dependencies.chatStore, channelId)).channels.find((row) => row.id === channelId);
  const lease = lane ? resolveLeadParticipantLease(lane) : null;
  if (lease?.status === 'ready' || lease?.status === 'initializing') {
    return activation.results;
  }
  const error = lease?.lastError?.trim() || 'The companion lane did not wake.';
  return activation.results.map((result) => (
    result.targetKind === 'cat' && result.status !== 'error'
      ? { ...result, status: 'error' as const, sessionId: null, error }
      : result
  ));
}

/**
 * SPEC-124 life loop wired to the same wake/sleep bodies and mutation gate as
 * the REST routes, so Desktop presence updates the same way for both.
 */
export function startChatCompanionLifeLoop(
  dependencies: ChatCompanionLifeLoopDependencies,
): (() => void) & { isIdle(): boolean } {
  const loop = createCompanionLifeLoop({
    readChatState: () => readCompanionLifeState(dependencies.chatStore),
    readCompanionSnapshot: () => dependencies.companionStore.readSnapshot(),
    runtimeClient: dependencies.runtimeClient,
    isImagePending: catId => dependencies.catImages?.hasPending(catId) ?? false,
    activityStore: dependencies.companionActivityStore,
    activateLane: (channelId) => dependencies.mutationGate.run(
      channelId,
      () => activateCompanionLaneForLife(dependencies, channelId),
    ),
    deactivateLane: (channelId) => dependencies.mutationGate.run(channelId, async () => {
      const deactivation = await deactivateChannelLocked(dependencies, channelId);
      publishChannelLifecycleEvents(dependencies, channelId);
      return deactivation;
    }),
    speak: createCompanionHeartbeatSpeaker(dependencies),
    readCore: () => dependencies.chatStore.readCore(),
    now: () => dependencies.now?.() ?? new Date(),
  });
  return startCompanionLifeLoop(loop);
}
