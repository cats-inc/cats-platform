import type { ChatChannelView, ChatMessage } from './api/workspaceContracts.js';

/** Browser-safe query DTOs; complete channel/Core contracts remain unchanged. */
export const DEFAULT_MESSAGE_PAGE_SIZE = 50;
export const MAX_MESSAGE_PAGE_SIZE = 200;
export const MAX_MESSAGE_SEARCH_RESULTS = 100;

export interface MessagePage {
  messages: ChatMessage[];
  total: number;
  /** Opaque exclusive cursor. An order change requires reloading the newest page. */
  nextCursor: string | null;
  /** Compare for equality only; tail appends/body edits preserve this generation. */
  orderRevision: string;
  /** Changes to already older content require refreshing retained windows. */
  historyRevision?: string;
  windowCount?: number;
  /** Display-only Core projection for this window; raw messages stay limit-bounded. */
  displayMessages?: ChatMessage[];
  /** Immutable cold history; restore explicitly before sending or editing. */
  archive?: { id: string; createdAt: string };
  archiveActions?: boolean;
}

export type TranscriptChannelView = ChatChannelView & { messagePage?: Omit<MessagePage, 'messages' | 'displayMessages'> };

export interface MessagePresentationPlacement {
  key: string;
  responseMessageId: string | null;
  anchorMessageId: string | null;
  rejected: boolean;
  newestEmpty: boolean;
}

export function presentationTargetKey(turnId: unknown, targetStateId: unknown): string {
  return JSON.stringify([turnId ?? null, targetStateId ?? null]);
}

export interface MessageSearchHit { channelId: string; message: ChatMessage; }
export interface MessageSearchOptions { channelId?: string; limit?: number; }
export interface MessageSearchResponse { hits: MessageSearchHit[]; }

export class MessageCursorExpiredError extends Error {
  readonly code = 'stale_message_cursor';
  constructor() { super('Conversation message order changed; reload the newest page.'); }
}
