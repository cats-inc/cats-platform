import {
  messageKeys,
  type MessageCatalogId,
  type MessageInterpolationValues,
} from './i18n/index.js';

export const CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY = 'localizedBody' as const;

export interface ChatMessageLocalizedBodyMetadata {
  key: MessageCatalogId;
  values?: MessageInterpolationValues;
  valueKeys?: Record<string, MessageCatalogId>;
}

export interface LocalizableChatMessage {
  body: string;
  metadata?: Record<string, unknown> | null;
}

export type ChatMessageTranslator = (
  key: MessageCatalogId,
  values?: MessageInterpolationValues,
) => string;

const knownMessageCatalogIds = new Set<string>(Object.values(messageKeys));

// Server-rendered surfaces persist `message.body` as the transport/channel-locale
// fallback. UI surfaces with their own owner locale should resolve this metadata
// at render/read time so the active UI locale can override that stored fallback.
export function resolveLocalizedChatMessageBody(
  message: LocalizableChatMessage,
  translate: ChatMessageTranslator,
): string {
  const localizedBody = readChatMessageLocalizedBodyMetadata(
    message.metadata?.[CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY],
  );
  if (!localizedBody) {
    return message.body;
  }

  return resolveChatMessageLocalizedBodyMetadata(localizedBody, translate);
}

export function resolveChatMessageLocalizedBodyMetadata(
  localizedBody: ChatMessageLocalizedBodyMetadata,
  translate: ChatMessageTranslator,
): string {
  const values: MessageInterpolationValues = {
    ...(localizedBody.values ?? {}),
  };
  for (const [name, key] of Object.entries(localizedBody.valueKeys ?? {})) {
    values[name] = translate(key);
  }

  return translate(localizedBody.key, values);
}

function readChatMessageLocalizedBodyMetadata(
  value: unknown,
): ChatMessageLocalizedBodyMetadata | null {
  if (!isRecord(value) || !isMessageCatalogId(value.key)) {
    return null;
  }

  const values = readInterpolationValues(value.values);
  const valueKeys = readValueKeys(value.valueKeys);

  return {
    key: value.key,
    ...(values ? { values } : {}),
    ...(valueKeys ? { valueKeys } : {}),
  };
}

function readInterpolationValues(value: unknown): MessageInterpolationValues | null {
  if (!isRecord(value)) {
    return null;
  }

  const values: MessageInterpolationValues = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (isInterpolationValue(candidate)) {
      values[key] = candidate;
    }
  }
  return Object.keys(values).length > 0 ? values : null;
}

function readValueKeys(value: unknown): Record<string, MessageCatalogId> | null {
  if (!isRecord(value)) {
    return null;
  }

  const keys: Record<string, MessageCatalogId> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (isMessageCatalogId(candidate)) {
      keys[name] = candidate;
    }
  }
  return Object.keys(keys).length > 0 ? keys : null;
}

function isInterpolationValue(value: unknown): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function isMessageCatalogId(value: unknown): value is MessageCatalogId {
  return typeof value === 'string' && knownMessageCatalogIds.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
