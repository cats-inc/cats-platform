import type { ConversationArchiveResult } from '../../conversationArchive.js';
import type { TranscriptChannelView } from '../../transcript.js';

export class ConversationArchiveRequestError extends Error {
  constructor(readonly code: string, readonly status: number) { super('The conversation archive request failed.'); }
}

export async function changeConversationArchive(channelId: string, action: 'archive' | 'restore', signal: AbortSignal): Promise<ConversationArchiveResult> {
  const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}/${action === 'archive' ? 'archive' : 'unarchive'}`, {
    method: 'POST', headers: { Accept: 'application/json' }, signal,
  });
  signal.throwIfAborted();
  if (!response.ok) {
    let code = 'archive_failed';
    try { const body = await response.json() as { error?: { code?: unknown } }; if (typeof body.error?.code === 'string') code = body.error.code; }
    catch { /* Preserve cancellation below; never show an arbitrary response body. */ }
    signal.throwIfAborted(); throw new ConversationArchiveRequestError(code, response.status);
  }
  const result = await response.json() as ConversationArchiveResult;
  signal.throwIfAborted();
  if (result.channelId !== channelId || typeof result.archived !== 'boolean') throw new ConversationArchiveRequestError('archive_failed', 502);
  return result;
}

export async function fetchArchiveChannel(channelId: string, signal: AbortSignal): Promise<TranscriptChannelView> {
  const response = await fetch(`/api/channels/${encodeURIComponent(channelId)}`, { headers: { Accept: 'application/json' }, signal });
  signal.throwIfAborted();
  if (!response.ok) throw new ConversationArchiveRequestError('archive_refresh_failed', response.status);
  const result = await response.json() as { channel: TranscriptChannelView };
  signal.throwIfAborted();
  if (result.channel?.id !== channelId) throw new ConversationArchiveRequestError('archive_refresh_failed', 502);
  return result.channel;
}
