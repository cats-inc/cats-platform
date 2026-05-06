import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDispatchRuntimeContextMetadata,
} from '../src/products/chat/state/runtime-dispatch/context.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  appendMessage,
  createChannel,
  requireChannel,
} from '../src/products/chat/state/model/index.ts';
import { buildPromptForTarget } from '../src/products/chat/state/runtimeTargeting.ts';
import type { DispatchRequest } from '../src/products/chat/state/room-routing/runtime.ts';

function createDirectSlashModeDispatchRequest(): {
  state: ReturnType<typeof createDefaultChatState>;
  channelId: string;
  request: DispatchRequest;
} {
  const now = new Date('2026-05-06T08:00:00.000Z');
  let state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct code intake',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'ConciergeCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );
  const channelId = state.selectedChannelId;
  const channel = requireChannel(state, channelId);
  const assignment = channel.catAssignments[0];
  if (!assignment) {
    throw new Error('Expected direct Cat assignment.');
  }

  state = appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Cats',
      body: 'Code mode is active.',
    },
    new Date('2026-05-06T08:01:00.000Z'),
    {
      metadata: {
        directSlashMode: {
          activeAnchor: {
            workItemId: 'work-item-direct-intake-message-1',
            targetProduct: 'code',
            establishedBySegmentId: 'segment-product-intent-message-1',
            establishedAt: '2026-05-06T08:01:00.000Z',
          },
        },
      },
    },
  ).state;
  const userAppend = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Kenneth',
      body: 'Please implement the parser tests next.',
    },
    new Date('2026-05-06T08:02:00.000Z'),
    {
      metadata: {
        directSlashMode: {
          activeAnchor: {
            workItemId: 'work-item-direct-intake-message-1',
            targetProduct: 'code',
            establishedBySegmentId: 'segment-product-intent-message-1',
            establishedAt: '2026-05-06T08:01:00.000Z',
          },
        },
        directSlashModeIntakeRef: {
          workItemId: 'work-item-direct-intake-message-1',
          commandSegmentId: 'segment-product-intent-message-1',
          targetProduct: 'code',
        },
      },
    },
  );
  state = userAppend.state;

  const target = {
    participantKind: 'cat' as const,
    participantId: assignment.participantId,
    participantName: assignment.name,
    laneId: null,
    sessionId: 'runtime-session-direct-code',
  };

  return {
    state,
    channelId,
    request: {
      sourceMessage: userAppend.message,
      sourceParticipant: null,
      targets: [target],
      unresolved: [],
      mentionNames: [],
      trigger: 'room_default',
      depth: 0,
      turnId: 'turn-follow-up',
      target,
      dispatchId: 'dispatch-follow-up',
      targetStateId: 'target-follow-up',
      parentCheckpointId: null,
      branchStrategy: null,
      handoffReason: null,
    },
  };
}

test('direct slash-mode follow-up prompt carries Concierge protocol instructions', () => {
  const { state, channelId, request } = createDirectSlashModeDispatchRequest();

  const prompt = buildPromptForTarget(state, channelId, request);

  assert.match(prompt.instructions ?? '', /Direct slash-mode Code intake is active/u);
  assert.match(prompt.instructions ?? '', /work-item-direct-intake-message-1/u);
  assert.match(prompt.instructions ?? '', /ask one focal clarifying question/u);
  assert.match(prompt.instructions ?? '', /After three assistant clarification turns/u);
  assert.match(prompt.instructions ?? '', /Do not create a second Work Item anchor/u);
});

test('direct slash-mode follow-up runtime context carries anchor references', () => {
  const { request } = createDirectSlashModeDispatchRequest();

  const metadata = buildDispatchRuntimeContextMetadata(request);
  const intakeRef = metadata.directSlashModeIntakeRef as
    | { workItemId?: unknown; commandSegmentId?: unknown; targetProduct?: unknown }
    | undefined;

  assert.equal(intakeRef?.workItemId, 'work-item-direct-intake-message-1');
  assert.equal(intakeRef?.commandSegmentId, 'segment-product-intent-message-1');
  assert.equal(intakeRef?.targetProduct, 'code');
});
