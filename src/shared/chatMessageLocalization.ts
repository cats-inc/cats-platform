import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from './i18n/index.js';

export const CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY = 'localizedBody' as const;

export interface ChatMessageLocalizedBodyMetadata {
  key: MessageKey;
  values?: MessageInterpolationValues;
  valueKeys?: Record<string, MessageKey>;
}

export interface LocalizableChatMessage {
  body: string;
  metadata?: Record<string, unknown> | null;
}

export type ChatMessageTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const knownMessageKeys = new Set<string>([
  ...Object.keys(messageKeys),
  ...Object.values(messageKeys),
]);

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
  if (!isRecord(value) || !isMessageKey(value.key)) {
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

function readValueKeys(value: unknown): Record<string, MessageKey> | null {
  if (!isRecord(value)) {
    return null;
  }

  const keys: Record<string, MessageKey> = {};
  for (const [name, candidate] of Object.entries(value)) {
    if (isMessageKey(candidate)) {
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

function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && knownMessageKeys.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
