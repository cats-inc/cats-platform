import assert from 'node:assert/strict';
import test from 'node:test';

import {
  prepareComposerChannelDispatch,
} from '../src/products/shared/renderer/composerDispatch.ts';

function createInitialPayload() {
  return {
    chat: {
      selectedChannel: null,
    },
  };
}

test('prepareComposerChannelDispatch keeps work-owned drafts stamped as work', async () => {
  const createdInputs: Array<Record<string, unknown>> = [];
  const stateUpdates: Array<unknown> = [];
  const navigations: Array<{ path: string; replace: boolean }> = [];

  const result = await prepareComposerChannelDispatch({
    initialPayload: createInitialPayload(),
    wasDraftingNewChat: true,
    isCatScopedLaneRoute: false,
    hydratedDirectLane: null,
    currentChannelId: '',
    currentRollbackPath: '/work/new',
    body: 'Review the current work queue',
    existingCount: 2,
    draftCwd: 'C:/repo/workspace',
    originSurface: 'work',
    draftDefaultRecipientCatId: null,
    participantCatIds: ['cat-planner'],
    draftEntryKind: 'group',
    createChatChannel: async (input) => {
      createdInputs.push(input as Record<string, unknown>);
      return { id: 'channel-work-1' };
    },
    insertCreatedChannelIntoPayload: (payload, createdChannel) => ({
      ...payload,
      chat: {
        ...payload.chat,
        selectedChannel: createdChannel,
      },
    }),
    setState: (nextState) => {
      stateUpdates.push(nextState);
    },
    navigate: (path, options) => {
      navigations.push({ path, replace: options.replace });
    },
    setChannelFiles: () => {},
    originalDraftFiles: [],
    originalChannelFiles: [],
    buildChannelPath: (channelId) => `/work/chats/${channelId}`,
  });

  assert.equal(createdInputs.length, 1);
  assert.equal(createdInputs[0]?.originSurface, 'work');
  assert.equal(createdInputs[0]?.entryKind, 'group');
  assert.equal(createdInputs[0]?.repoPath, 'C:/repo/workspace');
  assert.deepEqual(createdInputs[0]?.participantCatIds, ['cat-planner']);
  assert.equal(result.channelId, 'channel-work-1');
  assert.equal(result.rollbackPath, '/work/chats/channel-work-1');
  assert.equal(stateUpdates.length, 1);
  assert.deepEqual(navigations, [{ path: '/work/chats/channel-work-1', replace: true }]);
});

test('prepareComposerChannelDispatch keeps code-owned default drafts stamped as code', async () => {
  const createdInputs: Array<Record<string, unknown>> = [];

  await prepareComposerChannelDispatch({
    initialPayload: createInitialPayload(),
    wasDraftingNewChat: true,
    isCatScopedLaneRoute: false,
    hydratedDirectLane: null,
    currentChannelId: '',
    currentRollbackPath: '/code/new',
    body: 'Patch the failing runtime route',
    existingCount: 4,
    draftCwd: 'C:/repo/cats-platform',
    draftSessionPolicy: {
      workspaceKind: 'worktree',
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    },
    originSurface: 'code',
    draftDefaultRecipientCatId: null,
    participantCatIds: [],
    temporaryParticipants: [
      {
        participantId: 'participant-code',
        name: 'Code Reviewer',
        provider: 'antigravity-cli',
        instance: 'native',
        model: 'antigravity-default',
        modelSelection: null,
      },
    ],
    draftEntryKind: 'default',
    draftExecutionTarget: {
      provider: 'claude-cli',
      model: 'claude-opus-4-6',
      instance: 'native',
      modelSelection: null,
    },
    createChatChannel: async (input) => {
      createdInputs.push(input as Record<string, unknown>);
      return { id: 'channel-code-1' };
    },
    insertCreatedChannelIntoPayload: (payload, createdChannel) => ({
      ...payload,
      chat: {
        ...payload.chat,
        selectedChannel: createdChannel,
      },
    }),
    setState: () => {},
    navigate: () => {},
    setChannelFiles: () => {},
    originalDraftFiles: [],
    originalChannelFiles: [],
    buildChannelPath: (channelId) => `/code/chats/${channelId}`,
  });

  assert.equal(createdInputs.length, 1);
  assert.equal(createdInputs[0]?.originSurface, 'code');
  assert.equal(createdInputs[0]?.entryKind, 'default');
  assert.equal(createdInputs[0]?.runtimeWorkspaceKind, 'worktree');
  assert.equal(createdInputs[0]?.runtimeWorkspaceAccess, 'read_only');
  assert.equal(createdInputs[0]?.runtimePermissionMode, 'default');
  assert.equal(createdInputs[0]?.pendingProvider, 'claude');
  assert.equal(createdInputs[0]?.pendingModel, 'claude-opus-4-6');
  assert.equal(createdInputs[0]?.pendingInstance, 'native');
  assert.deepEqual(createdInputs[0]?.temporaryParticipants, [
    {
      participantId: 'participant-code',
      name: 'Code Reviewer',
      provider: 'antigravity',
      instance: 'native',
      model: 'antigravity-default',
      modelSelection: null,
      roleHint: undefined,
    },
  ]);
});
