import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY,
  MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES,
  buildConcurrentClusterUiStateKey,
  dismissConcurrentClusterUiState,
  parseStoredConcurrentClusterUiStateMap,
  readConcurrentClusterUiStateMap,
  resolveConcurrentClusterPresentationMode,
  type ConcurrentClusterUiStateMap,
  writeConcurrentClusterUiStateMap,
} from '../src/products/shared/renderer/components/chat-view/concurrentClusterUiState.js';

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

test('writeConcurrentClusterUiStateMap persists dismiss overrides for refresh-time restore', () => {
  const writes = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return writes.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      writes.set(key, value);
    },
  };
  const uiStateByKey: ConcurrentClusterUiStateMap = dismissConcurrentClusterUiState({}, {
    channelId: 'channel-1',
    turnId: 'turn-1',
  });

  writeConcurrentClusterUiStateMap(storage, uiStateByKey);

  assert.equal(writes.has(CONCURRENT_CLUSTER_UI_STATE_STORAGE_KEY), true);
  assert.deepEqual(readConcurrentClusterUiStateMap(storage), uiStateByKey);
});

test('parseStoredConcurrentClusterUiStateMap ignores invalid records and keeps valid dismiss overrides', () => {
  const parsed = parseStoredConcurrentClusterUiStateMap(JSON.stringify({
    'channel-1:turn-1': { presentationOverride: 'inline_stack' },
    'channel-1:turn-2': { presentationOverride: 'focus_rail' },
    'channel-1:turn-3': { presentationOverride: null },
    'channel-1:turn-4': 'bad-record',
  }));

  assert.deepEqual(parsed, {
    'channel-1:turn-1': { presentationOverride: 'inline_stack' },
  });
});

test('dismissConcurrentClusterUiState keeps only the most recent bounded entry set', () => {
  let state: ConcurrentClusterUiStateMap = {};
  for (let index = 0; index < MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES + 5; index += 1) {
    state = dismissConcurrentClusterUiState(state, {
      channelId: 'channel-1',
      turnId: `turn-${index}`,
    });
  }

  assert.equal(Object.keys(state).length, MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES);
  assert.equal(state[buildConcurrentClusterUiStateKey('channel-1', 'turn-0')], undefined);
  assert.deepEqual(
    state[buildConcurrentClusterUiStateKey(
      'channel-1',
      `turn-${MAX_CONCURRENT_CLUSTER_UI_STATE_ENTRIES + 4}`,
    )],
    { presentationOverride: 'inline_stack' },
  );
});

test('writeConcurrentClusterUiStateMap warns when storage writes fail', () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message ?? ''));
  };
  try {
    const storage = {
      getItem(): string | null {
        return null;
      },
      setItem(): void {
        throw new Error('quota exceeded');
      },
    };

    writeConcurrentClusterUiStateMap(storage, dismissConcurrentClusterUiState({}, {
      channelId: 'channel-1',
      turnId: 'turn-1',
    }));
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? '', /Failed to write concurrent cluster dismiss state/i);
});
