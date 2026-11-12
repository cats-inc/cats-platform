import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { routeConversationArchive } from '../build/server/products/chat/api/resources/conversationArchiveRoutes.js';
import { ConversationArchiveError } from '../build/server/products/chat/state/database/archiveJobs.js';
import { activateChannelSessions, wakeChannelEntryParticipant } from '../build/server/products/chat/state/runtime-session/activation.js';
import { ensureTargetSession } from '../build/server/products/chat/state/runtime-session/wake.js';
import { beginChannelMessageDispatch, beginChannelMessageRetryDispatch } from '../build/server/products/chat/state/runtime-dispatch/routing.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

for (const phase of ['request_aborted', 'response_destroyed', 'queued_abort']) {
  test(`archive does not begin after client disconnect at ${phase}`, async () => {
    // Deliberately partial route fixture: a disconnected response must never be written.
    const request = Object.assign(new EventEmitter(), { aborted: phase === 'request_aborted' });
    const response = Object.assign(new EventEmitter(), { destroyed: phase === 'response_destroyed', writableEnded: false });
    let calls = 0;
    const routed = await routeConversationArchive({ request, response, method: 'POST', url: new URL('http://fixture/api/channels/one/archive'),
      dependencies: { chatStore: { async archiveConversation() { calls++; throw Error('Disconnected request started archive'); } },
        mutationGate: { async run(_id, work) { if (phase === 'queued_abort') request.emit('aborted'); return work(); } } } });
    assert.equal(routed, true); assert.equal(calls, 0);
    assert.equal(request.listenerCount('aborted'), 0); assert.equal(response.listenerCount('close'), 0);
  });
}

test('a cancelled terminal archive attempt still notifies other channel subscriptions', async () => {
  const request = Object.assign(new EventEmitter(), { aborted: false });
  const response = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false });
  const events = [];
  await routeConversationArchive({ request, response, method: 'POST', url: new URL('http://fixture/api/channels/one/archive'),
    dependencies: { eventHub: { emit(event) { events.push(event); } }, mutationGate: { run(_id, work) { return work(); } },
      chatStore: { async archiveConversation() { request.emit('aborted'); throw new ConversationArchiveError('archive_cancelled'); } } } });
  assert.ok(events.some(event => event.kind === 'room_updated' && event.channelId === 'one'));
  assert.ok(events.some(event => event.kind === 'recents_changed'));
});

test('archived activation, room wake, target wake, send and retry refuse before any Runtime access', async () => {
  const state = snapshot().chat, id = state.channels[0].id; state.channels[0].status = 'archived';
  let calls = 0;
  const runtime = new Proxy({}, { get() { calls++; return () => { throw Error('Archived Runtime access'); }; } });
  for (const run of [() => activateChannelSessions(state, id, runtime), () => wakeChannelEntryParticipant(state, id, runtime),
    () => ensureTargetSession(state, id, {}, runtime, new Date()), () => beginChannelMessageDispatch(state, id, { body: 'No send' }, runtime),
    () => beginChannelMessageRetryDispatch(state, id, state.channels[0].messages[0].id, runtime)]) {
    await assert.rejects(run(), { code: 'conversation_archived' });
  }
  assert.equal(calls, 0);
});
