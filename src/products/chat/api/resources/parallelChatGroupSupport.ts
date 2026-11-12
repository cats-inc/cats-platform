import { publishRoomMutation } from '../transportEventPublisher.js';
import type { ChatState } from '../contracts.js';
import type { ChatApiRouteContext } from '../routeSupport.js';
import { readConversationMetadata, readConversationsState } from '../scopedConversationState.js';
import { ChatApiError } from '../routeErrors.js';

export function requireParallelChatGroup(
  state: ChatState,
  groupId: string,
): ChatState['parallelChatGroups'][number] {
  const group = state.parallelChatGroups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new Error(`Parallel chat group not found: ${groupId}`);
  }

  return group;
}

export function publishParallelChatMutationEvents(
  context: ChatApiRouteContext,
  channelIds: string[],
  kind: 'created' | 'updated' | 'message_added' = 'updated',
): void {
  const timestamp = new Date().toISOString();
  for (const channelId of [...new Set(channelIds)]) {
    publishRoomMutation(context.dependencies.eventHub, channelId, kind);
  }
  context.dependencies.eventHub?.emit({
    kind: 'recents_changed',
    timestamp,
  });
}

export function logParallelChatFinalizeError(error: unknown): void {
  const detail = error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
  process.stderr.write(`[cats-parallel-dispatch] failed to finalize background dispatch: ${detail}\n`);
}

export async function runLockedChannels<T>(
  context: ChatApiRouteContext,
  channelIds: string[],
  operation: () => Promise<T>,
): Promise<T> {
  const orderedChannelIds = [...new Set(channelIds)].sort();

  const runLocked = async (index: number): Promise<T> => {
    if (index >= orderedChannelIds.length) {
      return operation();
    }

    return context.dependencies.mutationGate.run(
      orderedChannelIds[index]!,
      () => runLocked(index + 1),
    );
  };

  return runLocked(0);
}

export async function withLockedParallelChatGroup<T>(
  context: ChatApiRouteContext,
  groupId: string,
  operation: (
    state: ChatState,
    group: ChatState['parallelChatGroups'][number],
  ) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const metadata = await readConversationMetadata(context.dependencies.chatStore, []);
    const ids = requireParallelChatGroup(metadata, groupId).memberChannelIds;
    const result = await runLockedChannels(context, ids, async () => {
      const state = await readConversationsState(context.dependencies.chatStore, ids, { archivedMetadataOnly: true });
      const group = requireParallelChatGroup(state, groupId);
      const locked = new Set(ids);
      if (locked.size !== new Set(group.memberChannelIds).size
        || group.memberChannelIds.some(id => !locked.has(id))) return { retry: true as const };
      return { retry: false as const, value: await operation(state, group) };
    });
    if (!result.retry) return result.value;
  }
  throw new ChatApiError(409, 'parallel_group_changed', 'The parallel conversation changed. Reload and try again.');
}
