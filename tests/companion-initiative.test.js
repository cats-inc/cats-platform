import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCompanionHeartbeatPrompt,
  countUnansweredHeartbeats,
  isOwnerMessage,
  pickCompanionHeartbeatDelayMs,
} from '../build/server/products/chat/companion/life/heartbeat.js';
import { createCompanionLifeLoop } from '../build/server/products/chat/companion/life/loop.js';
import {
  applyCompanionLifeProfilePatch,
  normalizeCompanionLifeProfile,
  validateCompanionLifeUpdate,
} from '../build/server/products/chat/companion/life/profile.js';
import { buildCompanionWorkReview } from '../build/server/products/chat/companion/life/review.js';
import { createMemoryCompanionActivityStore } from '../build/server/products/chat/companion/activityStore.js';

/**
 * SPEC-137: what a companion Cat does on its own initiative (assist or
 * companion), and its back-off while the owner does not answer, read from the
 * lane so a restart is never an answer.
 */

const NOW_ISO = '2026-09-29T00:00:00.000Z';

/** Local wall-clock times keep these tests independent of the host time zone. */
function at(hours, minutes = 0, day = 29) {
  return new Date(2026, 8, day, hours, minutes);
}

function catAssignment() {
  return {
    participantId: 'cat-1',
    sourceKind: 'cat',
    sourceRefId: 'cat-1',
    catId: 'cat-1',
    name: 'Mochi',
    status: 'active',
    roles: [],
    roleHint: null,
    joinedAt: NOW_ISO,
    leftAt: null,
    execution: {
      target: { provider: 'claude', instance: null, model: null },
      lease: {
        sessionId: 'session-1',
        status: 'ready',
        laneId: null,
        cwd: null,
        lastError: null,
        provider: 'claude',
        model: null,
        startedAt: null,
        lastUsedAt: null,
      },
    },
  };
}

function lane(messages = []) {
  return {
    id: 'lane-1',
    title: '',
    topic: '',
    status: 'active',
    channelKind: 'direct_message',
    roomRouting: { mode: 'direct_message', defaultRecipientId: 'cat-1' },
    catAssignments: [catAssignment()],
    messages,
    lastMessageAt: messages.at(-1)?.createdAt ?? null,
  };
}

function room(id, title, messages, extra = {}) {
  return {
    id,
    title,
    topic: '',
    status: 'active',
    channelKind: 'chat_channel',
    roomRouting: { mode: 'chat_channel' },
    catAssignments: [{ ...catAssignment(), execution: { ...catAssignment().execution, lease: { ...catAssignment().execution.lease, sessionId: `session-${id}` } } }],
    messages,
    lastMessageAt: messages.at(-1)?.createdAt ?? null,
    ...extra,
  };
}

let messageId = 0;
function message(senderKind, body, createdAt, metadata = {}) {
  messageId += 1;
  return {
    id: `m-${messageId}`,
    channelId: 'lane-1',
    senderKind,
    senderName: senderKind === 'user' ? 'Owner' : 'Mochi',
    body,
    mentions: [],
    metadata,
    usage: null,
    createdAt: createdAt.toISOString(),
  };
}

function heartbeat(kind, createdAt) {
  return message('agent', `a ${kind} hello`, createdAt, { companionHeartbeat: { kind }, targetKind: 'cat', targetId: 'cat-1' });
}

/** A Cat whose `speak` writes what it says into the lane, as the real speaker does. */
function createHarness({ group = 'standard', life = {}, channels = [], reply = 'spoke' } = {}) {
  const state = {
    cats: [{ id: 'cat-1', name: 'Mochi', status: 'active', roles: ['companion'], group }],
    channels: [lane(), ...channels],
  };
  const harness = { state, requests: [], deactivations: 0, now: at(7, 0), reply, loop: null };
  const profile = {
    ...normalizeCompanionLifeProfile(undefined, NOW_ISO),
    wakeWindowStart: '07:00',
    wakeWindowEnd: '07:00',
    bedtime: '23:00',
    ...life,
  };
  harness.life = profile;
  harness.open = () => createCompanionLifeLoop({
    readChatState: async () => state,
    readCompanionSnapshot: async () => ({ boxes: [{ catId: 'cat-1', life: harness.life }] }),
    runtimeClient: {
      observeSession: async () => ({ session: { status: 'ready' } }),
      getHealth: async () => ({ reachable: true }),
    },
    activityStore: createMemoryCompanionActivityStore(),
    activateLane: async () => [{ targetKind: 'cat', targetId: 'cat-1', status: 'started' }],
    deactivateLane: async () => {
      harness.deactivations += 1;
      return { closedSessionCount: 1 };
    },
    speak: async (request) => {
      harness.requests.push(request);
      if (harness.reply === 'spoke') {
        const said = heartbeat(request.kind, request.now);
        state.channels[0].messages.push(said);
        state.channels[0].lastMessageAt = said.createdAt;
      }
      return harness.reply;
    },
    random: () => 0,
    now: () => harness.now,
  });
  harness.loop = harness.open();
  harness.tickAt = async (time) => {
    harness.now = time;
    return (await harness.loop.tick())[0];
  };
  return harness;
}

