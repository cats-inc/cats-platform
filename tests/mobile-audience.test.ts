import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMobileSendInput,
  resolveMobileRecipientIds,
  selectMobileAudience,
  toggleMobileAudienceSelection,
  type MobileChannelDetail,
} from '../src/mobile/index.ts';

function participant(participantId: string, status: 'active' | 'removed' = 'active') {
  return { participantId, name: participantId, status, avatarColor: null };
}

const room: MobileChannelDetail = {
  id: 'room',
  channelKind: 'chat_channel',
  assignedParticipants: [participant('milo'), participant('aria'), participant('gone', 'removed')],
};

test('a mobile send to a room names every active participant until the user narrows it', () => {
  const audience = selectMobileAudience(room);

  assert.equal(audience.direct, false);
  assert.deepEqual(resolveMobileRecipientIds(audience, null), ['milo', 'aria']);
  assert.deepEqual(buildMobileSendInput('hi', resolveMobileRecipientIds(audience, null)), {
    body: 'hi',
    messageMetadata: { recipientParticipantIds: ['milo', 'aria'] },
  });
});

test('the mobile audience toggles in room order and always keeps one participant', () => {
  const audience = selectMobileAudience(room);
  const onlyAria = toggleMobileAudienceSelection(audience, null, 'milo');

  assert.deepEqual(onlyAria, ['aria']);
  assert.deepEqual(toggleMobileAudienceSelection(audience, onlyAria, 'aria'), ['aria']);
  assert.deepEqual(toggleMobileAudienceSelection(audience, onlyAria, 'milo'), ['milo', 'aria']);
});

test('a mobile DM sends no audience: it goes to its cat', () => {
  const audience = selectMobileAudience({ ...room, channelKind: 'direct_message' });

  assert.equal(audience.direct, true);
  assert.deepEqual(resolveMobileRecipientIds(audience, ['milo']), []);
  assert.deepEqual(buildMobileSendInput('hi', []), { body: 'hi' });
});
