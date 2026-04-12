import type { ChatMessage } from '../api/contracts.js';

export const RUNTIME_RESPONSE_EVENT = 'runtime_response';
export const RUNTIME_RESPONSE_SEGMENT_EVENT = 'runtime_response_segment';

export type PersistedRuntimeResponseEvent =
  | typeof RUNTIME_RESPONSE_EVENT
  | typeof RUNTIME_RESPONSE_SEGMENT_EVENT;

export function isPersistedRuntimeResponseEvent(
  value: unknown,
): value is PersistedRuntimeResponseEvent {
  return value === RUNTIME_RESPONSE_EVENT || value === RUNTIME_RESPONSE_SEGMENT_EVENT;
}

export function isTerminalRuntimeResponseEvent(
  value: unknown,
): value is typeof RUNTIME_RESPONSE_EVENT {
  return value === RUNTIME_RESPONSE_EVENT;
}

export function isPersistedRuntimeResponseMessage(
  message: Pick<ChatMessage, 'metadata'> | null | undefined,
): boolean {
  return isPersistedRuntimeResponseEvent(message?.metadata?.event);
}

export function isTerminalRuntimeResponseMessage(
  message: Pick<ChatMessage, 'metadata'> | null | undefined,
): boolean {
  return isTerminalRuntimeResponseEvent(message?.metadata?.event);
}
