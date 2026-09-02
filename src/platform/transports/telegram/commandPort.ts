/**
 * Transport-owned slash commands, reachable from both ingress modes.
 *
 * These commands (`/start`, `/help`, `/commands`, `/status`, `/open`, `/mode`)
 * used to be intercepted in the webhook route only. Long polling — the default
 * ingress, and the one the local dev loop and `cats-one` boot chain use — never
 * saw them, so `/status` was silently forwarded to the assistant as ordinary
 * chat text. Routing them through the bridge instead means both modes answer the
 * same way.
 *
 * The port is an interface rather than an implementation because answering these
 * commands needs the chat store and the Cat's skill profile, and `platform/`
 * must not import product code. The host composes it and hands it to both
 * ingress paths.
 */

import type { BotBindingRecord } from '../../../core/types.js';
import type { MessageLocale } from '../../../shared/i18n/index.js';

export interface TelegramCommandPortInput {
  /** The raw message text, already trimmed. */
  text: string;
  chatId: string;
  senderName: string;
  /** The binding the update arrived on, already resolved by the bridge. */
  binding: BotBindingRecord | null;
  locale: MessageLocale;
}

export interface TelegramCommandPortReply {
  replyText: string;
}

export interface TelegramCommandPort {
  /**
   * True when this port answers `text` itself.
   *
   * Product-intent commands (`/chat`, `/work`, `/code`) are deliberately not
   * owned here: they belong to the products and must reach the bridge.
   */
  owns(text: string): boolean;
  handle(input: TelegramCommandPortInput): Promise<TelegramCommandPortReply | null>;
}
