import type { ResolvedServerDependencies } from './contracts.js';

export async function reconcilePollingOnStartup(
  dependencies: ResolvedServerDependencies,
): Promise<void> {
  const { readTelegramPollingContext } = await import('../../server/routes/telegram.js');
  const pollingContext = await readTelegramPollingContext(dependencies.chatStore);
  if (pollingContext.bindings.length === 0) {
    return;
  }

  await dependencies.pollingSupervisor.reconcilePolling({
    bindings: pollingContext.bindings,
    context: pollingContext.context,
    refreshContext: async () => (await readTelegramPollingContext(dependencies.chatStore)).context,
    roomBridge: dependencies.telegramRoomBridge,
    memoryService: dependencies.memoryService,
    runtimeClient: dependencies.runtimeClient,
    telegramRelay: dependencies.telegramRelay,
  });
}
