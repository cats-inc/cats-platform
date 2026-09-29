import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
  extractCompanionPhotoDirective,
  listCompanionPhotoCandidates,
} from '../companion/life/photos.js';
import { TRANSPORT_MEDIA_METADATA_KEY } from '../../../platform/transports/telegram/fanout.js';
import { persistAttachmentsForChannels } from './attachmentSupport.js';
import { COMPANION_HEARTBEAT_EVENT, isCompanionCat } from '../../../shared/companionRole.js';
import { resolveFullResponseText } from '../../../platform/runtime/client.js';
import { sendSupervisedRuntimeMessage } from '../../../platform/supervision/runtimeBoundary.js';
import { appendMessage, requireChannel } from '../state/model/index.js';
import { formatCompanionContext } from '../state/prompts.js';
import { runWithSessionTurnGate } from '../state/runtime-dispatch/sessionTurnGate.js';
import { updateChatState } from '../state/store.js';
import {
  activateChannelLocked,
  deactivateChannelLocked,
  publishChannelLifecycleEvents,
  type ChannelLifecycleDependencies,
} from './resources/channelActivation.js';
import type { ChatApiDependencies } from './routeSupport.js';
import { buildRoomMessageMutationDetail, publishRoomMutation } from './transportEventPublisher.js';

export type ChatCompanionLifeLoopDependencies = ChannelLifecycleDependencies
  & Pick<ChatApiDependencies, 'mutationGate' | 'companionActivityStore'>;

const RUNTIME_BUSY_PATTERN = /\bbusy\b/iu;

/**
 * SPEC-124 FR-21..FR-23: one hidden turn in the Cat's own lane session. A reply
 * other than `[quiet]` becomes an ordinary Cat message in the lane, and the
 * transport fanout mirrors it to a bound Telegram chat like any Desktop reply.
 */
