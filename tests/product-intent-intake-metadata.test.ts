import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDirectProductPresetIntentContext,
  buildProductPresetIntentContext,
} from '../src/products/chat/shared/productPresetIntentContext.js';
import {
  buildProductIntentActiveAnchorMetadata,
  buildProductIntentActiveAnchorSourceContextRef,
  buildProductIntentIntakeMetadata,
  doesProductIntentActiveAnchorMatchIntake,
  doesProductIntentActiveAnchorMatchSourceContext,
} from '../src/products/chat/shared/productIntentIntakeMetadata.js';

test('product intent intake metadata normalizes durable command and draft fields', () => {
  const sourceContext = buildDirectProductPresetIntentContext({
    channelId: 'channel-direct',
    conversationId: 'conversation-direct',
    turnId: 'turn-1',
    segmentId: 'segment-1',
    originSurface: 'desktop',
    transport: 'web',
  });

  const metadata = buildProductIntentIntakeMetadata({
    targetProduct: 'work',
    sourceContext,
    command: {
      sourceKind: 'explicit_command',
      name: 'work',
      argumentText: ' build the MVP ',
      rawCommandToken: '/work',
    },
    draft: {
      goal: ' ship a focused MVP ',
      successCriteria: [' usable direct intake ', ''],
      outOfScope: [' unrelated chat rewrite '],
      openQuestions: [' owner approval? '],
      proposedNextAction: 'create_task',
    },
  });

  assert.equal(metadata.version, 1);
  assert.equal(metadata.command.argumentText, 'build the MVP');
  assert.equal(metadata.draft.goal, 'ship a focused MVP');
  assert.deepEqual(metadata.draft.successCriteria, ['usable direct intake']);
  assert.deepEqual(metadata.draft.outOfScope, ['unrelated chat rewrite']);
  assert.deepEqual(metadata.draft.openQuestions, ['owner approval?']);
});

test('product intent active anchor stores only stable source identity fields', () => {
  const sourceContext = buildProductPresetIntentContext({
    sourceProduct: 'chat',
    presetId: 'parallel_chat',
    source: {
      containerId: 'container-1',
      branchId: 'branch-1',
      conversationId: 'branch-conversation-1',
      turnId: 'turn-1',
      segmentId: 'segment-1',
    },
    originSurface: 'telegram',
    transport: 'telegram',
  });

  assert.deepEqual(buildProductIntentActiveAnchorSourceContextRef(sourceContext), {
    sourceProduct: 'chat',
    presetId: 'parallel_chat',
    containerId: 'container-1',
    branchId: 'branch-1',
    conversationId: 'branch-conversation-1',
  });

  const anchor = buildProductIntentActiveAnchorMetadata({
    workItemId: ' work-item-1 ',
    targetProduct: 'code',
    sourceContext,
    establishedAt: '2026-05-09T00:00:00.000Z',
  });

  assert.deepEqual(anchor, {
    version: 1,
    workItemId: 'work-item-1',
    targetProduct: 'code',
    sourceContextRef: {
      sourceProduct: 'chat',
      presetId: 'parallel_chat',
      containerId: 'container-1',
      branchId: 'branch-1',
      conversationId: 'branch-conversation-1',
    },
    establishedBySegmentId: 'segment-1',
    establishedAt: '2026-05-09T00:00:00.000Z',
  });
});

test('product intent active anchor matching ignores transport and turn identity', () => {
  const sourceContext = buildDirectProductPresetIntentContext({
    channelId: 'channel-direct',
    conversationId: 'conversation-direct',
    turnId: 'turn-1',
    segmentId: 'segment-1',
    originSurface: 'desktop',
    transport: 'web',
  });
  const anchor = buildProductIntentActiveAnchorMetadata({
    workItemId: 'work-item-1',
    targetProduct: 'work',
    sourceContext,
    establishedAt: '2026-05-09T00:00:00.000Z',
  });
  const sameRoutingContext = buildDirectProductPresetIntentContext({
    channelId: 'channel-direct',
    conversationId: 'conversation-direct',
    turnId: 'turn-2',
    segmentId: 'segment-2',
    originSurface: 'telegram',
    transport: 'telegram',
  });

  assert.equal(
    doesProductIntentActiveAnchorMatchSourceContext(anchor, sameRoutingContext),
    true,
  );
});

test('product intent active anchor matching invalidates moved source identity', () => {
  const sourceContext = buildDirectProductPresetIntentContext({
    channelId: 'channel-direct',
    conversationId: 'conversation-direct',
    turnId: 'turn-1',
    segmentId: 'segment-1',
    originSurface: 'desktop',
    transport: 'web',
  });
  const anchor = buildProductIntentActiveAnchorMetadata({
    workItemId: 'work-item-1',
    targetProduct: 'work',
    sourceContext,
    establishedAt: '2026-05-09T00:00:00.000Z',
  });
  const movedContext = buildDirectProductPresetIntentContext({
    channelId: 'channel-moved',
    conversationId: 'conversation-direct',
    turnId: 'turn-2',
    segmentId: 'segment-2',
    originSurface: 'desktop',
    transport: 'web',
  });
  const intake = buildProductIntentIntakeMetadata({
    targetProduct: 'code',
    sourceContext,
    command: {
      sourceKind: 'explicit_command',
      name: 'code',
      argumentText: '',
      rawCommandToken: '/code',
    },
    draft: {
      goal: 'prepare code task',
      successCriteria: [],
      outOfScope: [],
      openQuestions: [],
      proposedNextAction: 'create_task',
    },
  });

  assert.equal(doesProductIntentActiveAnchorMatchSourceContext(anchor, movedContext), false);
  assert.equal(doesProductIntentActiveAnchorMatchIntake(anchor, intake), false);
});
