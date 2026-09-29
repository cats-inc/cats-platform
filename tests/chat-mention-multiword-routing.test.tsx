import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createChannel } from '../src/products/chat/state/model/index.ts';
import { resolveMentionRoute } from '../src/products/chat/state/mentionRouter.ts';

function createRoom(names: string[]) {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Multi-word names',
      topic: 'Routing',
      originSurface: 'chat',
      roomMode: 'chat_channel',
      temporaryParticipants: names.map((name, index) => ({
        participantId: `participant-${index}`,
        name,
        provider: 'claude',
        instance: 'native',
        model: 'sonnet',
      })),
    },
    new Date('2026-09-29T00:00:00.000Z'),
  );
  return { state, channelId: state.channels[0]!.id };
}

test('a user mention reaches a Cat whose name contains a space', () => {
  const { state, channelId } = createRoom(['Builder Cat']);
  const route = resolveMentionRoute(state, channelId, '@Builder Cat 做一個計算機', {
    allowDefaultTarget: true,
    explicitTrigger: 'explicit_mention',
  });
  assert.equal(route.routingMode, 'explicit_single');
  assert.deepEqual(route.targets.map((target) => target.participantId), ['participant-0']);
  assert.deepEqual(route.unresolvedMentions, []);
});

test('an orchestrator hand-off reaches a Cat whose name contains a space', () => {
  const { state, channelId } = createRoom(['Builder Cat']);
  const route = resolveMentionRoute(
    state,
    channelId,
    '工作區是空的，交給 Builder Cat 開發。\n\n@Builder Cat 請在工作區建立一個網頁計算機。',
    { allowDefaultTarget: false, explicitTrigger: 'continuation_mention' },
  );
  assert.equal(route.trigger, 'continuation_mention');
  assert.deepEqual(route.targets.map((target) => target.participantId), ['participant-0']);
});

test('the longest room name wins and a shorter room name still resolves', () => {
  const { state, channelId } = createRoom(['Builder', 'Builder Cat']);
  const route = resolveMentionRoute(state, channelId, '@builder cat drafts it, then @Builder reviews.', {
    allowDefaultTarget: true,
    explicitTrigger: 'explicit_mention',
  });
  assert.equal(route.routingMode, 'explicit_multi');
  assert.deepEqual(route.targets.map((target) => target.participantId), ['participant-1', 'participant-0']);
});

test('a partial multi-word name stays unresolved', () => {
  const { state, channelId } = createRoom(['Builder Cat']);
  const route = resolveMentionRoute(state, channelId, '@Builder please look', {
    allowDefaultTarget: true,
    explicitTrigger: 'explicit_mention',
  });
  assert.deepEqual(route.targets, []);
  assert.deepEqual(route.unresolvedMentions, ['Builder']);
});