test('each unanswered message doubles the wait, five stop it, and only the owner answers (SPEC-137 FR-5, FR-6)', async () => {
  const harness = createHarness();
  await harness.tickAt(at(7, 0));
  assert.equal((await harness.tickAt(at(7, 2))).heartbeat?.kind, 'wake');
  assert.equal(harness.requests[0].unanswered, 0);

  assert.equal((await harness.tickAt(at(8, 1))).heartbeat, undefined, 'one unanswered message: twice the 30 minutes');
  assert.equal((await harness.tickAt(at(8, 2))).heartbeat?.kind, 'regular');
  assert.equal(harness.requests[1].unanswered, 1, 'the prompt says how many went unanswered');
  assert.equal((await harness.tickAt(at(10, 1))).heartbeat, undefined, 'two: four times');
  assert.equal((await harness.tickAt(at(10, 2))).heartbeat?.kind, 'regular');
  assert.equal((await harness.tickAt(at(14, 2))).heartbeat?.kind, 'regular');
  assert.equal(harness.requests.length, 4);

  // A restart is not an answer: the count is read from the lane.
  harness.loop = harness.open();
  await harness.tickAt(at(14, 30));
  assert.equal((await harness.tickAt(at(15, 0))).heartbeat, undefined, 'four unanswered after a restart: still sixteen times the wait');

  // A group member writing in a channel bound to a group chat is not the owner.
  harness.state.channels.push(room('group-1', 'Family group', [
    message('user', 'hi Mochi', at(15, 0), { transport: 'telegram' }),
  ]));
  assert.equal((await harness.tickAt(at(15, 1))).heartbeat, undefined);

  harness.state.channels[0].messages.push(message('user', 'sorry, I was away', at(15, 2)));
  harness.state.channels[0].lastMessageAt = at(15, 2).toISOString();
  await harness.tickAt(at(15, 3));
  const answered = await harness.tickAt(at(15, 33));
  assert.equal(answered.heartbeat?.kind, 'regular', 'the owner answered: back to the ordinary 30 minutes');
  assert.equal(harness.requests.at(-1).unanswered, 0);
});

test('after five unanswered messages the Cat waits for the owner, says no good night, and resumes when turned back on (SPEC-137 FR-4, FR-5, FR-9)', async () => {
  const unanswered = [at(9, 0, 28), at(11, 0, 28), at(15, 0, 28), at(19, 0, 28), at(22, 0, 28)].map((time) => heartbeat('regular', time));
  const harness = createHarness();
  harness.state.channels[0].messages.push(...unanswered);
  await harness.tickAt(at(7, 0));
  for (const time of [at(7, 15), at(9, 0), at(13, 0), at(22, 0)]) {
    assert.equal((await harness.tickAt(time)).heartbeat, undefined, 'nothing is said while it waits');
  }
  const night = await harness.tickAt(at(23, 20));
  assert.equal(night.outcome, 'slept');
  assert.equal(night.heartbeat, undefined, 'no good night on top of five unanswered messages');
  assert.equal(harness.requests.length, 0);

  // Turning it off and on again is the owner asking for it.
  harness.life = applyCompanionLifeProfilePatch(
    applyCompanionLifeProfilePatch(harness.life, { enabled: false }, at(6, 0, 30).toISOString()),
    { enabled: true },
    at(6, 1, 30).toISOString(),
  );
  assert.equal(harness.life.enabledAt, at(6, 1, 30).toISOString());
  await harness.tickAt(at(7, 0, 30));
  assert.equal((await harness.tickAt(at(7, 2, 30))).heartbeat?.kind, 'wake', 'the count starts over');
});

test('assist looks over the Cat\'s own Chat conversations; nothing new runs no turn; it says no good night (SPEC-137 FR-1, FR-7 to FR-9)', async () => {
  const harness = createHarness({
    group: 'admin',
    reply: 'quiet',
    channels: [
      room('room-1', 'Parser refactor', [
        message('user', 'please split the parser into lexer and grammar files', at(18, 0, 28)),
        message('agent', 'Started: the lexer is in its own file.', at(18, 5, 28), { targetKind: 'cat', targetId: 'cat-1' }),
      ]),
      room('work-1', 'Quarterly report', [message('user', 'secret work thing', at(18, 0, 28))], { originSurface: 'work' }),
      room('other-cat', 'Not Mochi\'s', [message('user', 'for another cat', at(18, 0, 28))], { catAssignments: [{ ...catAssignment(), participantId: 'cat-2', sourceRefId: 'cat-2', catId: 'cat-2' }] }),
    ],
  });
  await harness.tickAt(at(7, 0));
  assert.equal((await harness.tickAt(at(7, 2))).heartbeat?.result, 'quiet');
  const [first] = harness.requests;
  assert.equal(first.mode, 'assist', 'auto assists for a Boss Cat');
  assert.match(first.review, /Conversation "Parser refactor"/u);
  assert.match(first.review, /Owner: please split the parser into lexer and grammar files/u);
  assert.match(first.review, /You: Started: the lexer is in its own file\./u);
  assert.doesNotMatch(first.review, /secret work thing|for another cat/u, 'only its own Chat conversations');

  assert.deepEqual((await harness.tickAt(at(7, 32))).heartbeat, { kind: 'regular', result: 'skipped' }, 'nothing new since a quiet look');
  assert.equal(harness.requests.length, 1);

  harness.state.channels[1].messages.push(message('user', 'also add tests for the lexer', at(7, 40)));
  await harness.tickAt(at(8, 2));
  assert.equal(harness.requests.length, 2);
  assert.match(harness.requests[1].review, /also add tests for the lexer/u);

  const night = await harness.tickAt(at(23, 20));
  assert.equal(night.outcome, 'slept');
  assert.equal(harness.requests.length, 2, 'assist says no good night');

  const companion = createHarness({ life: { mode: 'companion' }, group: 'admin' });
  await companion.tickAt(at(7, 0));
  await companion.tickAt(at(7, 2));
  assert.equal(companion.requests[0].mode, 'companion', 'a chosen mode wins over the Boss Cat default');
  assert.equal(companion.requests[0].review, null);
});

