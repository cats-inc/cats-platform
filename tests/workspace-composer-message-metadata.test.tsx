import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildActiveAudienceParticipantKey,
  resolveActiveChannelAudienceState,
  resolveActiveChannelMessageMetadata,
} from '../src/products/shared/renderer/composerMessageMetadata.ts';

type ParticipantFixture = { participantId: string; sourceKind: 'cat' | 'adhoc'; catId?: string };

const claude: ParticipantFixture = { participantId: 'cat-claude', sourceKind: 'cat', catId: 'cat-claude' };
const codex: ParticipantFixture = { participantId: 'cat-codex', sourceKind: 'cat', catId: 'cat-codex' };
const aria: ParticipantFixture = { participantId: 'participant-aria', sourceKind: 'adhoc' };
const bram: ParticipantFixture = { participantId: 'participant-bram', sourceKind: 'adhoc' };

// Deliberately partial: the resolver reads only the topology, the active
// participants, the latest user message and the room workflow.
function channel(input: {
  participants: ParticipantFixture[];
  latestUserMetadata?: Record<string, unknown>;
  channelKind?: 'chat_channel' | 'direct_message';
}): never {
  const assigned = input.participants.map((participant) => ({ ...participant, status: 'active' }));
  return {
    channelKind: input.channelKind ?? 'chat_channel',
    messages: input.latestUserMetadata
      ? [{ id: 'message-user-1', senderKind: 'user', metadata: input.latestUserMetadata }]
      : [],
    assignedParticipants: assigned,
    assignedCats: assigned.filter((participant) => participant.sourceKind === 'cat'),
    roomRouting: {
      mode: input.channelKind ?? 'chat_channel',
      workflow: { activeTurn: null, turnHistory: [] },
    },
  } as never;
}

test('workspace metadata reuses the latest audience', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: channel({
      participants: [claude, codex],
      latestUserMetadata: { recipientParticipantIds: ['cat-claude', 'cat-codex'], workflowShape: 'sequential' },
    }),
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['cat-claude', 'cat-codex'],
    workflowShape: 'sequential',
  });
});

test('workspace metadata falls back to every active participant when the latest send named none', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: channel({
      participants: [claude, aria],
      latestUserMetadata: { workflowShape: 'parallel' },
    }),
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['cat-claude', 'participant-aria'],
    workflowShape: 'parallel',
  });
});

test('workspace metadata honors the audience chip order and an explicit concurrent override', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: channel({
      participants: [claude, codex],
      latestUserMetadata: { recipientParticipantIds: ['cat-claude', 'cat-codex'], workflowShape: 'sequential' },
    }),
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

test('workspace metadata sends the temporary participants the chip picks', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: channel({ participants: [aria, bram] }),
    audienceKeys: [buildActiveAudienceParticipantKey('participant-bram')],
    workflowShape: 'sequential',
  });

  assert.deepEqual(metadata, {
    recipientParticipantIds: ['participant-bram'],
    workflowShape: 'sequential',
  });
});

test('workspace metadata names the only participant of a one-participant room', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: channel({ participants: [aria] }),
  });

  assert.deepEqual(metadata, { recipientParticipantIds: ['participant-aria'] });
});

test('workspace metadata keeps a pick beyond the default audience size', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: channel({ participants: [claude, codex, aria, bram] }),
    maxAudienceParticipants: 3,
    audienceKeys: [buildActiveAudienceParticipantKey('participant-bram')],
  });
  const untouched = resolveActiveChannelMessageMetadata({
    selectedChannel: channel({ participants: [claude, codex, aria, bram] }),
    maxAudienceParticipants: 3,
  });

  assert.deepEqual(metadata?.recipientParticipantIds, ['participant-bram']);
  assert.deepEqual(untouched?.recipientParticipantIds, ['cat-claude', 'cat-codex', 'participant-aria']);
});

test('workspace metadata stays off for direct messages', () => {
  const metadata = resolveActiveChannelMessageMetadata({
    selectedChannel: channel({ participants: [claude], channelKind: 'direct_message' }),
  });

  assert.equal(metadata, null);
});

test('workspace audience state restores chip ordering while collapsing unsupported workflow shapes', () => {
  const audienceState = resolveActiveChannelAudienceState({
    selectedChannel: channel({
      participants: [claude, codex],
      latestUserMetadata: { recipientParticipantIds: ['cat-codex', 'cat-claude'], workflowShape: 'parallel' },
    }),
  });

  assert.deepEqual(audienceState, {
    audienceKeys: [
      buildActiveAudienceParticipantKey('cat-codex'),
      buildActiveAudienceParticipantKey('cat-claude'),
    ],
    workflowShape: 'sequential',
  });
});
