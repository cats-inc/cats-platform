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
  resolveChannelCanonicalIdentity,
} from '../src/products/chat/state/model/index.ts';
import { buildPromptForTarget } from '../src/products/chat/state/runtimeTargeting.ts';
import type { DispatchRequest } from '../src/products/chat/state/room-routing/runtime.ts';
import {
  createDefaultCoreState,
  upsertCoreConversation,
  upsertCoreWorkItem,
} from '../src/core/model/index.ts';
import type { CatsCoreState } from '../src/core/types.ts';

function createDirectSlashModeDispatchRequest(): {
  state: ReturnType<typeof createDefaultChatState>;
  channelId: string;
  request: DispatchRequest;
  core: CatsCoreState;
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
        productIntentLocale: 'zh-TW',
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
  const { conversationId } = resolveChannelCanonicalIdentity(state, channelId);
  let core = createDefaultCoreState();
  core = upsertCoreConversation(
    core,
    {
      id: conversationId,
      title: 'Direct code intake',
      kind: 'direct_message',
      status: 'active',
      sourceChannelId: channelId,
      responseLanguage: 'en',
    },
    now,
  ).core;
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-direct-intake-message-1',
      title: 'Parser tests',
      status: 'draft',
      conversationId,
      metadata: {
        directSlashModeIntake: {
          version: 1,
          targetProduct: 'code',
          source: {
            channelId,
            conversationId,
            commandTurnId: 'turn-product-intent-message-1',
            commandLaneId: 'lane-product-intent-message-1',
            commandSegmentId: 'segment-product-intent-message-1',
            transport: 'web',
          },
        },
      },
    },
    now,
  ).core;

  return {
    state,
    channelId,
    core,
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
  const { state, channelId, request, core } = createDirectSlashModeDispatchRequest();

  const prompt = buildPromptForTarget(state, channelId, request, undefined, core);

  assert.match(prompt.instructions ?? '', /Reply in Traditional Chinese/u);
  assert.match(prompt.instructions ?? '', /Direct slash-mode Code intake is active/u);
  assert.match(prompt.instructions ?? '', /work-item-direct-intake-message-1/u);
  assert.match(prompt.instructions ?? '', /ask one focal clarifying question/u);
  assert.match(prompt.instructions ?? '', /After three assistant clarification turns/u);
  assert.match(prompt.instructions ?? '', /Do not create a second Work Item anchor/u);
});

test('direct slash-mode follow-up prompt ignores stale anchors from another conversation', () => {
  const { state, channelId, request, core } = createDirectSlashModeDispatchRequest();
  const staleCore = {
    ...core,
    workItems: core.workItems.map((workItem) =>
      workItem.id === 'work-item-direct-intake-message-1'
        ? { ...workItem, conversationId: 'conversation-other-direct-lane' }
        : workItem),
  };

  const prompt = buildPromptForTarget(state, channelId, request, undefined, staleCore);

  assert.doesNotMatch(prompt.instructions ?? '', /Direct slash-mode Code intake is active/u);
  assert.doesNotMatch(prompt.instructions ?? '', /work-item-direct-intake-message-1/u);
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
