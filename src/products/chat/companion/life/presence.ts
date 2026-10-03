import type { ChatChannelState, ChatState } from '../../api/contracts.js';
import type { CompanionBoxStore } from '../../state/companion-box/index.js';
import { resolveRoomRoutingState } from '../../state/room-routing/index.js';
import { findDirectLaneChannelForCat } from '../../state/model/channelState.js';
import { isCompanionCat } from '../../../../shared/companionRole.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import type { CompanionActivityStore } from '../activityStore.js';
import { resolveCompanionRhythm } from './rhythm.js';

export type CompanionPresenceChange = 'awake' | 'sleeping';

/** SPEC-124 FR-13 reasons recorded on `presence_changed`. */
export type CompanionPresenceReason =
  | 'rhythm'
  | 'keep_alive'
  | 'rest'
  | 'owner'
  | 'idle'
  | 'no_capacity'
  | 'wake_failed';

/**
 * The Cat's direct lane, matched the way the Telegram bridge reuses it
 * (first `direct_message` channel whose default recipient is the Cat).
 */
export function findCompanionDirectLane(
  state: Pick<ChatState, 'channels'>,
  catId: string,
): ChatChannelState | null {
  return findDirectLaneChannelForCat(state, catId);
}

/** The companion Cat whose direct lane this channel is, if any. */
export function resolveCompanionLaneCatId(
  state: Pick<ChatState, 'channels' | 'cats'>,
  channelId: string,
): string | null {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  if (!channel || !isDirectLaneChannel(channel)) {
    return null;
  }
  const catId = resolveRoomRoutingState(channel.roomRouting).defaultRecipientId;
  const cat = catId ? state.cats.find((candidate) => candidate.id === catId) : null;
  if (!cat || cat.status !== 'active' || !isCompanionCat(cat)) {
    return null;
  }
  return findCompanionDirectLane(state, cat.id)?.id === channelId ? cat.id : null;
}

export async function appendCompanionPresenceActivity(
  activityStore: CompanionActivityStore | undefined,
  input: {
    catId: string;
    laneId: string;
    presence: CompanionPresenceChange;
    reason: CompanionPresenceReason;
    now: Date;
  },
): Promise<void> {
  if (!activityStore) {
    return;
  }
  try {
    await activityStore.append({
      id: `act-${input.now.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
      catId: input.catId,
      group: 'presence_changed',
      targetKind: 'presence',
      targetId: input.laneId,
      occurredAt: input.now.toISOString(),
      correlationId: null,
      summary: null,
      metadata: { presence: input.presence, reason: input.reason },
    });
  } catch {
    // Activity is a derived audit trail; it never blocks wake or sleep.
  }
}

/**
 * SPEC-124 FR-15/FR-16: an owner wake/sleep on a companion's direct lane is
 * the same intent the life loop reads, so the loop never undoes it.
 */
export async function recordCompanionOwnerPresence(input: {
  state: Pick<ChatState, 'channels' | 'cats'>;
  channelId: string;
  presence: CompanionPresenceChange;
  changed: boolean;
  companionStore: Pick<CompanionBoxStore, 'getLifeProfile' | 'updateLifeProfile'>;
  activityStore?: CompanionActivityStore;
  now: Date;
}): Promise<void> {
  const catId = resolveCompanionLaneCatId(input.state, input.channelId);
  if (!catId) {
    return;
  }
  const life = await input.companionStore.getLifeProfile(catId, input.now);
  if (!life.enabled) {
    return;
  }
  if (input.presence === 'sleeping') {
    const { nextWakeAt } = resolveCompanionRhythm(life, catId, input.now);
    await input.companionStore.updateLifeProfile(
      catId,
      { sleepUntil: nextWakeAt.toISOString() },
      input.now,
    );
  } else if (life.sleepUntil !== null) {
    await input.companionStore.updateLifeProfile(catId, { sleepUntil: null }, input.now);
  }
  if (input.changed) {
    await appendCompanionPresenceActivity(input.activityStore, {
      catId,
      laneId: input.channelId,
      presence: input.presence,
      reason: 'owner',
      now: input.now,
    });
  }
}
