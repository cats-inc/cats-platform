import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.js';
import { MemoryCoreStore } from '../src/core/store.js';
import { buildWorkGraphProjection } from '../src/products/work/api/workGraphProjection.js';
import { createWorkIntakeDelegate } from '../src/products/work/state/workIntakeDelegate.js';
import { createWorkTriageDelegate } from '../src/products/work/state/workTriageDelegate.js';

test('captured Work Items appear in Work Graph without fake Project anchors', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const intake = createWorkIntakeDelegate({
    coreStore,
    now: () => new Date('2026-05-13T11:00:00.000Z'),
  });

  const capture = await intake.capture({
    title: 'Capture graph projection todo',
    status: 'draft',
    source: {
      surface: 'chat',
      conversationId: 'conversation-graph-capture',
      sourceMessageId: 'message-graph-capture',
      sourceText: 'Please track graph projection todo.',
    },
  }, {
    actorRef: 'cat:boss',
    actionId: 'action-capture-graph',
    runId: 'run-graph',
  });

  assert.equal(capture.status, 'applied');

  const core = await coreStore.readCore();
  const projection = buildWorkGraphProjection(core);
  const workItem = projection.objects.find((object) => object.id === capture.result.workItemId);

  assert.equal(workItem?.kind, 'work_item');
  assert.equal(workItem?.structuralLayer, 'planning');
  assert.equal(workItem?.status, 'draft');
  assert.equal(workItem?.linkedProjectId, null);
  assert.equal(workItem?.linkedConversationId, 'conversation-graph-capture');
  assert.equal(core.projects.length, 0);
  assert.equal(core.tasks.length, 0);
  assert.equal(core.runs.length, 0);
});

test('triaged Work Items project into Work Graph with Project and Activity anchors', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const intake = createWorkIntakeDelegate({
    coreStore,
    now: () => new Date('2026-05-13T11:00:00.000Z'),
  });
  const triage = createWorkTriageDelegate({
    coreStore,
    now: () => new Date('2026-05-13T11:05:00.000Z'),
  });

  const capture = await intake.capture({
    title: 'Route Telegram todos into Cats Work',
    status: 'planned',
    kind: 'todo',
    priority: 'medium',
    source: {
      surface: 'telegram',
      conversationId: 'conversation-telegram-work',
      transportBindingId: 'binding-telegram',
      sourceMessageId: 'telegram-message-graph',
      sourceText: 'Route Telegram todos into Cats Work.',
    },
  }, {
    actorRef: 'cat:boss',
    actionId: 'action-capture-triage',
    runId: 'run-graph-triage',
  });
  assert.equal(capture.status, 'applied');

  const project = await triage.createProject({
    title: 'Telegram Intake',
    status: 'active',
    summary: 'Capture and triage owner todos from Telegram',
    primaryConversationId: 'conversation-telegram-work',
  }, {
    actorRef: 'cat:boss',
    actionId: 'action-project-create-graph',
    runId: 'run-graph-triage',
  });
  assert.equal(project.status, 'applied');

  const assign = await triage.assignWorkItemProject({
    workItemId: capture.result.workItemId,
    projectId: project.result.projectId,
    note: 'Owner asked to organize Telegram todos under this Project.',
  }, {
    actorRef: 'cat:boss',
    actionId: 'action-assign-graph',
    runId: 'run-graph-triage',
  });
  assert.equal(assign.status, 'applied');

  const update = await triage.updateWorkItem({
    workItemId: capture.result.workItemId,
    status: 'ready',
    priority: 'high',
    openQuestions: ['Which Telegram groups should be enabled first?'],
  }, {
    actorRef: 'cat:boss',
    actionId: 'action-update-graph',
    runId: 'run-graph-triage',
  });
  assert.equal(update.status, 'applied');

  const core = await coreStore.readCore();
  const projection = buildWorkGraphProjection(core);
  const byId = new Map(projection.objects.map((object) => [object.id, object]));
  const workItem = byId.get(capture.result.workItemId);
  const projectObject = byId.get(project.result.projectId);

  assert.equal(projectObject?.kind, 'project');
  assert.equal(projectObject?.status, 'active');
  assert.equal(projectObject?.linkedConversationId, 'conversation-telegram-work');
  assert.equal(workItem?.kind, 'work_item');
  assert.equal(workItem?.status, 'ready');
  assert.equal(workItem?.linkedProjectId, project.result.projectId);
  assert.equal(workItem?.linkedConversationId, 'conversation-telegram-work');
  assert.equal(core.tasks.length, 0);
  assert.equal(core.runs.length, 0);

  const activityObjects = projection.objects.filter((object) => object.kind === 'activity');
  assert.equal(activityObjects.length, 4);
  assert.ok(projection.evidenceAttachments.some((attachment) =>
    attachment.anchorObjectId === capture.result.workItemId
    && attachment.relation === 'activity',
  ));
  assert.ok(projection.evidenceAttachments.some((attachment) =>
    attachment.anchorObjectId === project.result.projectId
    && attachment.relation === 'activity',
  ));
});