test('the review keeps every recent conversation within its budget, newest first (SPEC-137 FR-7)', () => {
  const now = at(12, 0);
  const channels = [lane([message('user', 'what about dinner?', at(11, 0))])];
  for (let index = 0; index < 30; index += 1) {
    channels.push(room(`room-${index}`, `Note ${index}`, Array.from({ length: 8 }, (_, line) =>
      message(line % 2 ? 'agent' : 'user', `${'x'.repeat(200)} ${index}-${line}`, at(10, line, 29 - (index % 10)),
        line % 2 ? { targetKind: 'cat', targetId: 'cat-1' } : {}))));
  }
  const review = buildCompanionWorkReview(channels, 'cat-1', now);
  assert.ok(review.text.length <= 6_200, `bounded: ${review.text.length}`);
  assert.match(review.text, /^1\. Your direct conversation with your owner/mu, 'newest first');
  assert.match(review.text, /more conversations with recent messages left out|Note \d+/u);
  assert.equal(buildCompanionWorkReview(channels, 'cat-1', at(12, 0, 29 + 20)), null, 'nothing within 14 days');
});

test('prompts, delays, owner messages and the profile (SPEC-137 FR-1 to FR-5, FR-10)', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 7].map((count) => pickCompanionHeartbeatDelayMs('regular', () => 0, count) / 60_000), [30, 60, 120, 240, 480, 480]);
  assert.equal(pickCompanionHeartbeatDelayMs('wake', () => 0, 3) / 60_000, 2, 'wake waits are not multiplied');

  const assist = buildCompanionHeartbeatPrompt({
    kind: 'regular', mode: 'assist', now: at(10, 0), awakeSince: at(7, 0), lastOwnerMessageAt: at(9, 0),
    companionContext: null, unanswered: 2, review: 'REVIEW BLOCK', hasPhotoAlbum: true,
  });
  assert.match(assist, /not for small talk/u);
  assert.match(assist, /REVIEW BLOCK/u);
  assert.match(assist, /not answered the last 2 unprompted messages/u);
  assert.match(assist, /Do not start the work now/u);
  const companion = buildCompanionHeartbeatPrompt({
    kind: 'regular', now: at(10, 0), awakeSince: at(7, 0), lastOwnerMessageAt: null, companionContext: null,
  });
  assert.match(companion, /Do not repeat what you already said/u);
  assert.doesNotMatch(companion, /unprompted messages you sent|not answered/u);

  const dm = lane();
  const group = room('group', 'Group', []);
  assert.equal(isOwnerMessage(dm, message('user', 'hi', at(9, 0), { transport: 'telegram' })), true, 'a transport message in a direct lane is the owner\'s');
  assert.equal(isOwnerMessage(group, message('user', 'hi', at(9, 0), { transport: 'telegram' })), false);
  assert.equal(isOwnerMessage(group, message('user', 'hi', at(9, 0))), true, 'typed in Cats');
  assert.equal(countUnansweredHeartbeats(lane([heartbeat('wake', at(7, 0)), heartbeat('bedtime', at(23, 0)), heartbeat('regular', at(9, 0))]), at(6, 0).getTime()), 2, 'a good night is not counted');

  const old = normalizeCompanionLifeProfile({ enabled: true, bedtime: '22:00' }, NOW_ISO);
  assert.equal(old.mode, 'auto', 'a profile written before SPEC-137 reads as auto');
  assert.equal(old.enabledAt, null);
  assert.equal(normalizeCompanionLifeProfile({ mode: 'bogus' }, NOW_ISO).mode, 'auto');
  assert.deepEqual(validateCompanionLifeUpdate(old, { mode: 'assist' }), { ok: true, update: { mode: 'assist' } });
  assert.equal(validateCompanionLifeUpdate(old, { mode: 'bogus' }).code, 'invalid_companion_life_mode');
  assert.equal(applyCompanionLifeProfilePatch(old, { mode: 'companion' }, NOW_ISO).enabledAt, null, 'only turning it on sets enabledAt');
});
