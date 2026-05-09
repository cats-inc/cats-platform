import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreActor,
  upsertCoreArtifact,
  upsertCoreConversation,
  upsertCoreMission,
  upsertCoreRun,
  upsertCoreTask,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import { buildMyCatsProjection } from '../src/core/myCatsProjection.js';

function seedAgent(coreInput: ReturnType<typeof createDefaultCoreState>, options: {
  id: string;
  name: string;
  kind?: 'orchestrator' | 'worker' | 'owner' | 'bot' | 'stakeholder' | 'resource';
  status?: 'active' | 'archived';
  createdAt?: string;
}): ReturnType<typeof createDefaultCoreState> {
  return upsertCoreActor(
    coreInput,
    {
      id: options.id,
      name: options.name,
      kind: options.kind ?? 'worker',
      status: options.status ?? 'active',
      createdAt: options.createdAt ?? '2026-04-14T22:00:00.000Z',
    },
    new Date(options.createdAt ?? '2026-04-14T22:00:00.000Z'),
  ).core;
}

test('buildMyCatsProjection only surfaces the default seed actors with zero work for a fresh core', () => {
  const projection = buildMyCatsProjection(createDefaultCoreState());

  // createDefaultCoreState seeds the platform owner and global orchestrator.
  // No conversations, missions, or runs exist, so both should land with zero
  // metrics across every lens.
  assert.equal(projection.summary.totalAgents, 2);
  assert.equal(projection.summary.agentsWithActiveMissions, 0);
  assert.equal(projection.summary.agentsWithCodeRuns, 0);
  for (const entry of projection.agents) {
    assert.equal(entry.chat.conversationCount, 0);
    assert.equal(entry.work.totalMissionCount, 0);
    assert.equal(entry.work.activeMissionCount, 0);
    assert.equal(entry.code.taskCount, 0);
    assert.equal(entry.code.runCount, 0);
    assert.equal(entry.code.artifactCount, 0);
  }
});

test('buildMyCatsProjection counts chat conversation participation per agent', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, { id: 'agent-cat-a', name: 'CatA' });
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-1',
      title: 'Direct chat',
      kind: 'direct_message',
      participantActorIds: ['agent-cat-a'],
      lastMessageAt: '2026-04-14T22:30:00.000Z',
    },
    new Date('2026-04-14T22:30:00.000Z'),
  ).core;
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-2',
      title: 'Group chat',
      kind: 'chat_channel',
      participantActorIds: ['agent-cat-a', 'agent-cat-b'],
      lastMessageAt: '2026-04-14T23:00:00.000Z',
    },
    new Date('2026-04-14T23:00:00.000Z'),
  ).core;
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-3',
      title: 'Without CatA',
      kind: 'chat_channel',
      participantActorIds: ['agent-cat-b'],
      lastMessageAt: '2026-04-14T23:30:00.000Z',
    },
    new Date('2026-04-14T23:30:00.000Z'),
  ).core;

  const projection = buildMyCatsProjection(core);
  const entry = projection.agents.find((candidate) => candidate.agent.id === 'agent-cat-a');

  assert.ok(entry, 'expected CatA entry');
  assert.equal(entry?.chat.conversationCount, 2);
  assert.equal(entry?.chat.lastConversationActivityAt, '2026-04-14T23:00:00.000Z');
  assert.equal(entry?.work.totalMissionCount, 0);
  assert.equal(entry?.code.taskCount, 0);
});

test('buildMyCatsProjection summarizes assigned work items and active missions', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, { id: 'agent-cat-a', name: 'CatA', kind: 'worker' });
  core = seedAgent(core, { id: 'agent-owner', name: 'Owner', kind: 'owner' });

  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-1',
      title: 'Owned by CatA',
      ownerActorId: 'agent-cat-a',
      assignedActorIds: ['agent-cat-a'],
      createdAt: '2026-04-14T22:00:00.000Z',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreWorkItem(
    core,
    {
      id: 'work-item-2',
      title: 'Assigned to CatA',
      ownerActorId: 'agent-owner',
      assignedActorIds: ['agent-cat-a'],
      createdAt: '2026-04-14T22:01:00.000Z',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  core = upsertCoreMission(
    core,
    {
      id: 'mission-running',
      title: 'Running mission',
      assignedAgentId: 'agent-cat-a',
      status: 'running',
      managedWorkId: 'work-item-1',
      createdAt: '2026-04-14T22:05:00.000Z',
    },
    new Date('2026-04-14T22:05:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-completed',
      title: 'Done mission',
      assignedAgentId: 'agent-cat-a',
      status: 'completed',
      createdAt: '2026-04-14T22:10:00.000Z',
    },
    new Date('2026-04-14T22:10:00.000Z'),
  ).core;
  core = upsertCoreMission(
    core,
    {
      id: 'mission-other',
      title: 'Other agent mission',
      assignedAgentId: 'agent-owner',
      status: 'running',
      createdAt: '2026-04-14T22:15:00.000Z',
    },
    new Date('2026-04-14T22:15:00.000Z'),
  ).core;

  const projection = buildMyCatsProjection(core);
  const entry = projection.agents.find((candidate) => candidate.agent.id === 'agent-cat-a');

  assert.ok(entry, 'expected CatA entry');
  assert.equal(entry?.work.ownedWorkItemCount, 1);
  assert.equal(entry?.work.assignedWorkItemCount, 2);
  assert.equal(entry?.work.totalMissionCount, 2);
  assert.equal(entry?.work.activeMissionCount, 1);
  assert.equal(projection.summary.agentsWithActiveMissions, 2);
});

