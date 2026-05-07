import { sendJson } from '../../../shared/http.js';
import { RuntimeSessionPolicyError } from '../../../shared/runtimeSessionPolicy.js';
import {
  CLIENT_MESSAGE_ID_MAX_LENGTH,
  isClientMessageIdTooLongError,
} from '../shared/clientMessageIdentity.js';
import type { ChatApiRouteContext } from './routeSupport.js';

export function errorStatusCode(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (
    message.startsWith('Channel not found:')
    || message.startsWith('Cat not found:')
    || message.startsWith('Channel cat assignment not found:')
  ) {
    return 404;
  }
  return 400;
}

export function sendRestError(
  context: ChatApiRouteContext,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  const payload: {
    error: { code: string; message: string; details?: Record<string, unknown> };
  } = {
    error: { code, message },
  };
  if (details) {
    payload.error.details = details;
  }
  sendJson(context.response, statusCode, payload);
}

export class ChatApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ChatApiError';
  }
}

export function handleRestError(
  context: ChatApiRouteContext,
  error: unknown,
): void {
  if (error instanceof ChatApiError) {
    sendRestError(
      context,
      error.statusCode,
      error.code,
      error.message,
      error.details,
    );
    return;
  }

  if (error instanceof RuntimeSessionPolicyError) {
    sendRestError(
      context,
      400,
      error.issue.code,
      error.issue.message,
      error.issue.details,
    );
    return;
  }

  if (isClientMessageIdTooLongError(error)) {
    const message = error instanceof Error
      ? error.message
      : `clientMessageId must be at most ${CLIENT_MESSAGE_ID_MAX_LENGTH} characters.`;
    sendRestError(context, 400, 'client_message_id_too_long', message);
    return;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Chat not found:')) {
    sendRestError(context, 404, 'chat_not_found', message);
    return;
  }
  if (message.startsWith('Channel not found:')) {
    sendRestError(context, 404, 'channel_not_found', message);
    return;
  }
  if (message.startsWith('Parallel chat group not found:')) {
    sendRestError(context, 404, 'parallel_chat_group_not_found', message);
    return;
  }
  if (message.startsWith('Cat not found:')) {
    sendRestError(context, 404, 'cat_not_found', message);
    return;
  }
  if (message.startsWith('Channel cat assignment not found:')) {
    sendRestError(context, 404, 'assignment_not_found', message);
    return;
  }
  if (message.startsWith('Bot binding not found:')) {
    sendRestError(context, 404, 'bot_binding_not_found', message);
    return;
  }

  sendRestError(context, 400, 'bad_request', message);
}

export function handleCanonicalCatError(
  context: ChatApiRouteContext,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Cat not found:')) {
    sendRestError(
      context,
      404,
      'cat_not_found',
      message.replace('Cat not found:', 'Cat not found:'),
    );
    return;
  }
  if (message.startsWith('Channel cat assignment not found:')) {
    sendRestError(
      context,
      404,
      'cat_not_found',
      message.replace(
        'Channel cat assignment not found:',
        'Cat not found in channel:',
      ),
    );
    return;
  }

  handleRestError(context, error);
}
