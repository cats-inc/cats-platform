import {
  type MentionResolverCat,
  type MessageBodyAttachment,
  type MessageBodyMarkdownRoot,
  type MessageBodySegment,
  extractAttachments,
  parseMessageBodyMarkdown,
  segmentMessageBody,
} from './messageBody.js';
import type { MobileChatMessage } from './contracts.js';

/**
 * Mobile UI shape for rendered messages. The selector below turns the
 * narrow wire DTO (`MobileChatMessage`) into this by:
 *
 *   1. Mapping `senderKind` to a UI role: `user` stays `user`; every
 *      non-system non-user kind is `assistant`. System messages are
 *      filtered out (the mobile shell does not render them yet).
 *   2. Running `extractAttachments` on the message body to peel off
 *      the trailing attachment block.
 *   3. Running `segmentMessageBody` on the remaining text so the
 *      mobile MessageBody component can render bubbles with mention
 *      chips, URLs, and plain text segments — or, for agent replies,
 *      `parseMessageBodyMarkdown`, matching the web transcript's
 *      markdown format.
 *
 * The segmenter and attachment extractor are the canonical shared
 * versions re-exported from this same boundary — the segmenter narrow
 * landed in the boundary slice (`cc0dea4b`) so this file does not pull
 * `node:crypto` through transitive imports.
 */

export type MobileRenderedRole = 'user' | 'assistant';

export interface MobileRenderedMessage {
  id: string;
  role: MobileRenderedRole;
  authorName: string;
  /** Plain-text body segments; empty when `markdown` carries the body. */
  segments: MessageBodySegment[];
  /** Agent replies are parsed as markdown; other senders stay plain text. */
  markdown: MessageBodyMarkdownRoot | null;
  attachments: MessageBodyAttachment[];
  /** Epoch milliseconds parsed from `createdAt`. */
  timestamp: number;
}

/**
 * Pure projection from the wire payload to mobile-rendered messages.
 * Caller passes the same cat catalogue the segmenter needs to resolve
 * mentions; pass an empty array if mentions should be rendered as
 * plain text.
 */
export function selectMobileMessages(
  messages: MobileChatMessage[],
  cats: MentionResolverCat[],
): MobileRenderedMessage[] {
  return messages
    .filter((message) => message.senderKind !== 'system')
    .map((message) => projectMessage(message, cats));
}

function projectMessage(
  message: MobileChatMessage,
  cats: MentionResolverCat[],
): MobileRenderedMessage {
  const { textBody, attachments } = extractAttachments(message.body);
  const markdown = message.senderKind === 'agent'
    ? parseMessageBodyMarkdown(textBody, { cats, disabledMentionNames: [] })
    : null;
  const segments = markdown ? [] : segmentMessageBody(textBody, cats);
  const role: MobileRenderedRole =
    message.senderKind === 'user' ? 'user' : 'assistant';
  const timestamp = Date.parse(message.createdAt);
  return {
    id: message.id,
    role,
    authorName: message.senderName,
    segments,
    markdown,
    attachments,
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
  };
}
