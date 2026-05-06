import type {
  TelegramDeliveryMediaKind,
  TelegramDeliveryRequest,
} from './contracts.js';
import {
  telegramIpv4Fetch,
  type TelegramFetch,
  type TelegramFetchResponse,
} from './http.js';

interface TelegramBotApiEnvelope<T> {
  ok?: boolean;
  result?: T;
  description?: string;
}

interface TelegramBotApiMessageResult {
  message_id?: number;
  chat?: {
    id?: number | string;
  };
}

interface TelegramBotApiDeleteResult {
  ok?: boolean;
}

export interface TelegramBotApiCommand {
  command: string;
  description: string;
}

export interface TelegramBotApiCommandScopeDefault {
  type: 'default';
}

export type TelegramBotApiCommandScope = TelegramBotApiCommandScopeDefault;

export interface TelegramBotApiMenuButtonCommands {
  type: 'commands';
}

export interface TelegramBotApiMenuButtonDefault {
  type: 'default';
}

export type TelegramBotApiMenuButton =
  | TelegramBotApiMenuButtonCommands
  | TelegramBotApiMenuButtonDefault;

export interface TelegramDeliveryClientResult {
  ok: boolean;
  chatId: string | null;
  messageId: string | null;
  description?: string | null;
}

export interface TelegramBotApiMutationResult {
  ok: boolean;
  description?: string | null;
}

export interface TelegramDeliveryClient {
  deliver(request: TelegramDeliveryRequest & { chatId: string }): Promise<TelegramDeliveryClientResult>;
  setMyCommands(request: {
    commands: TelegramBotApiCommand[];
    scope?: TelegramBotApiCommandScope | null;
    languageCode?: string | null;
  }): Promise<TelegramBotApiMutationResult>;
  deleteMyCommands(request?: {
    scope?: TelegramBotApiCommandScope | null;
    languageCode?: string | null;
  }): Promise<TelegramBotApiMutationResult>;
  setChatMenuButton(request: {
    chatId?: string | null;
    menuButton: TelegramBotApiMenuButton;
  }): Promise<TelegramBotApiMutationResult>;
}

export interface TelegramBotApiDeliveryClientOptions {
  botToken: string;
  fetchImpl?: TelegramFetch;
  apiBaseUrl?: string;
}

function toChatId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return null;
}

async function parseApiResponse<T>(
  response: TelegramFetchResponse,
): Promise<TelegramBotApiEnvelope<T>> {
  try {
    return await response.json() as TelegramBotApiEnvelope<T>;
  } catch {
    return {};
  }
}

function resolveMediaApiSpec(
  mediaKind: TelegramDeliveryMediaKind | null | undefined,
): { method: string; payloadField: string } {
  if (mediaKind === 'photo') {
    return { method: 'sendPhoto', payloadField: 'photo' };
  }
  if (mediaKind === 'audio') {
    return { method: 'sendAudio', payloadField: 'audio' };
  }
  if (mediaKind === 'video') {
    return { method: 'sendVideo', payloadField: 'video' };
  }
  if (mediaKind === 'animation') {
    return { method: 'sendAnimation', payloadField: 'animation' };
  }
  return { method: 'sendDocument', payloadField: 'document' };
}

function resolveApiMethod(request: TelegramDeliveryRequest): string {
  if (request.operation === 'send' || request.operation === 'reply') {
    return 'sendMessage';
  }
  if (request.operation === 'edit') {
    return 'editMessageText';
  }
  if (request.operation === 'send_media') {
    return resolveMediaApiSpec(request.mediaKind).method;
  }
  return 'deleteMessage';
}

function buildApiPayload(
  request: TelegramDeliveryRequest & { chatId: string },
): Record<string, unknown> {
  if (request.operation === 'send') {
    return {
      chat_id: request.chatId,
      text: request.text,
      parse_mode: request.parseMode ?? undefined,
      disable_web_page_preview: request.disableLinkPreview === true,
      reply_markup: request.replyMarkup ?? undefined,
    };
  }

  if (request.operation === 'reply') {
    return {
      chat_id: request.chatId,
      text: request.text,
      parse_mode: request.parseMode ?? undefined,
      disable_web_page_preview: request.disableLinkPreview === true,
      reply_to_message_id: request.replyToMessageId ? Number(request.replyToMessageId) : undefined,
      allow_sending_without_reply: true,
      reply_markup: request.replyMarkup ?? undefined,
    };
  }

  if (request.operation === 'edit') {
    return {
      chat_id: request.chatId,
      message_id: request.messageId ? Number(request.messageId) : undefined,
      text: request.text,
      parse_mode: request.parseMode ?? undefined,
      disable_web_page_preview: request.disableLinkPreview === true,
      reply_markup: request.replyMarkup ?? undefined,
    };
  }

  if (request.operation === 'send_media') {
    const mediaSpec = resolveMediaApiSpec(request.mediaKind);
    return {
      chat_id: request.chatId,
      [mediaSpec.payloadField]: request.fileId ?? request.mediaUrl,
      caption: request.caption ?? undefined,
      parse_mode: request.parseMode ?? undefined,
    };
  }

  return {
    chat_id: request.chatId,
    message_id: request.messageId ? Number(request.messageId) : undefined,
  };
}

