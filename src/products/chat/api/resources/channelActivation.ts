import type { ChannelActivationResult } from '../contracts.js';
import { updateChatState } from '../../state/store.js';
import { mergeCompletedDispatchState } from '../../state/runtime-dispatch/merge.js';
import { activateChannelSessions } from '../../state/runtimeActions.js';
import {
  requireChannel,
  resolveLeadParticipantLease,
  setChannelOrchestratorLease,
  setChannelParticipantLease,
} from '../../state/model/index.js';
import {
  resolveChannelParticipantAssignments,
  resolveOrchestratorLeaseAttachment,
  resolveParticipantLeaseAttachment,
} from '../../shared/channelParticipants.js';
import { closeSessionIds, collectActiveChannelSessionIds } from '../routeSessions.js';
import type { ChatApiDependencies } from '../routeSupport.js';
import { publishRoomMutation } from '../transportEventPublisher.js';
import { notifyStreamTargetChanged } from './streamTargetSignal.js';

/**
 * Channel wake/sleep bodies shared by the REST routes and the SPEC-124
 * companion life loop. Callers hold the channel's mutation gate.
 */
export type ChannelLifecycleDependencies = Pick<
  ChatApiDependencies,
  | 'chatStore'
  | 'runtimeClient'
  | 'companionStore'
  | 'memoryService'
  | 'config'
  | 'eventHub'
  | 'now'
>;

export function publishChannelLifecycleEvents(
  dependencies: Pick<ChatApiDependencies, 'eventHub'>,
  channelId: string,
): void {
  publishRoomMutation(dependencies.eventHub, channelId, 'updated');
  dependencies.eventHub?.emit({
    kind: 'recents_changed',
    channelId,
    timestamp: new Date().toISOString(),
  });
}

export async function activateChannelLocked(
  dependencies: ChannelLifecycleDependencies,
  channelId: string,
): Promise<{
  startedAt: string;
  results: ChannelActivationResult[];
  /**
   * Whether the lead participant was already awake. Activation reports `started`
   * even for a live session, so this is what tells "woke up" from "already up".
   */
  leadWasReady: boolean;
}> {
  const now = dependencies.now?.() ?? new Date();
  const baseline = await dependencies.chatStore.read();
  const leadWasReady = resolveLeadParticipantLease(requireChannel(baseline, channelId))?.status === 'ready';
  const activation = await activateChannelSessions(
    baseline,
    channelId,
    dependencies.runtimeClient,
    now,
    {
      companionStore: dependencies.companionStore,
      memoryService: dependencies.memoryService,
      chatStatePath: dependencies.config.chatStatePath,
      runtimeDataDir: dependencies.config.runtimeDataDir,
    },
  );
  await updateChatState(dependencies.chatStore, (latest) =>
    mergeCompletedDispatchState(latest, baseline, activation.state, channelId, now));
  notifyStreamTargetChanged(channelId);
  return { startedAt: now.toISOString(), results: activation.results, leadWasReady };
}

export async function deactivateChannelLocked(
  dependencies: ChannelLifecycleDependencies,
  channelId: string,
): Promise<{ closedAt: string; closedSessionCount: number }> {
  const now = dependencies.now?.() ?? new Date();
  const state = await dependencies.chatStore.read();
  const channel = requireChannel(state, channelId);
  const sessionIds = collectActiveChannelSessionIds(channel);

  await closeSessionIds({ dependencies }, sessionIds);

  let nextState = state;
  for (const assignment of resolveChannelParticipantAssignments(channel)) {
    const attachment = resolveParticipantLeaseAttachment(channel, assignment.participantId, {
      statuses: ['ready', 'initializing'],
    });
    if (attachment) {
      nextState = setChannelParticipantLease(
        nextState,
        channelId,
        assignment.participantId,
        { status: 'closed', sessionId: null },
        now,
      );
    }
  }
  if (resolveOrchestratorLeaseAttachment(channel, {
    statuses: ['ready', 'initializing'],
  })) {
    nextState = setChannelOrchestratorLease(
      nextState,
      channelId,
      { status: 'closed', sessionId: null },
      now,
    );
  }

  await updateChatState(dependencies.chatStore, (latest) =>
    mergeCompletedDispatchState(latest, state, nextState, channelId, now));
  notifyStreamTargetChanged(channelId);
  return { closedAt: now.toISOString(), closedSessionCount: sessionIds.length };
}
