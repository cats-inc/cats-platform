import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.js';
import { MemoryCoreStore } from '../src/core/store.js';
import {
  createInMemoryToolEvidenceSink,
  createToolBoundary,
} from '../src/platform/supervision/toolBoundary.js';
import { createSupervisedToolRegistry } from '../src/platform/supervision/toolRegistry.js';
import {
  createWorkIntakeDelegate,
  createWorkIntakeToolExecutors,
  proposeWorkItemSplit,
} from '../src/products/work/state/workIntakeDelegate.js';
import {
  WORK_ITEM_CAPTURE_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
  createPhaseScopedWorkToolManifests,
  type WorkItemCaptureInput,
} from '../src/products/work/shared/workToolSurface.js';

test('Work intake split proposal returns candidates without writing Core', () => {
  const result = proposeWorkItemSplit({
    source: {
      surface: 'telegram',
      sourceMessageId: 'telegram-message-1',
      sourceText: '- fix the Telegram intake flow\n- write Work tool docs',
    },
    maxItems: 5,
    defaultKind: 'todo',
    defaultPriority: 'medium',
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(
    result.result.candidates.map((candidate) => candidate.title),
    ['fix the Telegram intake flow', 'write Work tool docs'],
  );
  assert.equal(result.result.candidates[0]?.kind, 'todo');
  assert.equal(result.result.candidates[0]?.priority, 'medium');
});

test('Work intake capture writes only WorkItem and Activity through supervised boundary', async () => {
  const initialCore = createDefaultCoreState();
  const coreStore = new MemoryCoreStore(initialCore);
  const delegate = createWorkIntakeDelegate({
    coreStore,
    now: () => new Date('2026-05-13T00:00:00.000Z'),
  });
  const executors = createWorkIntakeToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T00:00:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const input: WorkItemCaptureInput = {
    title: 'Review Cats Work intake delegate',
    status: 'planned',
    kind: 'todo',
    priority: 'high',
    suggestedProjectTitle: 'Cats Platform',
    openQuestions: ['Should Telegram require confirmation?'],
    source: {
      surface: 'chat',
      conversationId: 'conversation-work-intake',
      channelId: 'channel-work',
      sourceMessageId: 'message-1',
      sourceText: 'Please track this as work.',
    },
  };

  const result = await boundary.invoke({
    toolName: WORK_ITEM_CAPTURE_TOOL,
    input,
    actionId: 'action-capture-1',
    runId: 'run-intake-1',
    actorRef: initialCore.ownerProfile.actorId,
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_ITEM_CAPTURE_TOOL],
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.result.created, true);
  assert.equal(result.result.status, 'planned');

  const core = await coreStore.readCore();
  assert.equal(core.workItems.length, 1);
  assert.equal(core.tasks.length, 0);
  assert.equal(core.runs.length, 0);
  assert.equal(core.activities.length, 1);

  const workItem = core.workItems[0];
  assert.equal(workItem?.title, 'Review Cats Work intake delegate');
  assert.equal(workItem?.status, 'planned');
  assert.equal(workItem?.conversationId, 'conversation-work-intake');
  assert.equal(workItem?.projectId, null);
  assert.equal(workItem?.taskId, null);
  assert.equal(workItem?.metadata.workIntake?.phase, 'intake');
  assert.equal(workItem?.metadata.workIntake?.source?.surface, 'chat');
  assert.equal(workItem?.metadata.workIntake?.priority, 'high');
  assert.equal(core.activities[0]?.kind, 'work_item_updated');
  assert.equal(core.activities[0]?.workItemId, workItem?.id);
  assert.equal(evidenceSink.read()[0]?.toolName, WORK_ITEM_CAPTURE_TOOL);
  assert.equal(evidenceSink.read()[0]?.status, 'applied');
});

test('Work intake capture is idempotent for the same source and title', async () => {
  const initialCore = createDefaultCoreState();
  const coreStore = new MemoryCoreStore(initialCore);
  const delegate = createWorkIntakeDelegate({
    coreStore,
    now: () => new Date('2026-05-13T00:00:00.000Z'),
  });
  const input: WorkItemCaptureInput = {
    title: 'Capture the same todo once',
    source: {
      surface: 'telegram',
      transportBindingId: 'binding-telegram',
      sourceMessageId: 'telegram-message-2',
      sourceText: 'Capture the same todo once',
    },
  };

  const first = await delegate.capture(input, {
    actorRef: initialCore.ownerProfile.actorId,
    actionId: 'action-1',
    runId: 'run-1',
  });
  const second = await delegate.capture(input, {
    actorRef: initialCore.ownerProfile.actorId,
    actionId: 'action-2',
    runId: 'run-2',
  });

  assert.equal(first.status, 'applied');
  assert.equal(second.status, 'applied');
  assert.equal(first.result.created, true);
  assert.equal(second.result.created, false);
  assert.equal(first.result.workItemId, second.result.workItemId);

  const core = await coreStore.readCore();
  assert.equal(core.workItems.length, 1);
  assert.equal(core.activities.length, 1);
});

test('Work intake executors expose proposal and capture delegates by tool name', () => {
  const delegate = createWorkIntakeDelegate({
    coreStore: new MemoryCoreStore(createDefaultCoreState()),
  });
  const executors = createWorkIntakeToolExecutors(delegate);

  assert.equal(typeof executors[WORK_ITEM_PROPOSE_SPLIT_TOOL], 'function');
  assert.equal(typeof executors[WORK_ITEM_CAPTURE_TOOL], 'function');
});
