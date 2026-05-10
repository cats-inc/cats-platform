import type { ServerResponse } from 'node:http';

import { type PlatformAuthErrorCode } from '../../platform/auth/index.js';
import { sendJson } from '../../shared/http.js';

export type PlatformAuthErrorStatusCode = 400 | 401 | 403 | 409 | 503;

export function sendPlatformAuthError(
  response: ServerResponse,
  statusCode: PlatformAuthErrorStatusCode,
  code: PlatformAuthErrorCode,
  message: string,
): void {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
    },
  });
}
