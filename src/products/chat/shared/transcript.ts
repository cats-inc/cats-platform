import type { ChatMessage } from '../api/contracts.js';

/** Browser-safe query DTOs; complete channel/Core contracts remain unchanged. */
export const DEFAULT_MESSAGE_PAGE_SIZE = 50;
export const MAX_MESSAGE_PAGE_SIZE = 200;
export const MAX_MESSAGE_SEARCH_RESULTS = 100;

export interface MessagePage {
  messages: ChatMessage[];
  total: number;
  /** Opaque exclusive cursor. An order change requires reloading the newest page. */
  nextCursor: string | null;
}

export interface MessageSearchHit { channelId: string; message: ChatMessage; }
export interface MessageSearchOptions { channelId?: string; limit?: number; }
export interface MessageSearchResponse { hits: MessageSearchHit[]; }

export class MessageCursorExpiredError extends Error {
  readonly code = 'stale_message_cursor';
  constructor() { super('Conversation message order changed; reload the newest page.'); }
}
