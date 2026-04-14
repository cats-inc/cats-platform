import type {
  ChatChannelState,
  ChatMessage,
} from '../api/contracts.js';
import type { RoomAssistantTurnDelivery } from '../../../shared/roomRouting.js';

export const ASSISTANT_TURN_SEGMENT_EVENT = 'assistant_turn_segment';

export function isAssistantTurnSegmentMessage(
  message: Pick<ChatMessage, 'metadata'> | null | undefined,
): boolean {
  return message?.metadata?.event === ASSISTANT_TURN_SEGMENT_EVENT;
}

export function isTerminalAssistantTurnSegmentMessage(
  message: Pick<ChatMessage, 'metadata'> | null | undefined,
): boolean {
  return isAssistantTurnSegmentMessage(message) && message?.metadata?.terminal === true;
}

export function readAssistantTurnId(
  message: Pick<ChatMessage, 'metadata'> | null | undefined,
): string | null {
  return typeof message?.metadata?.assistantTurnId === 'string'
    && message.metadata.assistantTurnId.trim().length > 0
    ? message.metadata.assistantTurnId.trim()
    : null;
}

export function readAssistantTurnTargetStateId(
  message: Pick<ChatMessage, 'metadata'> | null | undefined,
): string | null {
  return typeof message?.metadata?.targetStateId === 'string'
    && message.metadata.targetStateId.trim().length > 0
    ? message.metadata.targetStateId.trim()
    : null;
}

export function readAssistantTurnMessages(
  channel: Pick<ChatChannelState, 'messages'>,
  assistantTurnId: string,
): ChatMessage[] {
  return channel.messages.filter((message) =>
    isAssistantTurnSegmentMessage(message)
    && readAssistantTurnId(message) === assistantTurnId,
  );
}

export function buildAssistantTurnDelivery(
  assistantTurnId: string,
  messages: ReadonlyArray<Pick<ChatMessage, 'id' | 'body'>>,
): RoomAssistantTurnDelivery {
  return {
    assistantTurnId,
    messageIds: messages.map((message) => message.id),
    fullText: messages.map((message) => message.body).join(''),
    segmentCount: messages.length,
  };
}

export function buildAssistantTurnSourceMessage(
  messages: ReadonlyArray<ChatMessage>,
): ChatMessage | null {
  const terminalMessage = messages.at(-1);
  if (!terminalMessage) {
    return null;
  }

  const mentions = Array.from(new Set(messages.flatMap((message) => message.mentions)));
  return {
    ...terminalMessage,
    body: messages.map((message) => message.body).join(''),
    mentions,
  };
}

export function buildAssistantTurnDeliveryFromChannel(
  channel: Pick<ChatChannelState, 'messages'>,
  assistantTurnId: string,
): RoomAssistantTurnDelivery | null {
  const messages = readAssistantTurnMessages(channel, assistantTurnId);
  if (messages.length === 0) {
    return null;
  }
  return buildAssistantTurnDelivery(assistantTurnId, messages);
}

export function findTerminalAssistantTurnSegmentForTurn(
  channel: Pick<ChatChannelState, 'messages'>,
  turnId: string,
): ChatMessage | null {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    if (
      (message.senderKind === 'agent' || message.senderKind === 'orchestrator')
      && isTerminalAssistantTurnSegmentMessage(message)
      && message.metadata.turnId === turnId
    ) {
      return message;
    }
  }

  return null;
}
