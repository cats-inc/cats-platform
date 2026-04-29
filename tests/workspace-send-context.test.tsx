import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareWorkspaceSendContext } from '../src/products/shared/renderer/composerDispatch.ts';

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    chat: {
      selectedChannel: {
        id: 'channel-1',
        channelKind: 'boss_thread',
        roomRouting: {
          defaultRecipientId: null,
        },
        repoPath: null,
        chatCwd: null,
      },
      ...overrides.chat as object,
    },
    ...overrides,
  };
}

test('prepareWorkspaceSendContext composes solo dispatch target with attachment hydration for an existing room', async () => {
  const stateUpdates: unknown[] = [];
  const restoreCalls: File[][] = [];
  const trace: string[] = [];
  const channelFiles = [new File(['notes'], 'notes.txt')];

  const result = await prepareWorkspaceSendContext({
    initialPayload: createPayload(),
    wasDraftingNewChat: false,
    isCatScopedLaneRoute: false,
    hydratedDirectLane: null,
    currentChannelId: 'channel-1',
    currentRollbackPath: '/chat/chats/channel-1',
    body: 'Inspect the attached notes.',
    existingCount: 2,
    draftCwd: null,
    originSurface: 'chat',
    draftDefaultRecipientCatId: null,
    participantCatIds: [],
    selectedChannel: {
      id: 'channel-1',
    },
    soloChannelExecutionTarget: {
      provider: 'codex',
      model: 'gpt-5.4',
      instance: 'native',
      modelSelection: {
        entryId: 'gpt-5.4',
        entryMode: 'explicit',
      },
    },
    draftFiles: [],
    channelFiles,
    createChatChannel: async () => {
      throw new Error('createChatChannel should not run for an existing room');
    },
    insertCreatedChannelIntoPayload: (payload) => payload,
    setState: (nextState) => {
      stateUpdates.push(nextState);
    },
    navigate: () => {
      throw new Error('navigate should not run for an existing room');
    },
    setChannelFiles: (files) => {
      restoreCalls.push(files);
    },
    originalDraftFiles: [],
    originalChannelFiles: channelFiles,
    buildChannelPath: (channelId) => `/chat/chats/${channelId}`,
    updateSelectedChannel: async (channelId) => {
      trace.push(`update:${channelId}`);
      return createPayload({
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
      });
    },
    uploadChannelAttachments: async (channelId, files) => {
      trace.push(`upload:${channelId}:${files.length}`);
      return [{ relativePath: '.cats-attachments/notes.txt' }];
    },
  });

  assert.equal(result.channelId, 'channel-1');
  assert.equal(result.rollbackPath, '/chat/chats/channel-1');
  assert.deepEqual(result.soloDispatchTarget, {
    pendingProvider: 'codex',
    pendingModel: 'gpt-5.4',
    pendingInstance: 'native',
    pendingModelSelection: {
      entryId: 'gpt-5.4',
      entryMode: 'explicit',
    },
  });
  assert.equal(
    result.messageBody,
    '[Attached files in working directory:]\n- .cats-attachments/notes.txt\n\nInspect the attached notes.',
  );
  assert.deepEqual(trace, ['update:channel-1', 'upload:channel-1:1']);
  assert.equal(stateUpdates.length, 1);

  result.restoreFiles();
  assert.deepEqual(restoreCalls, [channelFiles]);
});

test('prepareWorkspaceSendContext creates missing direct lanes, uses draft files, and restores draft uploads on rollback', async () => {
  const createdInputs: Array<Record<string, unknown>> = [];
  const stateUpdates: unknown[] = [];
  const navigations: Array<{ path: string; replace: boolean }> = [];
  const restoreCalls: File[][] = [];
  const draftFiles = [new File(['draft'], 'direct.txt')];

  const result = await prepareWorkspaceSendContext({
    initialPayload: createPayload({
      chat: {
        selectedChannel: null,
      },
    }),
    wasDraftingNewChat: false,
    isCatScopedLaneRoute: true,
    hydratedDirectLane: null,
    currentChannelId: '',
    currentRollbackPath: '/chat/my-cats/cat-lead',
    body: 'Wake up and inspect the direct lane attachment.',
    existingCount: 3,
    draftCwd: 'C:/repo/direct-lane',
    originSurface: 'chat',
    draftDefaultRecipientCatId: 'cat-lead',
    participantCatIds: ['cat-lead'],
    selectedChannel: null,
    soloChannelExecutionTarget: {
      provider: 'claude',
      model: 'opus',
      instance: 'native',
      modelSelection: null,
    },
    draftFiles,
    channelFiles: [],
    createChatChannel: async (input) => {
      createdInputs.push(input as Record<string, unknown>);
      return { id: 'channel-direct-1' };
    },
    insertCreatedChannelIntoPayload: (payload, createdChannel) => ({
      ...payload,
      chat: {
        ...payload.chat,
        selectedChannel: {
          id: createdChannel.id,
          channelKind: 'direct_lane',
          roomRouting: {
            defaultRecipientId: 'cat-lead',
          },
          repoPath: 'C:/repo/direct-lane',
          chatCwd: null,
        },
      },
    }),
    setState: (nextState) => {
      stateUpdates.push(nextState);
    },
    navigate: (path, options) => {
      navigations.push({ path, replace: options.replace });
    },
    setChannelFiles: (files) => {
      restoreCalls.push(files);
    },
    originalDraftFiles: draftFiles,
    originalChannelFiles: [],
    buildChannelPath: (channelId) => `/chat/chats/${channelId}`,
    updateSelectedChannel: async () => {
      throw new Error('updateSelectedChannel should not run when repoPath already exists');
    },
    uploadChannelAttachments: async (channelId, files) => {
      assert.equal(channelId, 'channel-direct-1');
      assert.deepEqual(files, draftFiles);
      return [{ relativePath: '.cats-attachments/direct.txt' }];
    },
  });

  assert.equal(createdInputs.length, 1);
  assert.equal(createdInputs[0]?.entryKind, 'direct');
  assert.equal(createdInputs[0]?.defaultRecipientId, 'cat-lead');
  assert.equal(result.channelId, 'channel-direct-1');
  assert.equal(result.rollbackPath, '/chat/my-cats/cat-lead');
  assert.equal(result.soloDispatchTarget, null);
  assert.equal(
    result.messageBody,
    '[Attached files in working directory:]\n- .cats-attachments/direct.txt\n\nWake up and inspect the direct lane attachment.',
  );
  assert.equal(stateUpdates.length, 1);
  assert.deepEqual(navigations, [{ path: '/chat/my-cats/cat-lead', replace: true }]);

  result.restoreFiles();
  assert.deepEqual(restoreCalls, [draftFiles]);
});
