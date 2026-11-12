import type { ChatChannelState, ChatMessage } from '../api/contracts.js';

export function completedCatlasReplies(channel: ChatChannelState): ChatMessage[][] {
  const groups = new Map<string, ChatMessage[]>();
  for (const message of channel.messages) {
    if (message.senderKind !== 'agent' && message.senderKind !== 'orchestrator') continue;
    const key = typeof message.metadata.assistantTurnId === 'string' ? message.metadata.assistantTurnId : message.id;
    const group = groups.get(key) ?? [];
    group.push(message); groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.some(message => message.metadata.terminal === true)
    || group.every(message => message.metadata.terminal === undefined));
}

export function hasUnresolvedCatlasChoice(channel: ChatChannelState): boolean {
  if (channel.roomRouting?.workflow?.activeTurn) return false;
  const replies = completedCatlasReplies(channel);
  const latest = replies[replies.length - 1];
  const choice = latest?.filter(message => message.choices?.length).at(-1);
  if (!choice) return false;
  const index = channel.messages.indexOf(choice);
  return !channel.messages.some((message, position) => message.choiceResponse?.sourceMessageId === choice.id
    || position > index && message.senderKind === 'user');
}
