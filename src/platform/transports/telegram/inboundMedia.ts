import path from 'node:path';

import type {
  TelegramMessagePayload,
  TelegramNormalizedAttachment,
  TelegramRelayContext,
} from './contracts.js';
import { normalizeTelegramAttachments } from './normalization.js';
import type { TelegramRelay } from './relay/index.js';

/** The Bot API does not serve downloads larger than this. */
export const TELEGRAM_INBOUND_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

export interface InboundTelegramImage {
  name: string;
  bytes: Buffer;
}

/** A photo, or a picture the owner sent "as a file". */
export function isInboundTelegramImage(attachment: TelegramNormalizedAttachment): boolean {
  return attachment.fileId !== null && (
    attachment.kind === 'photo'
    || (attachment.kind === 'document' && (attachment.mimeType?.startsWith('image/') ?? false))
  );
}

function resolveImageName(
  image: TelegramNormalizedAttachment,
  filePath: string,
  message: TelegramMessagePayload,
): string {
  if (image.fileName) {
    return image.fileName;
  }
  const extension = path.posix.extname(filePath).toLowerCase();
  const reference = typeof message.message_id === 'number' ? String(message.message_id) : 'image';
  return `telegram-photo-${reference}${IMAGE_EXTENSIONS.has(extension) ? extension : '.jpg'}`;
}

/**
 * SPEC-124 FR-33: fetches the pictures in an inbound message so they can be
 * stored beside the conversation. A picture that cannot be fetched is left out;
 * the message then keeps its plain attachment label.
 */
export async function downloadInboundTelegramImages(input: {
  message: TelegramMessagePayload | null;
  relay: Pick<TelegramRelay, 'downloadFile'>;
  context: TelegramRelayContext;
}): Promise<InboundTelegramImage[]> {
  const message = input.message;
  if (!message || !input.relay.downloadFile) {
    return [];
  }
  const images: InboundTelegramImage[] = [];
  for (const image of normalizeTelegramAttachments(message).filter(isInboundTelegramImage)) {
    if (image.sizeBytes !== null && image.sizeBytes > TELEGRAM_INBOUND_IMAGE_MAX_BYTES) {
      continue;
    }
    const file = await input.relay.downloadFile({
      fileId: image.fileId!,
      maxBytes: TELEGRAM_INBOUND_IMAGE_MAX_BYTES,
      context: input.context,
    });
    if (file) {
      images.push({ name: resolveImageName(image, file.filePath, message), bytes: file.bytes });
    }
  }
  return images;
}
