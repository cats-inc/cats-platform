import type {
  TelegramDeliveryOperation,
  TelegramDeliveryRequest,
} from './contracts.js';

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

export interface TelegramDeliveryClientResult {
  ok: boolean;
  chatId: string | null;
  messageId: string | null;
  description?: string | null;
}

export interface TelegramDeliveryClient {
  deliver(request: TelegramDeliveryRequest & { chatId: string }): Promise<TelegramDeliveryClientResult>;
}

export interface TelegramBotApiDeliveryClientOptions {
  botToken: string;
  fetchImpl?: typeof fetch;
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
  response: Response,
): Promise<TelegramBotApiEnvelope<T>> {
  try {
    return await response.json() as TelegramBotApiEnvelope<T>;
  } catch {
    return {};
  }
}

function resolveApiMethod(operation: TelegramDeliveryOperation): string {
  if (operation === 'send' || operation === 'reply') {
    return 'sendMessage';
  }
  if (operation === 'edit') {
    return 'editMessageText';
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
    };
  }

  if (request.operation === 'edit') {
    return {
      chat_id: request.chatId,
      message_id: request.messageId ? Number(request.messageId) : undefined,
      text: request.text,
      parse_mode: request.parseMode ?? undefined,
      disable_web_page_preview: request.disableLinkPreview === true,
    };
  }

  return {
    chat_id: request.chatId,
    message_id: request.messageId ? Number(request.messageId) : undefined,
  };
}

export function createTelegramBotApiDeliveryClient(
  options: TelegramBotApiDeliveryClientOptions,
): TelegramDeliveryClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? 'https://api.telegram.org';
  const botToken = options.botToken.trim();

  return {
    async deliver(
      request: TelegramDeliveryRequest & { chatId: string },
    ): Promise<TelegramDeliveryClientResult> {
      const method = resolveApiMethod(request.operation);
      const response = await fetchImpl(
        `${apiBaseUrl}/bot${botToken}/${method}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(buildApiPayload(request)),
        },
      );

      if (request.operation === 'delete') {
        const payload = await parseApiResponse<TelegramBotApiDeleteResult>(response);
        const ok = response.ok && payload.ok === true;
        return {
          ok,
          chatId: request.chatId,
          messageId: request.messageId ?? null,
          description: ok ? null : payload.description ?? `Telegram API ${response.status}`,
        };
      }

      const payload = await parseApiResponse<TelegramBotApiMessageResult>(response);
      const ok = response.ok && payload.ok === true;
      const messageId = typeof payload.result?.message_id === 'number'
        ? String(payload.result.message_id)
        : request.messageId ?? null;

      return {
        ok,
        chatId: toChatId(payload.result?.chat?.id) ?? request.chatId,
        messageId,
        description: ok ? null : payload.description ?? `Telegram API ${response.status}`,
      };
    },
  };
}
