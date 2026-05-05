import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildActiveAudienceParticipantKey,
  resolveActiveChannelAudienceState,
  resolveActiveChannelMessageMetadata,
  resolveProductIntentCommandMessageMetadata,
} from '../src/products/chat/renderer/composerMessageMetadata.ts';

test('resolveActiveChannelMessageMetadata reuses the latest active group audience metadata', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'chat_channel',
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
      channelKind: 'chat_channel',
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

test('resolveActiveChannelMessageMetadata stays off for default and direct lanes', () => {
  const soloMetadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'chat_channel',
      messages: [],
      assignedParticipants: [],
      assignedCats: [],
      roomRouting: {
        mode: 'chat_channel',
        workflow: {
          activeTurn: null,
          turnHistory: [],
        },
      },
    } as never,
  });
  const directMetadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'direct_message',
      messages: [],
      assignedParticipants: [
        {
          participantId: 'participant-claude',
          status: 'active',
        },
      ],
      assignedCats: [],
      roomRouting: {
        mode: 'direct_message',
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

test('resolveActiveChannelMessageMetadata honors the current active-room audience chip order', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'chat_channel',
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
    audienceKeys: [
      buildActiveAudienceParticipantKey('participant-codex'),
      buildActiveAudienceParticipantKey('participant-claude'),
    ],
    workflowShape: 'concurrent',
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['participant-codex', 'participant-claude'],
    workflowShape: 'concurrent',
  });
});

test('resolveActiveChannelAudienceState restores the active-room chip order from the latest user metadata', () => {
  const audienceState = resolveActiveChannelAudienceState({
    selectedChannel: {
      channelKind: 'chat_channel',
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          metadata: {
            recipientParticipantIds: ['participant-codex', 'participant-claude'],
            workflowShape: 'concurrent',
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

  assert.deepEqual(audienceState, {
    audienceKeys: [
      buildActiveAudienceParticipantKey('participant-codex'),
      buildActiveAudienceParticipantKey('participant-claude'),
    ],
    workflowShape: 'concurrent',
  });
});

test('resolveProductIntentCommandMessageMetadata tags web product intent commands', () => {
  const metadata = resolveProductIntentCommandMessageMetadata('/work clarify MVP scope', 'web');

  assert.deepEqual(metadata, {
    productIntentCommand: {
      version: 1,
      source: 'web',
      command: 'work',
      posture: 'work',
      targetProduct: 'work',
      argumentText: 'clarify MVP scope',
      rawCommandToken: 'work',
      botSuffix: null,
    },
  });
});

test('resolveProductIntentCommandMessageMetadata ignores non-product slash commands', () => {
  assert.equal(resolveProductIntentCommandMessageMetadata('/help', 'web'), null);
});
