import type {
  ChatChannelView,
  ChatMessage,
  ParallelChatGroupSummary,
} from '../../../products/chat/api/contracts.js';
import type {
  ChatApiDependencies,
} from '../../../products/chat/api/routeSupport.js';
import { buildAppShellPayload } from '../../../products/chat/api/routeSupport.js';

export const CHANNEL_ENTITY_SUBSCRIPTION_VERSION = 1;

export interface ChannelSubscriptionState {
  selectedChannelId: string;
  selectedChannel: ChatChannelView;
  parallelChatGroups: ParallelChatGroupSummary[];
}

export type ChannelSubscriptionPatch =
  | {
      kind: 'message.appended';
      messageId: string;
      message: ChatMessage;
      state: ChannelSubscriptionState;
    }
  | {
      kind: 'message.updated';
      messageId: string;
      message: ChatMessage;
      state: ChannelSubscriptionState;
    }
  | {
      kind: 'message.removed';
      messageId: string;
      state: ChannelSubscriptionState;
    }
  | {
      kind: 'turn.updated';
      state: ChannelSubscriptionState;
    }
  | {
      kind: 'compareGroupMembership.updated';
      state: ChannelSubscriptionState;
    }
  | {
      kind: 'channel.replaced';
      state: ChannelSubscriptionState;
    };

function stableSerialize(value: unknown): string {
  return JSON.stringify(value);
}

function statesEqual(
  previous: ChannelSubscriptionState,
  next: ChannelSubscriptionState,
): boolean {
  return stableSerialize(previous) === stableSerialize(next);
}

function messagesEqual(left: ChatMessage, right: ChatMessage): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function roomRoutingEqual(
  previous: ChannelSubscriptionState,
  next: ChannelSubscriptionState,
): boolean {
  return stableSerialize(previous.selectedChannel.roomRouting ?? null)
    === stableSerialize(next.selectedChannel.roomRouting ?? null);
}

function compareGroupsEqual(
  previous: ChannelSubscriptionState,
  next: ChannelSubscriptionState,
): boolean {
  return stableSerialize(previous.parallelChatGroups)
    === stableSerialize(next.parallelChatGroups);
}

export async function buildChannelSubscriptionState(
  dependencies: ChatApiDependencies,
  channelId: string,
): Promise<ChannelSubscriptionState> {
  const state = await dependencies.chatStore.read();
  if (!state.channels.some((channel) => channel.id === channelId)) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  const payload = await buildAppShellPayload(
    dependencies,
    {
      ...state,
      selectedChannelId: channelId,
    },
  );
  const selectedChannel = payload.chat.selectedChannel;
  if (!selectedChannel || selectedChannel.id !== channelId) {
    throw new Error(`Channel projection unavailable: ${channelId}`);
  }

  return {
    selectedChannelId: payload.chat.selectedChannelId,
    selectedChannel,
    parallelChatGroups: payload.chat.parallelChatGroups.filter((group) =>
      group.memberChannelIds.includes(channelId)),
  };
}

export function buildChannelSubscriptionPatches(
  previous: ChannelSubscriptionState,
  next: ChannelSubscriptionState,
): ChannelSubscriptionPatch[] {
  if (statesEqual(previous, next)) {
    return [];
  }

  const patches: ChannelSubscriptionPatch[] = [];
  const previousMessages = new Map(
    previous.selectedChannel.messages.map((message) => [message.id, message]),
  );
  const nextMessages = new Map(
    next.selectedChannel.messages.map((message) => [message.id, message]),
  );

  for (const message of next.selectedChannel.messages) {
    const previousMessage = previousMessages.get(message.id);
    if (!previousMessage) {
      patches.push({
        kind: 'message.appended',
        messageId: message.id,
        message,
        state: next,
      });
      continue;
    }
    if (!messagesEqual(previousMessage, message)) {
      patches.push({
        kind: 'message.updated',
        messageId: message.id,
        message,
        state: next,
      });
    }
  }

  for (const message of previous.selectedChannel.messages) {
    if (!nextMessages.has(message.id)) {
      patches.push({
        kind: 'message.removed',
        messageId: message.id,
        state: next,
      });
    }
  }

  if (!roomRoutingEqual(previous, next)) {
    patches.push({
      kind: 'turn.updated',
      state: next,
    });
  }

  if (!compareGroupsEqual(previous, next)) {
    patches.push({
      kind: 'compareGroupMembership.updated',
      state: next,
    });
  }

  if (patches.length === 0) {
    patches.push({
      kind: 'channel.replaced',
      state: next,
    });
  }

  return patches;
}