test('buildMyCatsProjection scopes code metrics to code-thread conversations', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, { id: 'agent-cat-a', name: 'CatA', kind: 'worker' });
  core = seedAgent(core, { id: 'agent-owner', name: 'Owner', kind: 'owner' });

  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-code-1',
      title: 'Code thread',
      kind: 'code_thread',
      participantActorIds: ['agent-cat-a'],
      lastMessageAt: '2026-04-15T08:00:00.000Z',
    },
    new Date('2026-04-15T08:00:00.000Z'),
  ).core;
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-chat-1',
      title: 'Chat channel',
      kind: 'chat_channel',
      participantActorIds: ['agent-cat-a'],
      lastMessageAt: '2026-04-15T08:00:00.000Z',
    },
    new Date('2026-04-15T08:00:00.000Z'),
  ).core;

  core = upsertCoreTask(
    core,
    {
      id: 'task-code-1',
      title: 'Code task',
      conversationId: 'conversation-code-1',
      ownerActorId: 'agent-owner',
      orchestratorActorId: null,
      assignedActorIds: ['agent-cat-a'],
      createdAt: '2026-04-15T08:05:00.000Z',
    },
    new Date('2026-04-15T08:05:00.000Z'),
  ).core;
  core = upsertCoreTask(
    core,
    {
      id: 'task-chat-1',
      title: 'Chat task',
      conversationId: 'conversation-chat-1',
      ownerActorId: 'agent-owner',
      orchestratorActorId: null,
      assignedActorIds: ['agent-cat-a'],
      createdAt: '2026-04-15T08:06:00.000Z',
    },
    new Date('2026-04-15T08:06:00.000Z'),
  ).core;

  core = upsertCoreRun(
    core,
    {
      id: 'run-code-1',
      title: 'Code run',
      taskId: 'task-code-1',
      conversationId: 'conversation-code-1',
      status: 'completed',
      orchestratorActorId: 'agent-cat-a',
      createdAt: '2026-04-15T08:10:00.000Z',
      completedAt: '2026-04-15T08:20:00.000Z',
    },
    new Date('2026-04-15T08:20:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-chat-1',
      title: 'Chat run (should be excluded)',
      taskId: 'task-chat-1',
      conversationId: 'conversation-chat-1',
      status: 'completed',
      orchestratorActorId: 'agent-cat-a',
      createdAt: '2026-04-15T08:11:00.000Z',
    },
    new Date('2026-04-15T08:11:00.000Z'),
  ).core;

  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-code-1',
      title: 'Code artifact',
      kind: 'build',
      taskId: 'task-code-1',
      conversationId: 'conversation-code-1',
      runId: 'run-code-1',
      createdAt: '2026-04-15T08:25:00.000Z',
    },
    new Date('2026-04-15T08:25:00.000Z'),
  ).core;
  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-chat-1',
      title: 'Chat artifact (should be excluded)',
      kind: 'document',
      conversationId: 'conversation-chat-1',
      createdAt: '2026-04-15T08:26:00.000Z',
    },
    new Date('2026-04-15T08:26:00.000Z'),
  ).core;

  const projection = buildMyCatsProjection(core);
  const entry = projection.agents.find((candidate) => candidate.agent.id === 'agent-cat-a');

  assert.ok(entry, 'expected CatA entry');
  assert.equal(entry?.code.taskCount, 1);
  assert.equal(entry?.code.runCount, 1);
  assert.equal(entry?.code.artifactCount, 1);
  assert.equal(entry?.code.lastRunActivityAt, '2026-04-15T08:20:00.000Z');
  // agent-cat-a (assigned + orchestrator) and agent-owner (owner of the
  // code task) both pick up the run via code-conversation scoping.
  assert.equal(projection.summary.agentsWithCodeRuns, 2);
});

