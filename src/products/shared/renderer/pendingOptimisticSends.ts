export interface PendingOptimisticSend {
  channelId: string;
  optimisticMessageId: string;
}

const pendingOptimisticSends = new Map<string, string>();

export function registerPendingOptimisticSend(
  channelId: string,
  optimisticMessageId: string,
): void {
  const previousMessageId = pendingOptimisticSends.get(channelId) ?? null;
  if (previousMessageId && previousMessageId !== optimisticMessageId) {
    console.warn('Replacing pending optimistic send for channel.', {
      feature: 'chat_optimistic_message_replaced_in_flight',
      channelId,
      previousMessageId,
      nextMessageId: optimisticMessageId,
    });
  }
  pendingOptimisticSends.set(channelId, optimisticMessageId);
}

export function clearPendingOptimisticSend(
  channelId: string,
  optimisticMessageId?: string,
): void {
  const currentMessageId = pendingOptimisticSends.get(channelId) ?? null;
  if (!currentMessageId) {
    return;
  }
  if (optimisticMessageId && currentMessageId !== optimisticMessageId) {
    return;
  }
  pendingOptimisticSends.delete(channelId);
}

export function listPendingOptimisticSends(): PendingOptimisticSend[] {
  return [...pendingOptimisticSends.entries()].map(([channelId, optimisticMessageId]) => ({
    channelId,
    optimisticMessageId,
  }));
}

// Test reset hook. Production composer paths clear individual entries as each
// send resolves or rolls back.
export function clearAllPendingOptimisticSends(): void {
  pendingOptimisticSends.clear();
}
