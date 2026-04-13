import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveActiveChannelMessageMetadata } from '../src/products/chat/renderer/composerMessageMetadata.ts';

test('resolveActiveChannelMessageMetadata reuses the latest active group audience metadata', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'multi_cat_room',
      composerMode: 'cat_led',
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          metadata: {
            recipientParticipantIds: ['participant-claude', 'participant-codex'],
            workflowShape: 'sequential',
          },
        },
      ],
      assignedParticipants: [
        {
          participantId: 'participant-claude',
          status: 'active',
        },
        {
          participantId: 'participant-codex',
          status: 'active',
        },
      ],
      assignedCats: [],
      roomRouting: {
        workflow: {
          activeTurn: null,
          turnHistory: [],
        },
      },
    } as never,
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['participant-claude', 'participant-codex'],
    workflowShape: 'sequential',
  });
});

test('resolveActiveChannelMessageMetadata falls back to all active room participants for follow-up sends', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'multi_cat_room',
      composerMode: 'cat_led',
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          metadata: {},
        },
      ],
      assignedParticipants: [
        {
          participantId: 'participant-claude',
          status: 'active',
        },
        {
          participantId: 'participant-codex',
          status: 'active',
        },
      ],
      assignedCats: [],
      roomRouting: {
        workflow: {
          activeTurn: null,
          turnHistory: [
            {
              workflowShape: 'sequential',
            },
          ],
        },
      },
    } as never,
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['participant-claude', 'participant-codex'],
    workflowShape: 'sequential',
  });
});

test('resolveActiveChannelMessageMetadata stays off for solo and direct lanes', () => {
  const soloMetadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'boss_thread',
      composerMode: 'solo',
      messages: [],
      assignedParticipants: [],
      assignedCats: [],
      roomRouting: {
        mode: 'boss_chat',
        workflow: {
          activeTurn: null,
          turnHistory: [],
        },
      },
    } as never,
  });
  const directMetadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'direct_lane',
      composerMode: 'cat_led',
      messages: [],
      assignedParticipants: [
        {
          participantId: 'participant-claude',
          status: 'active',
        },
      ],
      assignedCats: [],
      roomRouting: {
        mode: 'direct_cat_chat',
        workflow: {
          activeTurn: null,
          turnHistory: [],
        },
      },
    } as never,
  });

  assert.equal(soloMetadata, null);
  assert.equal(directMetadata, null);
});
