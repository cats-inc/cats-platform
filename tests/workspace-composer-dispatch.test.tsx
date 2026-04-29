import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSoloDispatchTarget,
  isDirectLaneSelectedForCat,
  prepareComposerMessageBody,
  resolveComposerFilesToUpload,
} from '../src/products/shared/renderer/composerDispatch.ts';

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    chat: {
      selectedChannel: {
        id: 'channel-1',
        channelKind: 'boss_thread',
        roomRouting: {
          defaultRecipientId: null,
        },
        repoPath: 'C:/repo/demo',
        chatCwd: null,
      },
    },
    ...overrides,
  };
}

test('isDirectLaneSelectedForCat only accepts matching direct-lane recipients', () => {
  assert.equal(
    isDirectLaneSelectedForCat({
      id: 'channel-direct',
      channelKind: 'direct_lane',
      roomRouting: {
        defaultRecipientId: 'cat-1',
      },
    }, 'cat-1'),
    true,
  );
  assert.equal(
    isDirectLaneSelectedForCat({
      id: 'channel-direct',
      channelKind: 'direct_lane',
      roomRouting: {
        defaultRecipientId: 'cat-2',
      },
    }, 'cat-1'),
    false,
  );
  assert.equal(
    isDirectLaneSelectedForCat({
      id: 'channel-thread',
      channelKind: 'boss_thread',
      roomRouting: {
        defaultRecipientId: 'cat-1',
      },
    }, 'cat-1'),
    false,
  );
  assert.equal(isDirectLaneSelectedForCat(null, 'cat-1'), false);
});

test('buildSoloDispatchTarget only derives pending target for the active solo room', () => {
  const executionTarget = {
    provider: 'codex',
    model: 'gpt-5.4',
    instance: 'native',
    modelSelection: {
      entryId: 'gpt-5.4',
      entryMode: 'explicit' as const,
    },
  };

  assert.deepEqual(
    buildSoloDispatchTarget({
      wasDraftingNewChat: false,
      isCatScopedLaneRoute: false,
      channelId: 'channel-solo',
      selectedChannel: {
        id: 'channel-solo',
      },
      soloChannelExecutionTarget: executionTarget,
    }),
    {
      pendingProvider: 'codex',
      pendingModel: 'gpt-5.4',
      pendingInstance: 'native',
      pendingModelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
      },
    },
  );

  assert.equal(
    buildSoloDispatchTarget({
      wasDraftingNewChat: true,
      isCatScopedLaneRoute: false,
      channelId: 'channel-solo',
      selectedChannel: {
        id: 'channel-solo',
      },
      soloChannelExecutionTarget: executionTarget,
    }),
    null,
  );
  assert.equal(
    buildSoloDispatchTarget({
      wasDraftingNewChat: false,
      isCatScopedLaneRoute: true,
      channelId: 'channel-solo',
      selectedChannel: {
        id: 'channel-solo',
      },
      soloChannelExecutionTarget: executionTarget,
    }),
    null,
  );
  assert.equal(
    buildSoloDispatchTarget({
      wasDraftingNewChat: false,
      isCatScopedLaneRoute: false,
      channelId: 'channel-solo',
      selectedChannel: {
        id: 'channel-other',
      },
      soloChannelExecutionTarget: executionTarget,
    }),
    null,
  );
  assert.equal(
    buildSoloDispatchTarget({
      wasDraftingNewChat: false,
      isCatScopedLaneRoute: false,
      channelId: 'channel-participant',
      selectedChannel: {
        id: 'channel-participant',
        assignedCats: [{ catId: 'cat-1', status: 'active' }],
      },
      soloChannelExecutionTarget: executionTarget,
    }),
    null,
  );
});

test('resolveComposerFilesToUpload keeps draft and channel file ownership separate by route state', () => {
  const draftFiles = [new File(['draft'], 'draft.txt')];
  const channelFiles = [new File(['channel'], 'channel.txt')];

  assert.deepEqual(
    resolveComposerFilesToUpload({
      isCatScopedLaneRoute: true,
      hydratedDirectLane: null,
      wasDraftingNewChat: false,
      draftFiles,
      channelFiles,
    }),
    draftFiles,
  );
  assert.deepEqual(
    resolveComposerFilesToUpload({
      isCatScopedLaneRoute: true,
      hydratedDirectLane: {
        id: 'channel-direct',
      },
      wasDraftingNewChat: false,
      draftFiles,
      channelFiles,
    }),
    channelFiles,
  );
  assert.deepEqual(
    resolveComposerFilesToUpload({
      isCatScopedLaneRoute: false,
      hydratedDirectLane: null,
      wasDraftingNewChat: true,
      draftFiles,
      channelFiles,
    }),
    draftFiles,
  );
  assert.deepEqual(
    resolveComposerFilesToUpload({
      isCatScopedLaneRoute: false,
      hydratedDirectLane: null,
      wasDraftingNewChat: false,
      draftFiles,
      channelFiles,
    }),
    channelFiles,
  );
});

test('prepareComposerMessageBody hydrates missing workspace context before uploading attachments', async () => {
  const draftFile = new File(['notes'], 'notes.txt');
  const calls: string[] = [];

  const result = await prepareComposerMessageBody({
    payload: createPayload({
      chat: {
        selectedChannel: {
          id: 'channel-1',
          repoPath: null,
          chatCwd: null,
        },
      },
    }),
    channelId: 'channel-1',
    body: 'Please inspect these files.',
    filesToUpload: [draftFile],
    updateSelectedChannel: async (channelId) => {
      calls.push(`update:${channelId}`);
      return createPayload();
    },
    uploadChannelAttachments: async (channelId, files) => {
      calls.push(`upload:${channelId}:${files.length}`);
      return [{ relativePath: 'src/index.ts' }];
    },
  });

  assert.deepEqual(calls, ['update:channel-1', 'upload:channel-1:1']);
  assert.equal(result.payload.chat.selectedChannel?.repoPath, 'C:/repo/demo');
  assert.equal(
    result.messageBody,
    '[Attached files in working directory:]\n- src/index.ts\n\nPlease inspect these files.',
  );
});

test('prepareComposerMessageBody skips hydration and upload when there are no attachments', async () => {
  const calls: string[] = [];
  const initialPayload = createPayload();

  const result = await prepareComposerMessageBody({
    payload: initialPayload,
    channelId: 'channel-1',
    body: 'No files this time.',
    filesToUpload: [],
    updateSelectedChannel: async () => {
      calls.push('update');
      return initialPayload;
    },
    uploadChannelAttachments: async () => {
      calls.push('upload');
      return [];
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(result.payload, initialPayload);
  assert.equal(result.messageBody, 'No files this time.');
});
