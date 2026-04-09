import type { ChatState } from './contracts.js';
import type { ChatStore } from '../state/store.js';
import type { AsyncKeyedGate } from '../shared/asyncControl.js';
import {
  repairMissingSessionStartedMessages,
  repairMissingStartupRecoveryNotice,
  repairOrphanedCompletedDispatchTurn,
} from '../state/runtime-dispatch/repair.js';

interface ChannelReadRepairDependencies {
  chatStore: Pick<ChatStore, 'read' | 'write'>;
  mutationGate: AsyncKeyedGate;
  runtimeDataDir?: string | null;
  now?: () => Date;
}

function resolveRepairNow(dependencies: ChannelReadRepairDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

export function applyChannelReadRepairs(
  state: ChatState,
  channelId: string,
  options: {
    runtimeDataDir?: string | null;
    now?: Date;
  } = {},
): {
  repaired: boolean;
  state: ChatState;
} {
  const now = options.now ?? new Date();
  const repairedTurn = repairOrphanedCompletedDispatchTurn(state, channelId, now);
  const repairedSessionMetadata = repairMissingSessionStartedMessages(
    repairedTurn.state,
    channelId,
    {
      runtimeDataDir: options.runtimeDataDir,
      now,
    },
  );
  const repairedStartupNotice = repairMissingStartupRecoveryNotice(
    repairedSessionMetadata.state,
    channelId,
    {
      now,
    },
  );

  return {
    repaired:
      repairedTurn.repaired
      || repairedSessionMetadata.repaired
      || repairedStartupNotice.repaired,
    state: repairedStartupNotice.state,
  };
}

export async function repairChannelReadState(
  dependencies: ChannelReadRepairDependencies,
  channelId: string,
  state?: ChatState,
): Promise<ChatState> {
  const runtimeDataDir = dependencies.runtimeDataDir;
  let resolvedState = state ?? await dependencies.chatStore.read();
  const repairedState = applyChannelReadRepairs(resolvedState, channelId, {
    runtimeDataDir,
    now: resolveRepairNow(dependencies),
  });
  if (!repairedState.repaired) {
    return resolvedState;
  }

  resolvedState = repairedState.state;
  return dependencies.mutationGate.run(channelId, async () => {
    const latestState = await dependencies.chatStore.read();
    const latestRepair = applyChannelReadRepairs(latestState, channelId, {
      runtimeDataDir,
      now: resolveRepairNow(dependencies),
    });
    if (!latestRepair.repaired) {
      return latestState;
    }
    return dependencies.chatStore.write(latestRepair.state);
  });
}
