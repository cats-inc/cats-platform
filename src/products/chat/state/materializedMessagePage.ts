import type { ChatChannelState } from '../api/contracts.js';
import { MessageCursorExpiredError, MAX_MESSAGE_PAGE_SIZE, type MessagePage } from '../shared/transcript.js';
import { decodeMessageCursor, encodeMessageCursor } from './messageCursor.js';

/** Memory fixtures only. Production pages use indexed SQL and cached counts. */
export function materializedMessagePage(channel: ChatChannelState, order: number, limit: number, before?: string): MessagePage {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_MESSAGE_PAGE_SIZE) throw new RangeError('Invalid message page limit');
  let end = channel.messages.length;
  if (before !== undefined) {
    const cursor = decodeMessageCursor(before, channel.id);
    if (cursor.order !== order) throw new MessageCursorExpiredError();
    end = Math.min(cursor.before, channel.messages.length);
  }
  const start = Math.max(0, end - limit);
  return { messages: structuredClone(channel.messages.slice(start, end)), total: channel.messages.length, orderRevision: String(order),
    nextCursor: start ? encodeMessageCursor(channel.id, order, start) : null };
}
