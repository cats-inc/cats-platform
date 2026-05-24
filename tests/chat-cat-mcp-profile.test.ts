import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.js';
import {
  buildChannelView,
  createChannel,
  updateGlobalOrchestrator,
  updateCatMcpProfile,
} from '../src/products/chat/state/model/index.js';
import { CHAT_MCP_PROFILE_ID } from '../src/shared/catMcpProfiles.js';
import { WORK_MCP_PROFILE_ID } from '../src/products/work/shared/workToolIntent.js';

test('Cat MCP profile updates flow into assigned channel views', () => {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'MCP Profile Channel',
      topic: 'Validate Cat MCP profile projection.',
      originSurface: 'chat',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Planner Cat',
          provider: 'antigravity',
          roles: ['planner'],
          skillProfile: 'companion',
          mcpProfile: CHAT_MCP_PROFILE_ID,
        },
      ],
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const channelId = state.selectedChannelId;
  assert.ok(channelId);
  const catId = buildChannelView(state, channelId).assignedCats[0]?.catId;
  assert.ok(catId);

  state = updateCatMcpProfile(state, catId, WORK_MCP_PROFILE_ID);

  const channel = buildChannelView(state, channelId);
  assert.equal(channel.assignedCats[0]?.mcpProfile, WORK_MCP_PROFILE_ID);
  assert.equal(state.cats.find((cat) => cat.id === catId)?.mcpProfile, WORK_MCP_PROFILE_ID);
});

test('Cat MCP profile updates reject unsupported product profile ids', () => {
  let state = createDefaultChatState();
  state = createChannel(
    state,
    {
      title: 'MCP Profile Guard',
      topic: 'Reject unsupported Cat MCP profile ids.',
      originSurface: 'chat',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'Guarded Cat',
          provider: 'antigravity',
          roles: ['planner'],
        },
      ],
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );
  const channelId = state.selectedChannelId;
  assert.ok(channelId);
  const catId = buildChannelView(state, channelId).assignedCats[0]?.catId;
  assert.ok(catId);

  assert.throws(
    () => updateCatMcpProfile(state, catId, 'unknown-profile'),
    /Unsupported Cat MCP profile: unknown-profile/u,
  );
});

test('Cat creation rejects unsupported MCP profile ids', () => {
  assert.throws(
    () => createChannel(
      createDefaultChatState(),
      {
        title: 'MCP Profile Create Guard',
        topic: 'Reject unsupported Cat MCP profile ids during creation.',
        originSurface: 'chat',
        roomMode: 'direct_message',
        cats: [
          {
            name: 'Bad Profile Cat',
            provider: 'antigravity',
            mcpProfile: 'unknown-profile',
          },
        ],
      },
      new Date('2026-05-13T00:00:00.000Z'),
    ),
    /Unsupported Cat MCP profile: unknown-profile/u,
  );
});

test('Channel creation rejects unsupported MCP profile ids', () => {
  assert.throws(
    () => createChannel(
      createDefaultChatState(),
      {
        title: 'Channel MCP Profile Guard',
        topic: 'Reject unsupported channel MCP profile ids.',
        originSurface: 'chat',
        roomMode: 'direct_message',
        mcpProfile: 'unknown-profile',
      },
      new Date('2026-05-13T00:00:00.000Z'),
    ),
    /Unsupported Cat MCP profile: unknown-profile/u,
  );
});

test('Global orchestrator MCP profile updates can patch only the tool profile', () => {
  const state = createDefaultChatState();
  const updated = updateGlobalOrchestrator(
    state,
    {
      mcpProfile: WORK_MCP_PROFILE_ID,
    },
    new Date('2026-05-13T00:00:00.000Z'),
  );

  assert.equal(updated.globalOrchestrator.mcpProfile, WORK_MCP_PROFILE_ID);
  assert.equal(
    updated.globalOrchestrator.executionTarget.provider,
    state.globalOrchestrator.executionTarget.provider,
  );
  assert.equal(updated.globalOrchestrator.skillProfile, state.globalOrchestrator.skillProfile);
});

test('Global orchestrator updates reject unsupported MCP profile ids', () => {
  assert.throws(
    () => updateGlobalOrchestrator(
      createDefaultChatState(),
      {
        provider: 'claude',
        mcpProfile: 'unknown-profile',
      },
      new Date('2026-05-13T00:00:00.000Z'),
    ),
    /Unsupported Cat MCP profile: unknown-profile/u,
  );
});
