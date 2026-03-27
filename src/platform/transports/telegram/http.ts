import { request as httpsRequest } from 'node:https';
import type { RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';

type TelegramHeaderValue = string | number | boolean;
type TelegramHeadersInit =
  | Record<string, TelegramHeaderValue>
  | Array<[string, TelegramHeaderValue]>;
type TelegramBodyInit = string | URLSearchParams | ArrayBuffer | ArrayBufferView;

export interface TelegramFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type TelegramFetch = (
  url: string,
  options?: {
    method?: string;
    headers?: TelegramHeadersInit;
    body?: TelegramBodyInit | null;
    signal?: AbortSignal | null;
  },
) => Promise<TelegramFetchResponse>;

type TelegramRequestImpl = (
  url: URL,
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => ClientRequest;

function normalizeHeaders(headers: TelegramHeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

function normalizeBody(body: TelegramBodyInit | null | undefined): Buffer | null {
  if (body == null) {
    return null;
  }
  if (typeof body === 'string') {
    return Buffer.from(body);
  }
  if (body instanceof URLSearchParams) {
    return Buffer.from(body.toString());
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  return Buffer.from(String(body));
}

function createTelegramResponse(status: number, body: string): TelegramFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(body) as unknown;
    },
    async text() {
      return body;
    },
  };
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export function createTelegramIpv4Fetch(
  requestImpl: TelegramRequestImpl = httpsRequest,
): TelegramFetch {
  return async (url, options = {}) => {
    const target = new URL(url);
    const headers = normalizeHeaders(options.headers);
    const body = normalizeBody(options.body);

    if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
      headers['content-length'] = String(body.byteLength);
    }

    return await new Promise<TelegramFetchResponse>((resolve, reject) => {
      const request = requestImpl(
        target,
        {
          method: options.method ?? 'GET',
          headers,
          family: 4,
          servername: target.hostname,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          });
          response.on('end', () => {
            resolve(
              createTelegramResponse(
                response.statusCode ?? 500,
                Buffer.concat(chunks).toString('utf8'),
              ),
            );
          });
        },
      );

      const signal = options.signal ?? null;
      const abortListener = () => {
        request.destroy(createAbortError(signal?.reason));
      };

      if (signal?.aborted) {
        request.destroy(createAbortError(signal.reason));
        reject(createAbortError(signal.reason));
        return;
      }

      signal?.addEventListener('abort', abortListener, { once: true });
      request.on('error', (error: unknown) => {
        signal?.removeEventListener('abort', abortListener);
        reject(error);
      });
      request.on('close', () => {
        signal?.removeEventListener('abort', abortListener);
      });

      if (body) {
        request.write(body);
      }
      request.end();
    });
  };
}

export const telegramIpv4Fetch = createTelegramIpv4Fetch();
