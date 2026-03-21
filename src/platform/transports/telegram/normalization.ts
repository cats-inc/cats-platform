import type {
  TelegramAnimationPayload,
  TelegramAttachmentKind,
  TelegramAudioPayload,
  TelegramContactPayload,
  TelegramDocumentPayload,
  TelegramFilePayload,
  TelegramLocationPayload,
  TelegramMessagePayload,
  TelegramNormalizedAttachment,
  TelegramNormalizedMessageSummary,
  TelegramPhotoSizePayload,
  TelegramStickerPayload,
  TelegramVideoNotePayload,
  TelegramVideoPayload,
  TelegramVoicePayload,
} from './contracts.js';

const MESSAGE_PREVIEW_LIMIT = 160;
type TelegramRichMediaPayload = TelegramFilePayload & {
  file_name?: string;
  width?: number;
  height?: number;
  duration?: number;
};

function normalizeTextPreview(rawText: string | null): string | null {
  if (!rawText) {
    return null;
  }

  const collapsed = rawText.replace(/\s+/gu, ' ').trim();
  if (!collapsed) {
    return null;
  }

  if (collapsed.length <= MESSAGE_PREVIEW_LIMIT) {
    return collapsed;
  }

  return `${collapsed.slice(0, MESSAGE_PREVIEW_LIMIT - 1)}…`;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function createBaseAttachment(
  kind: TelegramAttachmentKind,
  payload: TelegramFilePayload | null | undefined,
): TelegramNormalizedAttachment {
  return {
    kind,
    fileId: readString(payload?.file_id),
    fileUniqueId: readString(payload?.file_unique_id),
    fileName: null,
    mimeType: readString(payload?.mime_type),
    sizeBytes: readNumber(payload?.file_size),
    width: null,
    height: null,
    durationSeconds: null,
    latitude: null,
    longitude: null,
    phoneNumber: null,
    displayName: null,
  };
}

function normalizePhotoAttachment(
  payload: TelegramPhotoSizePayload | null | undefined,
): TelegramNormalizedAttachment {
  return {
    ...createBaseAttachment('photo', payload),
    width: readNumber(payload?.width),
    height: readNumber(payload?.height),
  };
}

function normalizeDocumentAttachment(
  kind: 'document' | 'audio' | 'video' | 'animation',
  payload:
    | TelegramDocumentPayload
    | TelegramAudioPayload
    | TelegramVideoPayload
    | TelegramAnimationPayload
    | null
    | undefined,
): TelegramNormalizedAttachment {
  const richPayload = payload as TelegramRichMediaPayload | null | undefined;
  return {
    ...createBaseAttachment(kind, payload),
    fileName: readString(richPayload?.file_name),
    width: readNumber(richPayload?.width),
    height: readNumber(richPayload?.height),
    durationSeconds: readNumber(richPayload?.duration),
  };
}

function normalizeVoiceAttachment(
  payload: TelegramVoicePayload | null | undefined,
): TelegramNormalizedAttachment {
  return {
    ...createBaseAttachment('voice', payload),
    durationSeconds: readNumber(payload?.duration),
  };
}

function normalizeVideoNoteAttachment(
  payload: TelegramVideoNotePayload | null | undefined,
): TelegramNormalizedAttachment {
  return {
    ...createBaseAttachment('video_note', payload),
    width: readNumber(payload?.length),
    height: readNumber(payload?.length),
    durationSeconds: readNumber(payload?.duration),
  };
}

function normalizeStickerAttachment(
  payload: TelegramStickerPayload | null | undefined,
): TelegramNormalizedAttachment {
  const emoji = readString(payload?.emoji);
  return {
    ...createBaseAttachment('sticker', payload),
    width: readNumber(payload?.width),
    height: readNumber(payload?.height),
    displayName: emoji,
  };
}

function normalizeLocationAttachment(
  payload: TelegramLocationPayload | null | undefined,
): TelegramNormalizedAttachment {
  return {
    kind: 'location',
    fileId: null,
    fileUniqueId: null,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    width: null,
    height: null,
    durationSeconds: null,
    latitude: readNumber(payload?.latitude),
    longitude: readNumber(payload?.longitude),
    phoneNumber: null,
    displayName: null,
  };
}

function normalizeContactAttachment(
  payload: TelegramContactPayload | null | undefined,
): TelegramNormalizedAttachment {
  const firstName = readString(payload?.first_name);
  const lastName = readString(payload?.last_name);
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    kind: 'contact',
    fileId: null,
    fileUniqueId: readString(payload?.user_id),
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    width: null,
    height: null,
    durationSeconds: null,
    latitude: null,
    longitude: null,
    phoneNumber: readString(payload?.phone_number),
    displayName: displayName || null,
  };
}

export function normalizeTelegramAttachments(
  message: TelegramMessagePayload,
): TelegramNormalizedAttachment[] {
  const attachments: TelegramNormalizedAttachment[] = [];

  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const largestPhoto = message.photo[message.photo.length - 1];
    attachments.push(normalizePhotoAttachment(largestPhoto));
  }
  if (message.document) {
    attachments.push(normalizeDocumentAttachment('document', message.document));
  }
  if (message.audio) {
    attachments.push(normalizeDocumentAttachment('audio', message.audio));
  }
  if (message.voice) {
    attachments.push(normalizeVoiceAttachment(message.voice));
  }
  if (message.video) {
    attachments.push(normalizeDocumentAttachment('video', message.video));
  }
  if (message.video_note) {
    attachments.push(normalizeVideoNoteAttachment(message.video_note));
  }
  if (message.animation) {
    attachments.push(normalizeDocumentAttachment('animation', message.animation));
  }
  if (message.sticker) {
    attachments.push(normalizeStickerAttachment(message.sticker));
  }
  if (message.location) {
    attachments.push(normalizeLocationAttachment(message.location));
  }
  if (message.contact) {
    attachments.push(normalizeContactAttachment(message.contact));
  }

  return attachments;
}

export function normalizeTelegramMessageSummary(
  message: TelegramMessagePayload,
  options: { isEdited?: boolean } = {},
): TelegramNormalizedMessageSummary {
  const senderDisplayName = [
    readString(message.from?.first_name),
    readString(message.from?.last_name),
  ].filter(Boolean).join(' ').trim() || null;
  const attachments = normalizeTelegramAttachments(message);

  return {
    isEdited: options.isEdited ?? false,
    senderId: message.from?.id != null ? String(message.from.id) : null,
    senderDisplayName,
    senderUsername: readString(message.from?.username),
    textPreview: normalizeTextPreview(readString(message.text) ?? readString(message.caption)),
    attachmentCount: attachments.length,
    attachmentKinds: attachments.map((attachment) => attachment.kind),
    replyToMessageId:
      typeof message.reply_to_message?.message_id === 'number'
        ? String(message.reply_to_message.message_id)
        : null,
  };
}

export function normalizeTelegramDeliveryTextPreview(text: string | null | undefined): string | null {
  return normalizeTextPreview(typeof text === 'string' ? text : null);
}
