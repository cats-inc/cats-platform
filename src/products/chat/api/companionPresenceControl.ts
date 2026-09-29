import { findCompanionDirectLane, recordCompanionOwnerPresence } from '../companion/life/presence.js';
import type { ChatCompanionLifeLoopDependencies } from './companionLifeLoop.js';
import {
  activateChannelLocked,
  deactivateChannelLocked,
  publishChannelLifecycleEvents,
} from './resources/channelActivation.js';

export interface CatPresenceChange {
  outcome: 'changed' | 'unchanged' | 'no_lane' | 'failed';
  error?: string | null;
}

/**
 * SPEC-124 FR-26: an owner wake/sleep from a transport (Telegram `/sleep`,
 * `/wake`) takes the same path as the Desktop buttons, so the life loop reads
 * one intent (`sleepUntil`) whatever surface set it.
 */
export async function setCatDirectLanePresence(
  dependencies: ChatCompanionLifeLoopDependencies,
  catId: string,
  presence: 'awake' | 'sleeping',
): Promise<CatPresenceChange> {
  const lane = findCompanionDirectLane(await dependencies.chatStore.read(), catId);
  if (!lane) {
    return { outcome: 'no_lane' };
  }
  return dependencies.mutationGate.run(lane.id, async () => {
    if (presence === 'sleeping') {
      const deactivation = await deactivateChannelLocked(dependencies, lane.id);
      const changed = deactivation.closedSessionCount > 0;
      await recordCompanionOwnerPresence({
        state: await dependencies.chatStore.read(),
        channelId: lane.id,
        presence,
        changed,
        companionStore: dependencies.companionStore,
        activityStore: dependencies.companionActivityStore,
        now: new Date(deactivation.closedAt),
      });
      publishChannelLifecycleEvents(dependencies, lane.id);
      return { outcome: changed ? 'changed' : 'unchanged' };
    }

    const activation = await activateChannelLocked(dependencies, lane.id);
    publishChannelLifecycleEvents(dependencies, lane.id);
    const result = activation.results.find((candidate) => candidate.targetKind === 'cat');
    if (!result || result.status === 'error') {
      return { outcome: 'failed', error: result?.error ?? null };
    }
    const changed = !activation.leadWasReady && result.status === 'started';
    await recordCompanionOwnerPresence({
      state: await dependencies.chatStore.read(),
      channelId: lane.id,
      presence,
      changed,
      companionStore: dependencies.companionStore,
      activityStore: dependencies.companionActivityStore,
      now: new Date(activation.startedAt),
    });
    return { outcome: changed ? 'changed' : 'unchanged' };
  });
}
