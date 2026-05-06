import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../src/core/store.ts';
import {
  linkCoreWorkItemToTask,
  upsertCoreTask,
} from '../src/core/model/index.ts';
import type {
  CatsCoreState,
  CoreWorkItemRecord,
} from '../src/core/types.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';
import {
  parseProviderCapabilityBootstrapConfigDocument,
} from '../src/platform/supervision/index.ts';
import { buildCodeTaskListProjection } from '../src/products/code/api/projection.ts';
import { createCodeTask } from '../src/products/code/state/taskExecution.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createChannel } from '../src/products/chat/state/model/index.ts';
import {
  beginChannelMessageDispatch,
} from '../src/products/chat/state/runtime-dispatch/routing.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import {
  createWorkSupervisedRunPayload,
} from '../src/products/work/api/index.ts';
import { buildWorkWorkItemListProjection } from '../src/products/work/api/projection.ts';

function runtimeStub(): RuntimeClient {
  return {
    async closeSession() {},
  } as RuntimeClient;
}

function strongBootstrapConfig() {
  const parsed = parseProviderCapabilityBootstrapConfigDocument(
    {
      version: 1,
      profiles: [
        {
          id: 'claude-native-sonnet-strong',
          selector: {
            provider: 'claude',
            instance: 'native',
            model: 'sonnet',
            control: 'default',
          },
          initialTreatment: 'strong_agent',
          confidenceLevel: 'catalog_only',
          reason: 'Fixture direct audience Cat is strong.',
        },
      ],
    },
    { observedAt: '2026-05-06T08:00:00.000Z' },
  );

  if (!parsed.config) {
    throw new Error('Expected fixture bootstrap config to parse.');
  }

  return parsed.config;
}

async function createDirectSlashModeAnchor(input: {
  body: string;
  catName: string;
}): Promise<{
  core: CatsCoreState;
  workItem: CoreWorkItemRecord;
  channelId: string;
}> {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct supervised boundary',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: input.catName,
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    new Date('2026-05-06T08:00:00.000Z'),
  );
  const channelId = state.selectedChannelId;
  const store = new MemoryChatStore(state);

  await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: input.body,
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
      providerCapabilityBootstrapConfig: strongBootstrapConfig(),
    },
  );

  const core = await store.readCore();
  const workItem = core.workItems.find((candidate) =>
    Boolean(candidate.metadata.directSlashModeIntake));

  assert.ok(workItem);
  return { core, workItem, channelId };
}

test('direct slash-mode Work anchors start supervised runs only after Work task linkage', async () => {
  const { core, workItem } = await createDirectSlashModeAnchor({
    body: '/work clarify run boundary',
    catName: 'RunnerCat',
  });
  const taskResult = upsertCoreTask(
    core,
    {
      title: 'Clarify run boundary',
      status: 'approved',
      ownerActorId: core.ownerProfile.actorId,
      conversationId: workItem.conversationId,
      summary: 'Promoted from direct slash-mode Work intake.',
      assignedActorIds: workItem.assignedActorIds,
      metadata: {
        planning: {
          productHint: 'work',
          strategyHint: 'pdca',
        },
      },
    },
    new Date('2026-05-06T08:02:00.000Z'),
  );
  const linked = linkCoreWorkItemToTask(
    taskResult.core,
    {
      workItemId: workItem.id,
      taskId: taskResult.task.id,
    },
    new Date('2026-05-06T08:03:00.000Z'),
  );
  const coreStore = new MemoryCoreStore(linked.core);

  const run = await createWorkSupervisedRunPayload(
    {
      coreStore,
      now: () => new Date('2026-05-06T08:04:00.000Z'),
    },
    taskResult.task.id,
  );

  const persisted = await coreStore.readCore();
  const projectedWorkItem = buildWorkWorkItemListProjection(persisted)
    .workItems.find((candidate) => candidate.id === workItem.id);

  assert.equal(run.created, true);
  assert.equal(run.run.status, 'queued');
  assert.equal(run.run.taskId, taskResult.task.id);
  assert.equal(projectedWorkItem?.taskId, taskResult.task.id);
});

test('direct slash-mode Code anchors link through Code task creation before execution', async () => {
  const { core, workItem, channelId } = await createDirectSlashModeAnchor({
    body: '/code clarify code boundary',
    catName: 'BuilderCat',
  });
  const result = createCodeTask(
    core,
    {
      title: 'Clarify code boundary',
      summary: 'Promoted from direct slash-mode Code intake.',
      conversationId: workItem.conversationId,
      assignedActorIds: workItem.assignedActorIds,
      workItemId: workItem.id,
    },
    new Date('2026-05-06T08:02:00.000Z'),
  );
  const linkedWorkItem = result.core.workItems.find((candidate) => candidate.id === workItem.id);
  const codeTask = buildCodeTaskListProjection(result.core)
    .tasks.find((candidate) => candidate.id === result.task.id);

  assert.equal(result.core.runs.filter((run) => run.taskId === result.task.id).length, 0);
  assert.equal(linkedWorkItem?.taskId, result.task.id);
  assert.equal(codeTask?.workItemId, workItem.id);
  assert.equal(codeTask?.conversationId, workItem.conversationId);
  assert.equal(
    result.core.conversations.find((conversation) => conversation.id === workItem.conversationId)
      ?.sourceChannelId,
    channelId,
  );
});
