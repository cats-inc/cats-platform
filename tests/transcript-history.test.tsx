import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../src/products/chat/api/contracts.js';
import type { MessagePage } from '../src/products/shared/transcript.js';
import { TranscriptHistory, mergeTranscriptMessages, type TranscriptWindow } from '../src/products/shared/renderer/transcriptHistory.js';

const message = (id: number | string, body = String(id)): ChatMessage => ({ id: String(id), channelId: 'channel', senderKind: 'user',
  senderName: 'Owner', body, createdAt: '2026-11-12T00:00:00Z', mentions: [], metadata: {}, usage: null });
const window = (ids: number[], total = 4, historyRevision = 'a', orderRevision = '0'): TranscriptWindow => ({
  messages: ids.map(id => message(id)), total, nextCursor: ids[0] ? String(ids[0]) : null, orderRevision, historyRevision, rawCount: ids.length });
const page = (ids: number[], total = 4, historyRevision = 'a', orderRevision = '0'): MessagePage => ({
  ...window(ids, total, historyRevision, orderRevision), messages: ids.map(id => message(id)) });
const ids = (history: TranscriptHistory) => history.getSnapshot().messages.map(m => m.id);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('expanded history retains a contiguous range during tail updates and a concurrent older-page fetch', async t => {
  const older = deferred<MessagePage>(); const history = new TranscriptHistory(window([2, 3]), () => older.promise);
  t.after(() => history.cancel());
  const loading = history.loadOlder();
  history.observe(window([3, 4], 5));
  older.resolve(page([0, 1], 5)); await loading;
  assert.deepEqual(ids(history), ['0', '1', '2', '3', '4']);
  history.observe(window([4, 5], 6));
  assert.deepEqual(ids(history), ['0', '1', '2', '3', '4', '5']);
  assert.equal(history.getSnapshot().nextCursor, null);
});

test('stale cursor reloads newest, rejects retired snapshots and preserves later same-order observations', async t => {
  const newest = deferred<MessagePage>(); let calls = 0;
  const history = new TranscriptHistory(window([2, 3]), async () => {
    if (++calls === 1) throw Object.assign(new Error('stale'), { code: 'stale_message_cursor' });
    return newest.promise;
  });
  t.after(() => history.cancel());
  const loading = history.loadOlder(); await Promise.resolve(); await Promise.resolve();
  newest.resolve(page([8, 9], 10, 'a', '1')); await loading;
  assert.deepEqual(ids(history), ['8', '9']); assert.equal(history.getSnapshot().changed, true);
  history.observe(window([2, 3], 4)); assert.deepEqual(ids(history), ['8', '9']);
  const delayed = deferred<MessagePage>();
  const other = new TranscriptHistory(window([2, 3]), () => delayed.promise); t.after(() => other.cancel());
  const reload = other.reload();
  const observed = window([3, 4], 5); observed.messages[0].body = 'Edited after reload began';
  other.observe(observed); delayed.resolve(page([2, 3], 4)); await reload;
  assert.deepEqual(ids(other), ['3', '4']);
  assert.equal(other.getSnapshot().messages[0].body, 'Edited after reload began');
  other.observe(observed); assert.deepEqual(ids(other), ['3', '4']);
});

test('navigation cancellation retains invalidation and resumes refresh of an unchanged observed window', async t => {
  let edited = false; let count = 0;
  const history = new TranscriptHistory(window([2, 3]), async before => {
    count++;
    const result = before ? page([0, 1], 4, edited ? 'b' : 'a') : page([2, 3], 4, edited ? 'b' : 'a');
    if (edited && before) result.messages[0].body = 'Updated old body'; return result;
  }, 0);
  t.after(() => history.cancel());
  const unsubscribe = history.subscribe(() => {}); await history.loadOlder();
  edited = true; const observed = window([2, 3], 4, 'b'); history.observe(observed); unsubscribe();
  assert.equal(history.getSnapshot().messages[0].body, '0');
  const resumed = history.subscribe(() => {}); history.observe(observed);
  await new Promise(resolve => setTimeout(resolve, 20)); resumed();
  assert.equal(history.getSnapshot().messages[0].body, 'Updated old body'); assert.ok(count >= 3);
});