async function postBotApi<T>(
  fetchImpl: TelegramFetch,
  apiBaseUrl: string,
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{
  response: TelegramFetchResponse;
  payload: TelegramBotApiEnvelope<T>;
}> {
  const response = await fetchImpl(
    `${apiBaseUrl}/bot${botToken}/${method}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    },
  );

  return {
    response,
    payload: await parseApiResponse<T>(response),
  };
}

export function createTelegramBotApiDeliveryClient(
  options: TelegramBotApiDeliveryClientOptions,
): TelegramDeliveryClient {
  const fetchImpl = options.fetchImpl ?? telegramIpv4Fetch;
  const apiBaseUrl = options.apiBaseUrl ?? 'https://api.telegram.org';
  const botToken = options.botToken.trim();

  return {
    async deliver(
      request: TelegramDeliveryRequest & { chatId: string },
    ): Promise<TelegramDeliveryClientResult> {
      const method = resolveApiMethod(request);
      const {
        response,
        payload,
      } = await postBotApi<TelegramBotApiDeleteResult | TelegramBotApiMessageResult>(
        fetchImpl,
        apiBaseUrl,
        botToken,
        method,
        buildApiPayload(request),
      );

      if (request.operation === 'delete') {
        const ok = response.ok && payload.ok === true;
        return {
          ok,
          chatId: request.chatId,
          messageId: request.messageId ?? null,
          description: ok ? null : payload.description ?? `Telegram API ${response.status}`,
        };
      }

      const messagePayload = payload as TelegramBotApiEnvelope<TelegramBotApiMessageResult>;
      const ok = response.ok && messagePayload.ok === true;
      const messageId = typeof messagePayload.result?.message_id === 'number'
        ? String(messagePayload.result.message_id)
        : request.messageId ?? null;

      return {
        ok,
        chatId: toChatId(messagePayload.result?.chat?.id) ?? request.chatId,
        messageId,
        description: ok ? null : messagePayload.description ?? `Telegram API ${response.status}`,
      };
    },

    async setMyCommands({
      commands,
      scope,
      languageCode,
    }): Promise<TelegramBotApiMutationResult> {
      const { response, payload } = await postBotApi<boolean>(
        fetchImpl,
        apiBaseUrl,
        botToken,
        'setMyCommands',
        {
          commands,
          scope: scope ?? undefined,
          language_code: languageCode ?? undefined,
        },
      );
      const ok = response.ok && payload.ok === true;
      return {
        ok,
        description: ok ? null : payload.description ?? `Telegram API ${response.status}`,
      };
    },

    async deleteMyCommands(request = {}): Promise<TelegramBotApiMutationResult> {
      const { response, payload } = await postBotApi<boolean>(
        fetchImpl,
        apiBaseUrl,
        botToken,
        'deleteMyCommands',
        {
          scope: request.scope ?? undefined,
          language_code: request.languageCode ?? undefined,
        },
      );
      const ok = response.ok && payload.ok === true;
      return {
        ok,
        description: ok ? null : payload.description ?? `Telegram API ${response.status}`,
      };
    },

    async setChatMenuButton({
      chatId,
      menuButton,
    }): Promise<TelegramBotApiMutationResult> {
      const { response, payload } = await postBotApi<boolean>(
        fetchImpl,
        apiBaseUrl,
        botToken,
        'setChatMenuButton',
        {
          chat_id: chatId ?? undefined,
          menu_button: menuButton,
        },
      );
      const ok = response.ok && payload.ok === true;
      return {
        ok,
        description: ok ? null : payload.description ?? `Telegram API ${response.status}`,
      };
    },
  };
}
