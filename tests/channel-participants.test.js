import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  buildChannelView,
  createChannel,
  toChannelSummary,
} from '../build/server/products/chat/state/model/index.js';
import { FileChatStore } from '../build/server/products/chat/state/store.js';

test('createChannel keeps channel-only temporary participants outside cat assignments', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Ad hoc review room',
      topic: 'Compare two model specialists without creating Cats first.',
      temporaryParticipants: [
        {
          participantId: 'participant-lead',
          name: 'Lead Reviewer',
          provider: 'claude',
          instance: 'native',
          model: 'claude-opus-4-6',
          roleHint: 'Lead',
        },
        {
          participantId: 'participant-counter',
          name: 'Counter Reviewer',
          provider: 'gemini',
          instance: 'native',
          model: 'gemini-3.1-pro',
          roleHint: 'Counterpoint',
        },
      ],
    },
    new Date('2026-04-07T10:00:00.000Z'),
  );

  const channelId = state.selectedChannelId;
  const persistedChannel = state.channels.find((channel) => channel.id === channelId);
  assert.ok(persistedChannel);
  assert.deepEqual(
    persistedChannel.catAssignments,
    [],
  );
  assert.equal(persistedChannel.participantAssignments?.length, 2);
  assert.equal(persistedChannel.roomRouting?.defaultRecipientId, 'participant-lead');

  const channelView = buildChannelView(state, channelId);
  assert.equal(channelView.assignedParticipants?.length, 2);
  assert.equal(channelView.assignedCats.length, 0);
  assert.equal(channelView.assignedParticipants?.[0]?.participantId, 'participant-lead');
  assert.equal(channelView.assignedParticipants?.[0]?.sourceKind, 'adhoc');
  assert.equal(channelView.assignedParticipants?.[0]?.roleHint, 'Lead');

  const summary = toChannelSummary(persistedChannel);
  assert.equal(summary.channelKind, 'multi_cat_room');
  assert.equal(summary.catCount, 2);
  assert.equal(summary.activeCatCount, 2);
  assert.equal(summary.participantCount, 2);
  assert.equal(summary.activeParticipantCount, 2);
  assert.equal(summary.defaultRecipientCatId, null);
});

test('FileChatStore round-trips temporary participants through persisted snapshots', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-participants-'));
  const statePath = path.join(tempDir, 'chat-state.json');
  const store = new FileChatStore(statePath);

  const state = createChannel(
    await store.read(),
    {
      title: 'Ad hoc room',
      topic: 'Persist channel-only participants.',
      temporaryParticipants: [
        {
          participantId: 'participant-inline',
          name: 'Inline Specialist',
          provider: 'codex',
          instance: 'native',
          model: 'gpt-5.3-codex',
          roleHint: 'Inline only',
        },
      ],
    },
    new Date('2026-04-07T11:00:00.000Z'),
  );
  await store.write(state);

  const reloaded = await store.read();
  const channelView = buildChannelView(reloaded, reloaded.selectedChannelId);

  assert.equal(channelView.participantAssignments?.length, 1);
  assert.equal(channelView.assignedParticipants?.length, 1);
  assert.equal(channelView.assignedParticipants?.[0]?.name, 'Inline Specialist');
  assert.equal(channelView.assignedParticipants?.[0]?.execution.target.provider, 'codex');
  assert.equal(channelView.assignedParticipants?.[0]?.execution.target.model, 'gpt-5.3-codex');
  assert.equal(channelView.roomRouting.defaultRecipientId, 'participant-inline');
  assert.deepEqual(channelView.assignedCats, []);
});

test('createChannel auto-names temporary participants when the draft omits names', () => {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Auto-named room',
      topic: 'Auto-name ad hoc participants from provider labels.',
      temporaryParticipants: [
        {
          participantId: 'participant-claude-1',
          provider: 'claude',
        },
        {
          participantId: 'participant-claude-2',
          provider: 'claude',
        },
      ],
    },
    new Date('2026-04-08T00:00:00.000Z'),
  );

  const channelView = buildChannelView(state, state.selectedChannelId);
  assert.equal(channelView.assignedParticipants?.[0]?.name, 'Claude');
  assert.equal(channelView.assignedParticipants?.[1]?.name, 'Claude 2');
});
