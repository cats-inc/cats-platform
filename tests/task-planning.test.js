import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTaskAssignmentLifecycle,
  checkoutTaskExecution,
} from '../dist-server/core/taskLifecycle.js';
import {
  createDefaultCoreState,
  upsertCoreTask,
  upsertCoreWorkItem,
} from '../dist-server/core/model/index.js';
import {
  buildTaskRuntimeExecutionRequest,
} from '../dist-server/shared/taskExecutionBridge.js';
import {
  patchTaskPlanningMetadata,
  readTaskPlanningMetadata,
  resolveDefaultTaskStrategy,
  resolveEffectiveTaskStrategy,
  writeTaskPlanningMetadata,
} from '../dist-server/shared/taskPlanning.js';

function createTaskBridgeFixture() {
  const now = new Date('2026-03-26T02:00:00.000Z');
  const nowIso = now.toISOString();
  const core = createDefaultCoreState();

  core.conversations.push({
    id: 'conversation-chat-bridge',
    title: 'Bridge task conversation',
    kind: 'chat_channel',
    status: 'active',
    participantActorIds: ['actor-owner', 'actor-cat-bridge'],
    sourceChannelId: 'channel-bridge',
    repoPath: null,
    responseLanguage: 'en',
    createdAt: nowIso,
    updatedAt: nowIso,
    lastMessageAt: null,
  });

  const taskWrite = upsertCoreTask(
    core,
    {
      id: 'task-bridge',
      title: 'Bridge task execution metadata',
      status: 'approved',
      conversationId: 'conversation-chat-bridge',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-cat-bridge'],
      metadata: writeTaskPlanningMetadata(
        {},
        {
          strategyHint: 'tree_of_thoughts',
          acceptanceCriteria: 'Tests pass and operator summary is updated.',
          strategyContext: {
            phase: 'review',
            strict: true,
          },
          dependsOnTaskIds: ['task-parent'],
          productHint: 'code',
          transfer: {
            suggestedProduct: 'code',
            rationale: 'Implementation should land in Cats Code.',
          },
        },
      ),
    },
    now,
  );

  const workItemWrite = upsertCoreWorkItem(
    taskWrite.core,
    {
      id: 'work-item-bridge',
      title: 'Bridge work item',
      status: 'ready',
      conversationId: 'conversation-chat-bridge',
      taskId: taskWrite.task.id,
      parentWorkItemId: null,
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-cat-bridge'],
      summary: 'Work item mapped to the bridge task.',
      createdAt: nowIso,
      metadata: {
        source: 'test-fixture',
      },
    },
    now,
  );

  return {
    now,
    core: workItemWrite.core,
    task: workItemWrite.core.tasks.find((candidate) => candidate.id === taskWrite.task.id),
  };
}

test('planning metadata helpers normalize malformed values and preserve unrelated metadata', () => {
  const metadata = {
    preserved: 'value',
    planning: {
      strategyHint: '  reflexion  ',
      acceptanceCriteria: '   ',
      strategyContext: {
        phase: 'plan',
      },
      dependsOnTaskIds: [' task-a ', '', 'task-a', 1],
      productHint: 'code',
      transfer: {
        suggestedProduct: 'work',
        rationale: '  hand off to work  ',
      },
    },
  };

  assert.deepEqual(readTaskPlanningMetadata(metadata), {
    strategyHint: 'reflexion',
    acceptanceCriteria: null,
    strategyContext: {
      phase: 'plan',
    },
    dependsOnTaskIds: ['task-a'],
    productHint: 'code',
    transfer: {
      suggestedProduct: 'work',
      rationale: 'hand off to work',
    },
  });

  const patched = patchTaskPlanningMetadata(metadata, {
    strategyHint: null,
    acceptanceCriteria: 'Ship it',
    dependsOnTaskIds: [' task-b ', 'task-b'],
    transfer: null,
  });

  assert.deepEqual(patched, {
    preserved: 'value',
    planning: {
      acceptanceCriteria: 'Ship it',
      strategyContext: {
        phase: 'plan',
      },
      dependsOnTaskIds: ['task-b'],
      productHint: 'code',
    },
  });
});

test('default strategy resolution prefers task strategy hints over product defaults', () => {
  assert.equal(resolveDefaultTaskStrategy('chat'), 'react');
  assert.equal(resolveDefaultTaskStrategy('work'), 'pdca');
  assert.equal(resolveDefaultTaskStrategy('code'), 'reflexion');

  assert.equal(
    resolveEffectiveTaskStrategy('work', { strategyHint: null }),
    'pdca',
  );
  assert.equal(
    resolveEffectiveTaskStrategy('code', { strategyHint: 'tree_of_thoughts' }),
    'tree_of_thoughts',
  );
});

test('task runtime bridge request includes planning metadata and opaque correlation ids', () => {
  const fixture = createTaskBridgeFixture();
  assert.ok(fixture.task);

  const request = buildTaskRuntimeExecutionRequest({
    core: fixture.core,
    task: fixture.task,
    product: 'chat',
  });

  assert.deepEqual(request, {
    requestedStrategy: 'tree_of_thoughts',
    acceptanceCriteria: 'Tests pass and operator summary is updated.',
    strategyContext: {
      phase: 'review',
      strict: true,
    },
    correlation: {
      taskId: 'task-bridge',
      conversationId: 'conversation-chat-bridge',
      workItemId: 'work-item-bridge',
      product: 'chat',
    },
  });
});

