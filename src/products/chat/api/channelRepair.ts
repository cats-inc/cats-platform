import type { ChatState } from './contracts.js';
import type { ChatStore } from '../state/store.js';
import type { AsyncKeyedGate } from '../shared/asyncControl.js';
import type { CatsCoreState } from '../../../core/types.js';
import {
  repairMissingSessionStartedMessages,
  repairMissingStartupRecoveryNotice,
  repairOrphanedCompletedDispatchTurn,
} from '../state/runtime-dispatch/repair.js';

interface ChannelReadRepairDependencies {
  chatStore: Pick<ChatStore, 'read' | 'write' | 'readCore'>;
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
    core?: CatsCoreState;
    runtimeDataDir?: string | null;
    now?: Date;
  } = {},
): {
  repaired: boolean;
  state: ChatState;
} {
  const now = options.now ?? new Date();
  const repairedTurn = repairOrphanedCompletedDispatchTurn(
    state,
    channelId,
    now,
    options.core,
  );
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
      core: options.core,
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
  core?: CatsCoreState,
): Promise<ChatState> {
  const runtimeDataDir = dependencies.runtimeDataDir;
  let resolvedState = state ?? await dependencies.chatStore.read();
  const resolvedCore = core ?? await dependencies.chatStore.readCore();
  const repairedState = applyChannelReadRepairs(resolvedState, channelId, {
    core: resolvedCore,
    runtimeDataDir,
    now: resolveRepairNow(dependencies),
  });
  if (!repairedState.repaired) {
    return resolvedState;
  }

  resolvedState = repairedState.state;
  return dependencies.mutationGate.run(channelId, async () => {
    const latestState = await dependencies.chatStore.read();
    const latestCore = await dependencies.chatStore.readCore();
    const latestRepair = applyChannelReadRepairs(latestState, channelId, {
      core: latestCore,
      runtimeDataDir,
      now: resolveRepairNow(dependencies),
    });
    if (!latestRepair.repaired) {
      return latestState;
    }
    return dependencies.chatStore.write(latestRepair.state);
  });
}
