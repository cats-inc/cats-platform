import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createChannel,
  updateChannelParticipant,
} from '../build/server/products/chat/state/model/index.js';

const NOW = new Date('2026-09-05T10:00:00.000Z');

function createRoom() {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Review room',
      topic: 'Two participants with their own targets.',
      originSurface: 'chat',
      temporaryParticipants: [
        {
          participantId: 'participant-lead',
          name: 'Lead Reviewer',
          provider: 'claude',
          instance: 'native',
          model: 'opus',
          roleHint: 'Lead',
        },
        {
          participantId: 'participant-counter',
          name: 'Counter Reviewer',
          provider: 'antigravity',
          instance: 'native',
          model: 'antigravity-default',
          roleHint: 'Counterpoint',
        },
      ],
    },
    NOW,
  );
  return { state, channelId: state.selectedChannelId };
}

function assignment(state, channelId, participantId) {
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel, 'channel exists');
  const found = channel.participantAssignments?.find(
    (candidate) => candidate.participantId === participantId,
  );
  assert.ok(found, `assignment for ${participantId}`);
  return found;
}

test('a participant update with target fields writes this conversation\'s own target', () => {
  const { state, channelId } = createRoom();

  const next = updateChannelParticipant(
    state,
    channelId,
    'participant-lead',
    {
      provider: 'codex',
      instance: 'native',
      model: 'gpt-5.6-sol',
      modelSelection: { entryId: 'gpt-5.6-sol', entryMode: 'explicit' },
    },
    NOW,
  );

  const lead = assignment(next, channelId, 'participant-lead');
  assert.equal(lead.execution.target.provider, 'codex');
  assert.equal(lead.execution.target.instance, 'native');
  assert.equal(lead.execution.target.model, 'gpt-5.6-sol');
  assert.deepEqual(lead.execution.modelSelection, { entryId: 'gpt-5.6-sol', entryMode: 'explicit' });
  // Only the addressed participant changes; the room's other target is untouched.
  const counter = assignment(next, channelId, 'participant-counter');
  assert.equal(counter.execution.target.provider, 'antigravity');
  assert.equal(counter.execution.target.model, 'antigravity-default');
  // The input state is not mutated.
  assert.equal(assignment(state, channelId, 'participant-lead').execution.target.provider, 'claude');
});

test('a rename-only update leaves the conversation target alone', () => {
  const { state, channelId } = createRoom();

  const next = updateChannelParticipant(
    state,
    channelId,
    'participant-lead',
    { name: 'Renamed Lead' },
    NOW,
  );

  const lead = assignment(next, channelId, 'participant-lead');
  assert.equal(lead.execution.target.provider, 'claude');
  assert.equal(lead.execution.target.model, 'opus');
});

test('a participant update with no fields is a no-op', () => {
  const { state, channelId } = createRoom();
  const next = updateChannelParticipant(state, channelId, 'participant-lead', {}, NOW);
  assert.deepEqual(
    assignment(next, channelId, 'participant-lead').execution,
    assignment(state, channelId, 'participant-lead').execution,
  );
});

test('a target update for an unknown participant fails instead of writing elsewhere', () => {
  const { state, channelId } = createRoom();
  assert.throws(
    () => updateChannelParticipant(state, channelId, 'participant-missing', { provider: 'codex' }, NOW),
    /participant/i,
  );
});
