import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { GLOBAL_ORCHESTRATOR_ACTOR_ID, createCatActorId } from '../build/server/core/actors.js';
import { persistAttachmentsForChannels } from '../build/server/products/chat/api/attachmentSupport.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  assignCatToChannel,
  createCat,
  createChannel,
  setChannelCatLease,
  setChannelOrchestratorLease,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createChatTaskExecutionLocator } from '../build/server/products/chat/state/taskExecutionLocator.js';

async function createStateWithRuntimeAttachments(baseDir) {
  const now = new Date('2026-04-15T13:00:00.000Z');
  let state = createDefaultChatState();
  state = createCat(state, { name: 'Companion', provider: 'claude' }, now);
  const catId = state.cats[0].id;
  state = createChannel(state, {
    title: 'Attachment Room',
    topic: 'sync attachments and project task execution attachments',
    skipBossCatGreeting: true,
  }, now);
  const channelId = state.selectedChannelId;
  state = assignCatToChannel(state, channelId, { catId, provider: 'claude' }, now);

  const orchestratorWorkspace = path.join(baseDir, 'orchestrator');
  const participantWorkspace = path.join(baseDir, 'participant');

  state = setChannelOrchestratorLease(state, channelId, {
    status: 'ready',
    sessionId: 'session-orchestrator',
    laneId: 'lane-orchestrator',
    cwd: orchestratorWorkspace,
    provider: 'claude',
    model: 'claude-sonnet',
    startedAt: now.toISOString(),
  }, now);
  state = setChannelCatLease(state, channelId, catId, {
    status: 'ready',
    sessionId: 'session-companion',
    laneId: 'lane-companion',
    cwd: participantWorkspace,
    provider: 'claude',
    model: 'claude-sonnet',
    startedAt: now.toISOString(),
  }, now);

  return {
    state,
    channelId,
    catId,
    orchestratorWorkspace,
    participantWorkspace,
  };
}

test('persistAttachmentsForChannels syncs files to orchestrator and participant attachment workspaces', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-attachment-sync-'));
  try {
    const {
      state,
      channelId,
      orchestratorWorkspace,
      participantWorkspace,
    } = await createStateWithRuntimeAttachments(tempDir);

    const attachments = await persistAttachmentsForChannels({
      state,
      channelIds: [channelId],
      files: [
        {
          name: 'notes.txt',
          data: Buffer.from('hello attachments', 'utf8').toString('base64'),
        },
      ],
      runtimeDataDir: tempDir,
    });

    assert.deepEqual(attachments.get(channelId), [
      {
        name: 'notes.txt',
        relativePath: '.cats-attachments/notes.txt',
      },
    ]);

    const channelAttachmentPath = path.join(
      tempDir,
      'channels',
      channelId,
      '.cats-attachments',
      'notes.txt',
    );
    const orchestratorAttachmentPath = path.join(
      orchestratorWorkspace,
      '.cats-attachments',
      'notes.txt',
    );
    const participantAttachmentPath = path.join(
      participantWorkspace,
      '.cats-attachments',
      'notes.txt',
    );

    assert.equal(await readFile(channelAttachmentPath, 'utf8'), 'hello attachments');
    assert.equal(await readFile(orchestratorAttachmentPath, 'utf8'), 'hello attachments');
    assert.equal(await readFile(participantAttachmentPath, 'utf8'), 'hello attachments');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('createChatTaskExecutionLocator resolves lane and session attachments for orchestrator and cat participants', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-task-exec-'));
  try {
    const {
      state,
      channelId,
      catId,
    } = await createStateWithRuntimeAttachments(tempDir);
    const chatStore = new MemoryChatStore();
    await chatStore.write(state);

    const locator = createChatTaskExecutionLocator(chatStore);
    const resolved = await locator.resolveTaskConversation(
      {
        conversations: [
          {
            id: 'conversation-channel-1',
            sourceChannelId: channelId,
          },
        ],
      },
      {
        conversationId: 'conversation-channel-1',
      },
    );

    assert.deepEqual(resolved, {
      orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
      orchestratorLaneId: 'lane-orchestrator',
      orchestratorSessionId: 'session-orchestrator',
      participants: [
        {
          actorId: createCatActorId(catId),
          status: 'active',
          laneId: 'lane-companion',
          sessionId: 'session-companion',
        },
      ],
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