test('task runtime bridge falls back to the product default when planning metadata is absent', () => {
  const now = new Date('2026-03-26T03:00:00.000Z');
  const core = createDefaultCoreState();
  const taskWrite = upsertCoreTask(
    core,
    {
      id: 'task-chat-default',
      title: 'Chat default strategy',
      status: 'approved',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-cat-default'],
      metadata: {},
    },
    now,
  );

  const request = buildTaskRuntimeExecutionRequest({
    core: taskWrite.core,
    task: taskWrite.task,
    product: 'chat',
  });

  assert.deepEqual(request, {
    requestedStrategy: 'react',
    correlation: {
      taskId: 'task-chat-default',
      product: 'chat',
    },
  });
});

test('task runtime bridge resolves product defaults from planning handoff metadata when no explicit product is supplied', () => {
  const now = new Date('2026-03-26T03:30:00.000Z');
  const core = createDefaultCoreState();

  const workTaskWrite = upsertCoreTask(
    core,
    {
      id: 'task-work-default',
      title: 'Work default strategy',
      status: 'approved',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-worker'],
      metadata: writeTaskPlanningMetadata(
        {},
        {
          productHint: 'work',
        },
      ),
    },
    now,
  );

  const workRequest = buildTaskRuntimeExecutionRequest({
    core: workTaskWrite.core,
    task: workTaskWrite.task,
  });
  assert.deepEqual(workRequest, {
    requestedStrategy: 'pdca',
    correlation: {
      taskId: 'task-work-default',
      product: 'work',
    },
  });

  const codeTaskWrite = upsertCoreTask(
    workTaskWrite.core,
    {
      id: 'task-code-default',
      title: 'Code default strategy',
      status: 'approved',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-coder'],
      metadata: writeTaskPlanningMetadata(
        {},
        {
          transfer: {
            suggestedProduct: 'code',
            rationale: 'Implementation should continue in Cats Code.',
          },
        },
      ),
    },
    now,
  );

  const codeRequest = buildTaskRuntimeExecutionRequest({
    core: codeTaskWrite.core,
    task: codeTaskWrite.task,
  });
  assert.deepEqual(codeRequest, {
    requestedStrategy: 'reflexion',
    correlation: {
      taskId: 'task-code-default',
      product: 'code',
    },
  });
});

test('task lifecycle sends additive runtime bridge fields without changing checkout semantics', async () => {
  const fixture = createTaskBridgeFixture();
  assert.ok(fixture.task);
  const executionRequest = buildTaskRuntimeExecutionRequest({
    core: fixture.core,
    task: fixture.task,
    product: 'chat',
  });
  const wakeupInputs = [];

  const assignment = await applyTaskAssignmentLifecycle({
    core: fixture.core,
    previousTask: {
      ...fixture.task,
      status: 'draft',
      assignedActorIds: [],
    },
    task: fixture.task,
    executionRequest,
    executionLocator: {
      resolveTaskConversation() {
        return {
          orchestratorActorId: 'actor-orchestrator-global',
          orchestratorSessionId: null,
          participants: [
            {
              actorId: 'actor-cat-bridge',
              status: 'active',
              sessionId: 'session-bridge',
            },
          ],
        };
      },
    },
    runtimeClient: {
      async createWakeup(input) {
        wakeupInputs.push(input);
        return {
          request: {
            id: 'wakeup-bridge',
            scheduleAt: input.scheduleAt ?? null,
            target: input.target,
            metadata: input.metadata ?? {},
          },
          coalesced: false,
        };
      },
    },
    now: fixture.now,
  });

  assert.equal(wakeupInputs.length, 1);
  assert.equal(wakeupInputs[0].requestedStrategy, 'tree_of_thoughts');
  assert.equal(
    wakeupInputs[0].acceptanceCriteria,
    'Tests pass and operator summary is updated.',
  );
  assert.deepEqual(wakeupInputs[0].strategyContext, {
    phase: 'review',
    strict: true,
  });
  assert.deepEqual(wakeupInputs[0].correlation, {
    taskId: 'task-bridge',
    conversationId: 'conversation-chat-bridge',
    workItemId: 'work-item-bridge',
    product: 'chat',
  });
  assert.equal(
    assignment.task.metadata.taskLifecycle.execution.requestedStrategy,
    'tree_of_thoughts',
  );

  const checkout = checkoutTaskExecution({
    core: fixture.core,
    taskId: 'task-bridge',
    actorId: 'actor-cat-bridge',
    sessionId: 'session-bridge',
    executionRequest,
    now: fixture.now,
  });

  assert.equal(checkout.task.status, 'in_progress');
  assert.equal(checkout.run.status, 'running');
  assert.deepEqual(checkout.run.metadata.execution, {
    requestedStrategy: 'tree_of_thoughts',
    acceptanceCriteria: 'Tests pass and operator summary is updated.',
    strategyContext: {
      phase: 'review',
      strict: true,
    },
    correlation: {
      taskId: 'task-bridge',
      conversationId: 'conversation-chat-bridge',
      workItemId: 'work-item-bridge',
      product: 'chat',
    },
  });
});
