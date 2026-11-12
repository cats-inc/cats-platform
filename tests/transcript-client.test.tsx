import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchMessagePage, searchConversationMessages, TranscriptQueryError } from '../src/products/shared/renderer/api/transcript.js';

test('transcript queries encode input, pass cancellation and preserve stale-cursor errors', async t => {
  const calls: Array<{ url: string; signal: AbortSignal | null | undefined }> = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), signal: init?.signal });
    if (calls.length === 3) return new Response(JSON.stringify({ error: { code: 'stale_message_cursor', message: 'Reload newest page.' } }), { status: 409 });
    return new Response(JSON.stringify(calls.length === 1 ? { messages: [], total: 0, nextCursor: null } : { hits: [] }));
  });
  const controller = new AbortController();
  assert.deepEqual(await fetchMessagePage('channel/id', { before: 'a&b', limit: 12 }, controller.signal), { messages: [], total: 0, nextCursor: null });
  assert.deepEqual(await searchConversationMessages('公園 & hello', { channelId: 'channel/id', limit: 5 }, controller.signal), { hits: [] });
  assert.equal(calls[0].url, '/api/channels/channel%2Fid/messages?limit=12&before=a%26b');
  assert.equal(new URL(calls[1].url, 'http://fixture').searchParams.get('q'), '公園 & hello');
  assert.ok(calls.every(call => call.signal === controller.signal));
  await assert.rejects(fetchMessagePage('channel/id'), error => error instanceof TranscriptQueryError
    && error.status === 409 && error.code === 'stale_message_cursor');
});

test('cancellation while reading an error response remains cancellation', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => {
    controller.abort();
    return new Response('interrupted error body', { status: 503 });
  });
  await assert.rejects(fetchMessagePage('channel', {}, controller.signal), { name: 'AbortError' });
});
