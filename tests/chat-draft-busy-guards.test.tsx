import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveNewConversationDraftViewState } from '../src/products/shared/renderer/components/newConversationDraftSupport.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';
import {
  createChannelComposerBusyScope,
  createComposerBusyState,
  createDraftComposerBusyScope,
} from '../src/shared/workspaceBusy.ts';

const t = createTranslator('en');

function createPayload() {
  return {
    chat: {
      bossCatId: null,
      botBindings: [],
      assistantPresets: [],
      capabilities: {
        maxChatParticipants: 6,
      },
      cats: [
        {
          id: 'cat-1',
          name: 'Claude',
          status: 'active',
          avatarColor: '#f97316',
          avatarUrl: null,
          defaultExecutionTarget: {
            provider: 'claude',
            instance: 'cli',
            model: 'sonnet',
          },
          defaultModelSelection: null,
        },
      ],
    },
  } as never;
}

test('resolveNewConversationDraftViewState keeps unrelated active-channel busy state out of draft composers', () => {
  const result = resolveNewConversationDraftViewState({
    payload: createPayload(),
    draftDefaultRecipientCatId: null,
    draftCatIds: [],
    draftTemporaryParticipants: [],
    allowAddCat: true,
    entryPreset: 'default',
    parallelTargets: undefined,
    greeting: null,
    greetingPool: null,
    draftHighlightedCatId: null,
    draftCatExecutionTargetOverrides: new Map(),
    busy: createComposerBusyState('send', createChannelComposerBusyScope('channel-1')),
    t,
  });

  assert.equal(result.isAckPending, false);
  assert.equal(result.isSubmittingFirstTurn, false);
});

test('resolveNewConversationDraftViewState keeps draft send busy local to the active draft route', () => {
  const result = resolveNewConversationDraftViewState({
    payload: createPayload(),
    draftDefaultRecipientCatId: null,
    draftCatIds: [],
    draftTemporaryParticipants: [],
    allowAddCat: true,
    entryPreset: 'default',
    parallelTargets: undefined,
    greeting: null,
    greetingPool: null,
    draftHighlightedCatId: null,
    draftCatExecutionTargetOverrides: new Map(),
    busy: createComposerBusyState('ack', createDraftComposerBusyScope()),
    t,
  });

  assert.equal(result.isAckPending, true);
  assert.equal(result.isSubmittingFirstTurn, true);
});