export function createCompanionHeartbeatSpeaker(
  dependencies: ChatCompanionLifeLoopDependencies,
): (request: CompanionHeartbeatRequest) => Promise<CompanionHeartbeatResult> {
  return async (request) => {
    const state = await dependencies.chatStore.read();
    const cat = state.cats.find((candidate) => candidate.id === request.catId);
    if (!cat || cat.status !== 'active' || !isCompanionCat(cat)) {
      return 'failed';
    }
    const lane = requireChannel(state, request.laneId);
    const companionSession = await dependencies.companionStore.buildSessionContext({
      cat,
      channel: {
        id: lane.id,
        title: lane.title,
        topic: lane.topic,
        roomRouting: lane.roomRouting,
        workingMemory: lane.workingMemory,
      },
      requestedSkills: [],
      transport: null,
      now: request.now,
    }).catch(() => null);
    const photoFolder = (await dependencies.companionStore.getLifeProfile(cat.id, request.now)).photoFolder;
    const photoCandidates = request.kind === 'bedtime'
      ? []
      : await listCompanionPhotoCandidates(photoFolder);
    const content = buildCompanionHeartbeatPrompt({
      kind: request.kind,
      now: request.now,
      awakeSince: request.awakeSince,
      lastOwnerMessageAt: request.lastOwnerMessageAt,
      companionContext: companionSession ? formatCompanionContext(companionSession, true) : null,
      photoCandidates,
    });

    let replyText: string;
    try {
      const result = await runWithSessionTurnGate(request.sessionId, () => sendSupervisedRuntimeMessage({
        runtimeClient: dependencies.runtimeClient,
        sessionId: request.sessionId,
        content,
        supervision: {
          product: 'cats-chat',
          surface: 'companion-heartbeat',
          runId: request.laneId,
          actionId: `companion-heartbeat:${request.catId}:${request.now.toISOString()}`,
          actorRef: request.catId,
          reason: 'companion_heartbeat',
        },
      }));
      replyText = resolveFullResponseText(result.segments);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return RUNTIME_BUSY_PATTERN.test(message) ? 'busy' : 'failed';
    }

    const directive = extractCompanionPhotoDirective(replyText, photoCandidates);
    const reply = parseCompanionHeartbeatReply(directive.body);
    if (reply.quiet && directive.photo === null) {
      return 'quiet';
    }
    const text = reply.quiet ? '' : reply.body;
    const photo = directive.photo && photoFolder
      ? await attachCompanionPhoto(dependencies, request.laneId, photoFolder, directive.photo)
      : null;
    const body = photo?.relativePath
      ? `[Attached files in working directory:]\n- ${photo.relativePath}\n\n${text}`
      : text;
    if (!body.trim() && !photo) {
      return 'quiet';
    }
    const message = await dependencies.mutationGate.run(request.laneId, async () => {
      let appended: ReturnType<typeof appendMessage>['message'] | null = null;
      await updateChatState(dependencies.chatStore, (latest) => {
        const next = appendMessage(
          latest,
          request.laneId,
          { senderKind: 'agent', senderName: cat.name, body },
          dependencies.now?.() ?? new Date(),
          {
            metadata: {
              // Not an assistant turn segment: live indicators must not read it as a reply.
              event: COMPANION_HEARTBEAT_EVENT,
              [COMPANION_HEARTBEAT_METADATA_KEY]: { kind: request.kind },
              targetKind: 'cat',
              targetId: request.catId,
              sessionId: request.sessionId,
              ...(photo
                ? {
                    [TRANSPORT_MEDIA_METADATA_KEY]: {
                      kind: 'photo',
                      path: photo.sourcePath,
                      fileName: photo.fileName,
                    },
                  }
                : {}),
            },
            origin: 'runtime',
            incrementUnread: true,
          },
        );
        appended = next.message;
        return next.state;
      });
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
    return 'spoke';
  };
}

/**
 * FR-30: copies the chosen photo into the lane's attachment folder so the
 * Desktop shows it inline; Telegram uploads the original. A copy failure still
 * lets the photo reach Telegram, just without the Desktop preview.
 */
async function attachCompanionPhoto(
  dependencies: ChatCompanionLifeLoopDependencies,
  laneId: string,
  photoFolder: string,
  fileName: string,
): Promise<{ sourcePath: string; fileName: string; relativePath: string | null } | null> {
  const sourcePath = path.join(photoFolder, fileName);
  let bytes: Buffer;
  try {
    bytes = await readFile(sourcePath);
  } catch {
    return null;
  }
  try {
    const stored = (await persistAttachmentsForChannels({
      state: await dependencies.chatStore.read(),
      channelIds: [laneId],
      files: [{ name: fileName, data: bytes.toString('base64') }],
      runtimeDataDir: dependencies.config.runtimeDataDir,
    })).get(laneId)?.[0];
    return { sourcePath, fileName, relativePath: stored?.relativePath ?? null };
  } catch {
    return { sourcePath, fileName, relativePath: null };
  }
}

/**
 * SPEC-124 life loop wired to the same wake/sleep bodies and mutation gate as
 * the REST routes, so Desktop presence updates the same way for both.
 */
export function startChatCompanionLifeLoop(
  dependencies: ChatCompanionLifeLoopDependencies,
): () => void {
  const loop = createCompanionLifeLoop({
    readChatState: () => dependencies.chatStore.read(),
    readCompanionSnapshot: () => dependencies.companionStore.readSnapshot(),
    runtimeClient: dependencies.runtimeClient,
    activityStore: dependencies.companionActivityStore,
    activateLane: (channelId) => dependencies.mutationGate.run(channelId, async () => {
      const activation = await activateChannelLocked(dependencies, channelId);
      publishChannelLifecycleEvents(dependencies, channelId);
      return activation.results;
    }),
    deactivateLane: (channelId) => dependencies.mutationGate.run(channelId, async () => {
      const deactivation = await deactivateChannelLocked(dependencies, channelId);
      publishChannelLifecycleEvents(dependencies, channelId);
      return deactivation;
    }),
    speak: createCompanionHeartbeatSpeaker(dependencies),
    now: () => dependencies.now?.() ?? new Date(),
  });
  return startCompanionLifeLoop(loop);
}
