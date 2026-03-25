import type { ResolvedServerDependencies } from './contracts.js';

export async function reconcilePollingOnStartup(
  dependencies: ResolvedServerDependencies,
): Promise<void> {
  const { readTelegramPollingContext } = await import('../../server/routes/telegram.js');
  const pollingContext = await readTelegramPollingContext(dependencies.chat.chatStore);
  if (pollingContext.bindings.length === 0) {
    return;
  }

  await dependencies.chat.pollingSupervisor.reconcilePolling({
    bindings: pollingContext.bindings,
    context: pollingContext.context,
    refreshContext: async () => (await readTelegramPollingContext(dependencies.chat.chatStore)).context,
    roomBridge: dependencies.chat.telegramRoomBridge,
    memoryService: dependencies.chat.memoryService,
    runtimeClient: dependencies.shared.runtimeClient,
    telegramRelay: dependencies.chat.telegramRelay,
  });
}
