import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChatNewChatDraftViewState } from '../src/products/shared/renderer/components/chatNewChatDraftSupport.ts';
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

test('resolveChatNewChatDraftViewState keeps unrelated active-channel busy state out of draft composers', () => {
  const result = resolveChatNewChatDraftViewState({
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
    selectedExecutionTarget: null,
    busy: createComposerBusyState('send', createChannelComposerBusyScope('channel-1')),
    t,
  });

  assert.equal(result.isAckPending, false);
  assert.equal(result.isSubmittingFirstTurn, false);
});

test('resolveChatNewChatDraftViewState keeps draft send busy local to the active draft route', () => {
  const result = resolveChatNewChatDraftViewState({
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
    selectedExecutionTarget: null,
    busy: createComposerBusyState('ack', createDraftComposerBusyScope()),
    t,
  });

  assert.equal(result.isAckPending, true);
  assert.equal(result.isSubmittingFirstTurn, true);
});
