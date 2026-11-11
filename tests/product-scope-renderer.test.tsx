import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  buildChannelView,
  createChannel,
  raiseChannelProductScope,
  toChannelSummary,
} from '../src/products/chat/state/model/index.ts';
import type {
  AppShellPayload,
  ChatChannelSummary,
  ChatChannelView,
} from '../src/products/shared/api/workspaceContracts.ts';
import { mergeChannelSummaryWithChannelView } from '../src/products/shared/renderer/activeEntityMerge.ts';
import { insertCreatedChannelIntoPayload } from '../src/products/shared/renderer/workspaceChatUtils.tsx';

// SPEC-141 FR-6: the two places where Desktop rebuilds a conversation summary field by field
// keep the product scope beside the origin.

const NOW = new Date('2026-11-11T00:00:00.000Z');
const LATER = new Date('2026-11-11T01:00:00.000Z');

function createCodeConversation() {
  const state = createChannel(
    createDefaultChatState(),
    { title: 'Tomato timer', topic: 'Build a tomato timer.', originSurface: 'code' },
    NOW,
  );
  return { state, channelId: state.selectedChannelId };
}

function emptyPayload(): AppShellPayload {
  return {
    metadata: { generatedAt: NOW.toISOString(), requestId: 'test-request', version: 'test' },
    chat: { channels: [], selectedChannelId: null, selectedChannel: null },
  } as unknown as AppShellPayload;
}

test('a created conversation enters the list with its origin and its product scope', () => {
  const { state, channelId } = createCodeConversation();
  const view = buildChannelView(state, channelId) as ChatChannelView;

  const next = insertCreatedChannelIntoPayload(emptyPayload(), view);

  assert.equal(next.chat.channels[0]?.id, channelId);
  assert.equal(next.chat.channels[0]?.originSurface, 'code');
  assert.equal(next.chat.channels[0]?.productScope, 'code');
  assert.equal(next.chat.selectedChannel?.productScope, 'code');
});

test('the open conversation updates its list entry with the scope it now has', () => {
  const { state, channelId } = createCodeConversation();
  const channel = state.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channel);
  const listed = toChannelSummary(channel, state) as ChatChannelSummary;
  assert.equal(listed.productScope, 'code');

  const raised = raiseChannelProductScope(state, channelId, 'work', LATER);
  const raisedView = buildChannelView(raised, channelId) as ChatChannelView;

  const merged = mergeChannelSummaryWithChannelView(listed, raisedView);
  assert.equal(merged.originSurface, 'code');
  assert.equal(merged.productScope, 'work');

  // A view without the field, as an older server would send, leaves the listed value alone.
  const { productScope: _dropped, ...viewWithoutScope } = raisedView;
  const kept = mergeChannelSummaryWithChannelView(listed, viewWithoutScope as ChatChannelView);
  assert.equal(kept.productScope, 'code');
});
