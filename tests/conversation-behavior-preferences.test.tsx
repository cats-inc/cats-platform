import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyConversationBehaviorPatch,
  cloneConversationBehaviorPreferences,
  createDefaultConversationBehaviorPreferences,
  normalizeConversationBehaviorPreferences,
  resolveConversationBehaviorPreferences,
} from '../src/products/shared/conversationBehavior.ts';

test('conversation behavior defaults to the same baseline across chat, work, and code', () => {
  assert.deepEqual(createDefaultConversationBehaviorPreferences(), {
    chat: {
      showVerboseMessages: false,
      showLiveProgressDetails: false,
      concurrentPresentationMode: 'inline_stack',
    },
    work: {
      showVerboseMessages: false,
      showLiveProgressDetails: false,
      concurrentPresentationMode: 'inline_stack',
    },
    code: {
      showVerboseMessages: false,
      showLiveProgressDetails: false,
      concurrentPresentationMode: 'inline_stack',
    },
  });
});

test('conversation behavior normalization only keeps supported booleans and modes', () => {
  assert.deepEqual(
    normalizeConversationBehaviorPreferences({
      chat: {
        showVerboseMessages: true,
        showLiveProgressDetails: 'true',
        concurrentPresentationMode: 'compare_cards',
      },
      work: {
        showVerboseMessages: 1,
        showLiveProgressDetails: true,
        concurrentPresentationMode: 'bad-mode',
      },
      ignored: {
        showVerboseMessages: true,
      },
    }),
    {
      chat: {
        showVerboseMessages: true,
        showLiveProgressDetails: false,
        concurrentPresentationMode: 'compare_cards',
      },
      work: {
        showVerboseMessages: false,
        showLiveProgressDetails: true,
        concurrentPresentationMode: 'inline_stack',
      },
      code: {
        showVerboseMessages: false,
        showLiveProgressDetails: false,
        concurrentPresentationMode: 'inline_stack',
      },
    },
  );
});

test('conversation behavior patching updates only the targeted surface fields', () => {
  const current = createDefaultConversationBehaviorPreferences();
  const next = applyConversationBehaviorPatch(current, {
    work: {
      showVerboseMessages: true,
      concurrentPresentationMode: 'focus_rail',
    },
    code: {
      showLiveProgressDetails: true,
    },
  });

  assert.notEqual(cloneConversationBehaviorPreferences(current), current);
  assert.deepEqual(next.chat, current.chat);
  assert.deepEqual(next.work, {
    showVerboseMessages: true,
    showLiveProgressDetails: false,
    concurrentPresentationMode: 'focus_rail',
  });
  assert.deepEqual(next.code, {
    showVerboseMessages: false,
    showLiveProgressDetails: true,
    concurrentPresentationMode: 'inline_stack',
  });
});

test('conversation behavior resolution returns the requested product slice', () => {
  const preferences = applyConversationBehaviorPatch(
    createDefaultConversationBehaviorPreferences(),
    {
      code: {
        showVerboseMessages: true,
        concurrentPresentationMode: 'adaptive',
      },
    },
  );

  assert.deepEqual(
    resolveConversationBehaviorPreferences(preferences, 'code'),
    {
      showVerboseMessages: true,
      showLiveProgressDetails: false,
      concurrentPresentationMode: 'adaptive',
    },
  );
});
