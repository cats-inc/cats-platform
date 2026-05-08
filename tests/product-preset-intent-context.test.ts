import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRODUCT_PRESET_INTENT_PRESET_IDS,
  buildDirectProductPresetIntentContext,
  buildProductPresetIntentContext,
  isContainerBackedProductPresetIntentPreset,
  listRequiredProductPresetIntentSourceFields,
  validateProductPresetIntentContext,
} from '../src/products/chat/shared/productPresetIntentContext.js';

test('product preset intent context exposes canonical preset ids', () => {
  assert.deepEqual(PRODUCT_PRESET_INTENT_PRESET_IDS, [
    'direct',
    'new_chat',
    'group_chat',
    'parallel_chat',
    'new_code',
    'team_code',
    'peer_code',
    'new_work',
    'team_work',
    'parallel_work',
  ]);
});

test('buildDirectProductPresetIntentContext creates the direct preset context', () => {
  const context = buildDirectProductPresetIntentContext({
    channelId: ' channel-direct ',
    conversationId: ' conversation-direct ',
    turnId: ' turn-1 ',
    segmentId: ' segment-1 ',
    originSurface: 'telegram',
    transport: 'telegram',
    eligibleCats: [
      {
        catId: ' cat-1 ',
        actorId: ' actor-cat-1 ',
        capabilityProfileKind: 'strong_agent',
      },
    ],
  });

  assert.deepEqual(context, {
    version: 1,
    sourceProduct: 'chat',
    presetId: 'direct',
    source: {
      channelId: 'channel-direct',
      conversationId: 'conversation-direct',
      turnId: 'turn-1',
      segmentId: 'segment-1',
    },
    originSurface: 'telegram',
    transport: 'telegram',
    eligibleCats: [
      {
        catId: 'cat-1',
        actorId: 'actor-cat-1',
        capabilityProfileKind: 'strong_agent',
      },
    ],
  });
});

test('source field requirements distinguish direct, team, and container-backed presets', () => {
  assert.deepEqual(listRequiredProductPresetIntentSourceFields('direct'), [
    'channelId',
    'conversationId',
  ]);
  assert.deepEqual(listRequiredProductPresetIntentSourceFields('team_work'), [
    'channelId',
    'conversationId',
  ]);
  assert.deepEqual(
    listRequiredProductPresetIntentSourceFields('team_work', { materializedLane: true }),
    ['channelId', 'conversationId', 'laneId'],
  );
  assert.deepEqual(listRequiredProductPresetIntentSourceFields('parallel_chat'), [
    'containerId',
    'branchId',
    'conversationId',
  ]);
  assert.equal(isContainerBackedProductPresetIntentPreset('peer_code'), true);
  assert.equal(isContainerBackedProductPresetIntentPreset('group_chat'), false);
});

test('validateProductPresetIntentContext rejects missing required source fields', () => {
  const context = buildProductPresetIntentContext({
    sourceProduct: 'work',
    presetId: 'new_work',
    source: {
      channelId: 'channel-work',
      conversationId: 'conversation-work',
      turnId: 'turn-work',
      segmentId: 'segment-work',
    },
    originSurface: 'desktop',
    transport: 'web',
  });

  assert.deepEqual(validateProductPresetIntentContext(context), {
    valid: true,
    issues: [],
  });

  assert.throws(
    () => buildProductPresetIntentContext({
      sourceProduct: 'chat',
      presetId: 'parallel_chat',
      source: {
        containerId: 'parallel-container',
        turnId: 'turn-parallel',
        segmentId: 'segment-parallel',
      },
      originSurface: 'desktop',
      transport: 'web',
    }),
    /source\.branchId:missing_required_field/,
  );
});

test('validateProductPresetIntentContext rejects branch ids on channel-backed presets', () => {
  const context = buildProductPresetIntentContext({
    sourceProduct: 'chat',
    presetId: 'group_chat',
    source: {
      channelId: 'channel-group',
      conversationId: 'conversation-group',
      turnId: 'turn-group',
      segmentId: 'segment-group',
    },
    originSurface: 'desktop',
    transport: 'web',
  });
  const invalidContext = {
    ...context,
    source: {
      ...context.source,
      branchId: 'branch-not-supported',
    },
  };

  assert.deepEqual(validateProductPresetIntentContext(invalidContext), {
    valid: false,
    issues: [
      {
        field: 'source.branchId',
        code: 'unsupported_lane_field',
      },
    ],
  });
});
