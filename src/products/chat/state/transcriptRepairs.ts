import type { ChatState } from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import { repairMissingSessionStartedMessages, repairMissingStartupRecoveryNotice,
  repairOrphanedCompletedDispatchTurn } from './runtime-dispatch/repair.js';

export interface TranscriptRepairOptions { core?: CatsCoreState; runtimeDataDir?: string | null; now?: Date; }

/** The existing read repairs, run before paged views become available and on writes. */
export function applyChannelReadRepairs(state: ChatState, channelId: string, options: TranscriptRepairOptions = {}): {
  repaired: boolean; state: ChatState;
} {
  const now = options.now ?? new Date();
  const turn = repairOrphanedCompletedDispatchTurn(state, channelId, now, options.core);
  const sessions = repairMissingSessionStartedMessages(turn.state, channelId, { ...options, now });
  const startup = repairMissingStartupRecoveryNotice(sessions.state, channelId, { ...options, now });
  return { repaired: turn.repaired || sessions.repaired || startup.repaired, state: startup.state };
}

export function prepareTranscriptState(state: ChatState, options: TranscriptRepairOptions): ChatState {
  let next = state;
  for (const channel of state.channels) next = applyChannelReadRepairs(next, channel.id, options).state;
  return next;
}
