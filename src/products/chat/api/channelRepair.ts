import type { ChatState } from './contracts.js';
import type { ChatStore } from '../state/store.js';
import type { AsyncKeyedGate } from '../shared/asyncControl.js';
import type { CatsCoreState } from '../../../core/types.js';
import { applyChannelReadRepairs } from '../state/transcriptRepairs.js';
export { applyChannelReadRepairs } from '../state/transcriptRepairs.js';

interface ChannelReadRepairDependencies {
  chatStore: Pick<ChatStore, 'read' | 'write' | 'readCore' | 'updateSnapshot'>;
  mutationGate: AsyncKeyedGate;
  runtimeDataDir?: string | null;
  now?: () => Date;
}

function resolveRepairNow(dependencies: ChannelReadRepairDependencies): Date {
  return dependencies.now?.() ?? new Date();
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
    if (dependencies.chatStore.updateSnapshot) {
      const snapshot = await dependencies.chatStore.updateSnapshot(({ chat, core: latestCore }) => ({
        chat: applyChannelReadRepairs(chat, channelId, {
          core: latestCore, runtimeDataDir, now: resolveRepairNow(dependencies),
        }).state,
        core: latestCore,
      }));
      return snapshot.chat;
    }
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
