import type { ConnectionConfig } from './persistence';
import {
  getMobileApiCopy,
  resolveDefaultMobileLocale,
} from '../../../src/mobile/index.js';

/**
 * Thin typed `fetch` wrapper for the mobile client. Reads the persisted
 * `ConnectionConfig` for the base URL + (optional) pairing token, and
 * exposes `get` / `post` with shared error handling so call sites do
 * not repeat the same plumbing for every endpoint.
 *
 * The client is intentionally narrow — no streaming, no retries, no
 * cancellation token plumbing. Phase 4c adds streaming for assistant
 * replies (SSE / WebSocket) on top; cancellation lands when virtualised
 * conversation history needs it.
 */

export class MobileApiError extends Error {
  readonly name = 'MobileApiError' as const;

  constructor(
    message: string,
    readonly status: number | null,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export interface MobileApiClient {
  /** GETs `path` and parses JSON. Throws `MobileApiError` on !ok. */
  get<T>(path: string): Promise<T>;
  /** POSTs `body` as JSON to `path` and parses JSON. Throws on !ok. */
  post<T>(path: string, body: unknown): Promise<T>;
  /** DELETEs `path` and parses JSON. Throws on !ok. Used for
   *  Recents-row delete (mirrors the web `deleteChatChannel`
   *  helper). */
  del<T>(path: string): Promise<T>;
  /** Resolved base URL (without trailing slash). Useful for callers
   *  building auxiliary URLs (e.g. attachment fetch). */
  readonly baseUrl: string;
}

export interface MobileApiClientOptions {
  bearerToken?: string | null;
}

/**
 * Builds a `MobileApiClient` against the given config. Throws
 * synchronously when `baseUrl` is empty so the caller can surface a
 * clear "configure connection first" message instead of waiting for
 * the first network call to fail.
 */
export function createMobileApiClient(
  config: ConnectionConfig,
  options: MobileApiClientOptions = {},
): MobileApiClient {
  if (!config.baseUrl) {
    const copy = getMobileApiCopy(resolveDefaultMobileLocale());
    throw new MobileApiError(
      copy.configureBaseUrlForClient,
      null,
      null,
    );
  }
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');

  async function call<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Cats-Client': 'mobile',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const bearerToken = options.bearerToken?.trim();
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new MobileApiError(
        `Mobile API ${method} ${path} failed: network error.`,
        null,
        error instanceof Error ? error.message : null,
      );
    }
    if (!response.ok) {
      let errorBody: unknown = null;
      try {
        errorBody = await response.json();
      } catch {
        // non-JSON error body — fall through with null
      }
      throw new MobileApiError(
        `Mobile API ${method} ${path} failed (${response.status}).`,
        response.status,
        errorBody,
      );
    }
    return (await response.json()) as T;
  }

  return {
    baseUrl,
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    del: (path) => call('DELETE', path),
  };
}

/**
 * Returns a `resolveAttachmentUrl` callback compatible with the mobile
 * `MessageBody` component. Composes the API client's `baseUrl` with
 * the same channel-attachments path the web renderer uses
 * (`/api/channels/{id}/attachments/{filename}`). Returns `null` when
 * no client is available yet (caller skips rendering interactive
 * attachments — same contract `NO_CONNECTION_RESOLVER` used in
 * ChatView during the fixture phase).
 */
export function buildAttachmentResolver(
  client: MobileApiClient | null,
): (channelId: string, filename: string) => string | null {
  if (client === null) {
    return () => null;
  }
  const { baseUrl } = client;
  return (channelId, filename) => {
    const encodedChannelId = encodeURIComponent(channelId);
    const encodedFilename = encodeURIComponent(filename);
    return `${baseUrl}/api/channels/${encodedChannelId}/attachments/${encodedFilename}`;
  };
}
