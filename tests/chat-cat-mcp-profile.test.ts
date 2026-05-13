import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.js';
import {
  buildChannelView,
  createChannel,
  updateCatMcpProfile,
} from '../src/products/chat/state/model/index.js';
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
          provider: 'gemini',
          roles: ['planner'],
          skillProfile: 'companion',
          mcpProfile: 'chat-memory',
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