test('cancelling an active refresh also retains the pending revision', async t => {
  let calls = 0; const blocked = deferred<MessagePage>();
  const history = new TranscriptHistory(window([2, 3]), async before => {
    calls++; if (calls === 2) return blocked.promise;
    const result = before ? page([0, 1], 4, 'b') : page([2, 3], 4, 'b');
    if (before) result.messages[0].body = 'Fresh'; return result;
  }, 0);
  t.after(() => history.cancel()); await history.loadOlder();
  history.observe(window([2, 3], 4, 'b')); const refresh = history.refresh();
  history.cancel(); blocked.resolve(page([2, 3], 4)); await refresh;
  const resumed = history.subscribe(() => {}); await new Promise(resolve => setTimeout(resolve, 20)); resumed();
  assert.equal(history.getSnapshot().messages[0].body, 'Fresh');
});

test('refresh fills a reconnect gap and preserves the actual retained extent across later appends', async t => {
  let total = 4;
  const history = new TranscriptHistory(window([2, 3]), async before => {
    const end = before === undefined ? total : Number(before); const start = Math.max(0, end - 2);
    return page(Array.from({ length: end - start }, (_, n) => start + n), total);
  });
  t.after(() => history.cancel()); await history.loadOlder();
  total = 10; history.observe(window([8, 9], total)); await history.refresh();
  assert.deepEqual(ids(history), Array.from({ length: 10 }, (_, n) => String(n)));
  total = 12; history.observe(window([10, 11], total)); await history.refresh();
  assert.deepEqual(ids(history), Array.from({ length: 12 }, (_, n) => String(n)));
});

test('expanded refresh removes obsolete Core synthetic/prefix rows and inserts new display rows in order', async t => {
  let updated = false;
  const synthetic = { ...message('synthetic'), metadata: { event: 'conversation_presentation', turnId: 'turn', targetStateId: 'target',
    presentation: { id: 'synthetic', phase: 'streaming' } } };
  const history = new TranscriptHistory({ ...window([2, 3]), messages: [message(2), synthetic, message(3)] }, async before => {
    if (!before) return page([2, 3], 4, updated ? 'b' : 'a');
    return { ...page([0, 1], 4, updated ? 'b' : 'a'), displayMessages: updated ? [message(0), message('new-projection'), message(1)] : [message(0), message(1)] };
  });
  t.after(() => history.cancel()); await history.loadOlder(); updated = true;
  history.observe(window([2, 3], 4, 'b')); await history.refresh();
  assert.deepEqual(ids(history), ['0', 'new-projection', '1', '2', '3']);
});

test('merge uses durable full presentation once instead of overlapping chunks', () => {
  const prefix = { ...message('prefix'), metadata: { event: 'assistant_turn_segment', turnId: 'turn', targetStateId: 'target', terminal: false } };
  const terminal = { ...message('terminal', 'Full reply'), metadata: { ...prefix.metadata, terminal: true, presentation: { id: 'presentation' } } };
  assert.deepEqual(mergeTranscriptMessages([prefix], [terminal]).map(m => m.id), ['terminal']);
});

test('refresh includes server tail growth not yet observed and keeps the oldest retained boundary', async t => {
  let total = 4;
  const history = new TranscriptHistory(window([2, 3]), async before => {
    const end = before === undefined ? total : Number(before); const start = Math.max(0, end - 2);
    return page(Array.from({ length: end - start }, (_, n) => start + n), total);
  });
  t.after(() => history.cancel()); await history.loadOlder();
  total = 6; await history.refresh();
  assert.deepEqual(ids(history), ['0', '1', '2', '3', '4', '5']);
  history.observe(window([4, 5], 6));
  assert.deepEqual(ids(history), ['0', '1', '2', '3', '4', '5']);
});

test('a retained Core-only response keeps its display-time placement when newer tail messages precede it', () => {
  const early = { ...message('early'), createdAt: '2026-01-01T00:00:00Z' };
  const response = { ...message('response'), createdAt: '2026-01-03T00:00:00Z' };
  const tail = { ...message('tail'), createdAt: '2026-01-02T00:00:00Z' };
  assert.deepEqual(mergeTranscriptMessages([early, response], [tail, response]).map(message => message.id), ['early', 'tail', 'response']);
});
