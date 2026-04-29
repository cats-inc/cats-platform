import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildActiveAudienceParticipantKey,
  resolveActiveChannelAudienceState,
  resolveActiveChannelMessageMetadata,
} from '../src/products/shared/renderer/composerMessageMetadata.ts';

test('workspace metadata reuses the latest group audience metadata for cat-backed rooms', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'multi_cat_room',
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          metadata: {
            recipientParticipantIds: ['cat-claude', 'cat-codex'],
            workflowShape: 'sequential',
          },
        },
      ],
      assignedCats: [
        {
          catId: 'cat-claude',
          status: 'active',
        },
        {
          catId: 'cat-codex',
          status: 'active',
        },
      ],
      roomRouting: {
        workflow: {
          activeTurn: null,
          turnHistory: [],
        },
      },
    } as never,
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['cat-claude', 'cat-codex'],
    workflowShape: 'sequential',
  });
});

test('workspace metadata falls back to the active cat roster when the latest send had no explicit audience', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'multi_cat_room',
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          metadata: {
            workflowShape: 'parallel',
          },
        },
      ],
      assignedCats: [
        {
          catId: 'cat-claude',
          status: 'active',
        },
        {
          catId: 'cat-codex',
          status: 'active',
        },
      ],
      roomRouting: {
        workflow: {
          activeTurn: null,
          turnHistory: [],
        },
      },
    } as never,
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['cat-claude', 'cat-codex'],
    workflowShape: 'parallel',
  });
});

test('workspace metadata honors the current audience chip order and explicit concurrent override', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: {
      channelKind: 'multi_cat_room',
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          metadata: {
            recipientParticipantIds: ['cat-claude', 'cat-codex'],
            workflowShape: 'sequential',
          },
        },
      ],
      assignedCats: [
        {
          catId: 'cat-claude',
          status: 'active',
        },
        {
          catId: 'cat-codex',
          status: 'active',
        },
      ],
      roomRouting: {
        workflow: {
          activeTurn: null,
          turnHistory: [],
        },
      },
    } as never,
    audienceKeys: [
      buildActiveAudienceParticipantKey('cat-codex'),
      buildActiveAudienceParticipantKey('cat-claude'),
    ],
    workflowShape: 'concurrent',
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['cat-codex', 'cat-claude'],
    workflowShape: 'concurrent',
  });
});

test('workspace audience state restores chip ordering while collapsing unsupported workflow shapes', () => {
  const audienceState = resolveActiveChannelAudienceState({
    selectedChannel: {
      channelKind: 'multi_cat_room',
      messages: [
        {
          id: 'message-user-1',
          senderKind: 'user',
          metadata: {
            recipientParticipantIds: ['cat-codex', 'cat-claude'],
            workflowShape: 'parallel',
          },
        },
      ],
      assignedCats: [
        {
          catId: 'cat-claude',
          status: 'active',
        },
        {
          catId: 'cat-codex',
          status: 'active',
        },
      ],
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
      buildActiveAudienceParticipantKey('cat-codex'),
      buildActiveAudienceParticipantKey('cat-claude'),
    ],
    workflowShape: 'sequential',
  });
});
