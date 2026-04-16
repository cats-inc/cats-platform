import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildConcurrentClusterUiStateKey,
  dismissConcurrentClusterUiState,
  resolveConcurrentClusterPresentationMode,
  type ConcurrentClusterUiStateMap,
} from '../src/products/chat/renderer/components/chat-view/concurrentClusterUiState.js';

test('dismissConcurrentClusterUiState scopes dismissal by channel and turn', () => {
  const dismissed = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  assert.deepEqual(Object.keys(dismissed), [
    buildConcurrentClusterUiStateKey('channel-1', 'turn-1'),
  ]);
  assert.equal(
    dismissed[buildConcurrentClusterUiStateKey('channel-1', 'turn-1')]?.presentationOverride,
    'inline_stack',
  );
});

test('resolveConcurrentClusterPresentationMode only applies override to the dismissed cluster', () => {
  const uiStateByKey: ConcurrentClusterUiStateMap = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  assert.equal(
    resolveConcurrentClusterPresentationMode({
      channelId: 'channel-1',
      turnId: 'turn-1',
      userDefault: 'compare_cards',
      segmentCount: 2,
      viewportWidth: 1280,
      workflowRecommendation: null,
      uiStateByKey,
    }),
    'inline_stack',
  );
  assert.equal(
    resolveConcurrentClusterPresentationMode({
      channelId: 'channel-1',
      turnId: 'turn-2',
      userDefault: 'compare_cards',
      segmentCount: 2,
      viewportWidth: 1280,
      workflowRecommendation: null,
      uiStateByKey,
    }),
    'compare_cards',
  );
  assert.equal(
    resolveConcurrentClusterPresentationMode({
      channelId: 'channel-2',
      turnId: 'turn-1',
      userDefault: 'compare_cards',
      segmentCount: 2,
      viewportWidth: 1280,
      workflowRecommendation: null,
      uiStateByKey,
    }),
    'compare_cards',
  );
});
