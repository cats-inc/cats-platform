import type { MessagePage, MessageSearchOptions, MessageSearchResponse } from '../../transcript.js';

export class TranscriptQueryError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function query<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (response.ok) return response.json() as Promise<T>;
  let code = 'transcript_query_failed';
  let message = 'Unable to load conversation messages.';
  try {
    const payload = await response.json() as { error?: { code?: string; message?: string } };
    if (typeof payload.error?.code === 'string') code = payload.error.code;
    if (typeof payload.error?.message === 'string') message = payload.error.message;
  } catch { /* An interrupted/non-JSON response retains a usable generic error. */ }
  signal?.throwIfAborted();
  throw new TranscriptQueryError(response.status, code, message);
}

export function fetchMessagePage(channelId: string, options: { limit?: number; before?: string } = {}, signal?: AbortSignal): Promise<MessagePage> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.before !== undefined) params.set('before', options.before);
  return query(`/api/channels/${encodeURIComponent(channelId)}/messages?${params}`, signal);
}

export function searchConversationMessages(text: string, options: MessageSearchOptions = {}, signal?: AbortSignal): Promise<MessageSearchResponse> {
  const params = new URLSearchParams({ q: text });
  if (options.channelId !== undefined) params.set('channelId', options.channelId);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  return query(`/api/conversations/messages/search?${params}`, signal);
}