test('buildMyCatsProjection counts run-only code artifacts under the run orchestrator', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, { id: 'agent-builder', name: 'BuilderCat', kind: 'worker' });
  core = seedAgent(core, { id: 'agent-bystander', name: 'BystanderCat', kind: 'worker' });
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-code-1',
      title: 'Code thread',
      kind: 'code_thread',
      participantActorIds: ['agent-builder'],
    },
    new Date('2026-04-15T08:00:00.000Z'),
  ).core;
  core = upsertCoreRun(
    core,
    {
      id: 'run-builder',
      title: 'Builder run',
      status: 'running',
      conversationId: 'conversation-code-1',
      orchestratorActorId: 'agent-builder',
    },
    new Date('2026-04-15T08:01:00.000Z'),
  ).core;
  // Run-only artifact (no taskId, no conversationId) — the legitimate
  // shape produced by code artifact materialization that previously
  // never reached any agent because there was no anchor to bridge on.
  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-run-only',
      title: 'Run-only build artifact',
      kind: 'build',
      runId: 'run-builder',
      taskId: null,
      conversationId: null,
      createdAt: '2026-04-15T08:02:00.000Z',
    },
    new Date('2026-04-15T08:02:00.000Z'),
  ).core;

  const projection = buildMyCatsProjection(core);
  const builder = projection.agents.find((entry) => entry.agent.id === 'agent-builder');
  const bystander = projection.agents.find((entry) => entry.agent.id === 'agent-bystander');

  // BuilderCat owns the run that produced the artifact.
  assert.equal(builder?.code.artifactCount, 1);
  // BystanderCat is unrelated; the run-only attribution should NOT
  // leak across agents.
  assert.equal(bystander?.code.artifactCount, 0);
});

test('buildMyCatsProjection scopes conversation-anchored code artifacts to actual participants', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, { id: 'agent-builder', name: 'BuilderCat', kind: 'worker' });
  core = seedAgent(core, { id: 'agent-bystander', name: 'BystanderCat', kind: 'worker' });

  // Code conversation that only BuilderCat participates in.
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-code-builder',
      title: 'Builder code thread',
      kind: 'code_thread',
      participantActorIds: ['agent-builder'],
      lastMessageAt: '2026-04-15T08:00:00.000Z',
    },
    new Date('2026-04-15T08:00:00.000Z'),
  ).core;

  // Artifact only anchored to the conversation (no task linkage), so
  // it can ONLY land in artifactCount via the conversation bridge.
  core = upsertCoreArtifact(
    core,
    {
      id: 'artifact-code-build',
      title: 'Conversation-only build artifact',
      kind: 'build',
      conversationId: 'conversation-code-builder',
      createdAt: '2026-04-15T08:30:00.000Z',
    },
    new Date('2026-04-15T08:30:00.000Z'),
  ).core;

  const projection = buildMyCatsProjection(core);
  const builder = projection.agents.find((entry) => entry.agent.id === 'agent-builder');
  const bystander = projection.agents.find((entry) => entry.agent.id === 'agent-bystander');

  assert.equal(builder?.code.artifactCount, 1);
  // Critical regression guard: bystander does not participate in the
  // code conversation, so the artifact must NOT show up on their
  // metrics.
  assert.equal(bystander?.code.artifactCount, 0);
});

test('buildMyCatsProjection filters by agentIds and hasActiveMission, sorts by lastActivityAt', () => {
  let core = createDefaultCoreState();
  core = seedAgent(core, {
    id: 'agent-old',
    name: 'OldCat',
    kind: 'worker',
    createdAt: '2026-04-13T22:00:00.000Z',
  });
  core = seedAgent(core, {
    id: 'agent-active',
    name: 'ActiveCat',
    kind: 'worker',
    createdAt: '2026-04-13T22:00:00.000Z',
  });
  core = seedAgent(core, {
    id: 'agent-idle',
    name: 'IdleCat',
    kind: 'worker',
    createdAt: '2026-04-13T22:00:00.000Z',
  });

  core = upsertCoreMission(
    core,
    {
      id: 'mission-active',
      title: 'Active',
      assignedAgentId: 'agent-active',
      status: 'running',
      createdAt: '2026-04-14T22:00:00.000Z',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-old',
      title: 'Old chat',
      kind: 'chat_channel',
      participantActorIds: ['agent-old'],
      lastMessageAt: '2026-04-14T20:00:00.000Z',
    },
    new Date('2026-04-14T20:00:00.000Z'),
  ).core;
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-active',
      title: 'Active chat',
      kind: 'chat_channel',
      participantActorIds: ['agent-active'],
      lastMessageAt: '2026-04-15T01:00:00.000Z',
    },
    new Date('2026-04-15T01:00:00.000Z'),
  ).core;

  const filtered = buildMyCatsProjection(core, {
    agentIds: ['agent-active', 'agent-idle'],
  });
  assert.equal(filtered.agents.length, 2);
  assert.deepEqual(
    filtered.agents.map((entry) => entry.agent.id),
    ['agent-active', 'agent-idle'],
  );

  const onlyActive = buildMyCatsProjection(core, { hasActiveMission: true });
  assert.equal(onlyActive.agents.length, 1);
  assert.equal(onlyActive.agents[0]?.agent.id, 'agent-active');

  const sortedAll = buildMyCatsProjection(core, {
    agentIds: ['agent-active', 'agent-old', 'agent-idle'],
  });
  assert.deepEqual(
    sortedAll.agents.map((entry) => entry.agent.id),
    ['agent-active', 'agent-old', 'agent-idle'],
  );
});
