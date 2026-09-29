import { TELEGRAM_REPLY_LIMIT, chunkTelegramReply } from './chunking.js';
import type { TelegramDeliveryReceipt, TelegramRelayContext } from './contracts.js';
import type { TelegramRelay } from './relay/index.js';

/**
 * Metadata key for a local image a message carries to transports (SPEC-124
 * FR-30). Generic on purpose: transports do not know who produced it.
 */
export const TRANSPORT_MEDIA_METADATA_KEY = 'transportMedia';

/** Telegram rejects photo captions longer than this; longer text follows the photo. */
const TELEGRAM_CAPTION_LIMIT = 1024;

/** Desktop shows a lane image through this leading block; Telegram gets the photo itself. */
const ATTACHMENT_BLOCK_PATTERN = /^\[Attached files in working directory:\]\n(?:- [^\n]+\n)+\n?/u;

export interface TransportPhoto {
  path: string;
  fileName: string;
}

export function readTransportPhoto(
  message: { metadata?: Readonly<Record<string, unknown>> | null },
): TransportPhoto | null {
  const media = message.metadata?.[TRANSPORT_MEDIA_METADATA_KEY];
  if (!media || typeof media !== 'object') {
    return null;
  }
  const record = media as Record<string, unknown>;
  return record.kind === 'photo'
    && typeof record.path === 'string' && record.path.length > 0
    && typeof record.fileName === 'string' && record.fileName.length > 0
    ? { path: record.path, fileName: record.fileName }
    : null;
}

export function stripTransportAttachmentBlock(body: string): string {
  return body.replace(ATTACHMENT_BLOCK_PATTERN, '');
}

/**
 * Uploads the photo with the text as its caption, or the photo and then the
 * text when the text is too long for a caption.
 */
export async function deliverTelegramPhoto(input: {
  relay: Pick<TelegramRelay, 'deliver'>;
  context: TelegramRelayContext;
  conversationId: string | null;
  chatId: string | null;
  photo: TransportPhoto;
  text: string | null;
}): Promise<TelegramDeliveryReceipt> {
  const text = input.text?.trim() || null;
  const captioned = text !== null && text.length <= TELEGRAM_CAPTION_LIMIT;
  let receipt = await input.relay.deliver({
    request: {
      operation: 'send_media',
      mediaKind: 'photo',
      conversationId: input.conversationId,
      chatId: input.chatId,
      mediaFile: input.photo,
      caption: captioned ? text : null,
    },
    context: input.context,
  });
  for (const chunk of text && !captioned ? chunkTelegramReply(text, TELEGRAM_REPLY_LIMIT) : []) {
    receipt = await input.relay.deliver({
      request: {
        operation: 'send',
        conversationId: input.conversationId,
        chatId: input.chatId,
        text: chunk,
        disableLinkPreview: true,
      },
      context: input.context,
    });
  }
  return receipt;
}
