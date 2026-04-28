import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createDefaultCoreState } from '../build/server/core/model/index.js';
import {
  readTaskPlanningMetadata,
} from '../build/server/shared/taskPlanning.js';
import {
  createWorkTemplateRegistry,
  getWorkTemplate,
  listWorkTemplates,
} from '../build/server/products/work/templates/index.js';
import {
  generateWorkIntakePlan,
  normalizeWorkIntakeInput,
} from '../build/server/products/work/intake/index.js';

function createIntakeFixture() {
  const now = new Date('2026-03-29T10:00:00.000Z');
  const core = createDefaultCoreState();
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);

  return { now, core, template };
}

test('work intake generator stays on Core records and planning metadata', async () => {
  const source = await readFile(
    new URL('../src/products/work/intake/planGenerator.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /upsertCoreProject/u);
  assert.match(source, /upsertCoreWorkItem/u);
  assert.match(source, /upsertCoreTask/u);
  assert.match(source, /writeTaskPlanningMetadata/u);
  assert.doesNotMatch(
    source,
    /runtime|CatsRuntimeClient|createSession|sendMessage|runtimeBoundary/u,
  );
});

test('work template registry exposes a deterministic extension seam', () => {
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);

  const extensionTemplate = {
    ...template,
    id: 'research_spike',
    label: 'Research Spike',
  };
  const registry = createWorkTemplateRegistry([extensionTemplate, template]);

  assert.equal(registry.get('software_delivery')?.label, 'Software Delivery');
  assert.equal(registry.get('research_spike')?.label, 'Research Spike');
  assert.deepEqual(
    listWorkTemplates().map((candidate) => candidate.id),
    ['software_delivery'],
  );
  assert.throws(
    () => createWorkTemplateRegistry([template, template]),
    /Duplicate Work template id/u,
  );
});

test('generateWorkIntakePlan creates project with correct fields', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Implement auth',
      brief: 'Add OAuth2 login support',
      desiredOutcome: 'Users can log in with Google',
      repoPath: '/path/to/repo',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  assert.ok(result.plan.project);
  assert.equal(result.plan.project.title, 'Implement auth');
  assert.equal(result.plan.project.status, 'planned');
  assert.equal(result.plan.project.summary, 'Add OAuth2 login support');
  assert.equal(result.plan.project.repoPath, '/path/to/repo');

  const intakeMetadata = result.plan.project.metadata?.intake;
  assert.ok(intakeMetadata);
  assert.equal(intakeMetadata.templateId, 'software_delivery');
  assert.equal(intakeMetadata.brief, 'Add OAuth2 login support');
  assert.equal(intakeMetadata.desiredOutcome, 'Users can log in with Google');
});

test('normalizeWorkIntakeInput trims optional and required fields before Core writes', () => {
  assert.deepEqual(
    normalizeWorkIntakeInput({
      title: '  Implement auth  ',
      brief: '  Add OAuth2 login support  ',
      desiredOutcome: '  Users can log in with Google  ',
      repoPath: '  /path/to/repo  ',
      deadline: '  2026-05-01  ',
      priority: 'high',
      templateId: '  software_delivery  ',
    }),
    {
      title: 'Implement auth',
      brief: 'Add OAuth2 login support',
      desiredOutcome: 'Users can log in with Google',
      repoPath: '/path/to/repo',
      deadline: '2026-05-01',
      priority: 'high',
      templateId: 'software_delivery',
    },
  );
});

test('generateWorkIntakePlan normalizes direct product-layer intake input', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: '  Implement auth  ',
      brief: '  Add OAuth2 login support  ',
      desiredOutcome: '  Users can log in with Google  ',
      repoPath: '  /path/to/repo  ',
      templateId: '  software_delivery  ',
    },
    template,
    now,
  );

  assert.equal(result.plan.project.title, 'Implement auth');
  assert.equal(result.plan.project.summary, 'Add OAuth2 login support');
  assert.equal(result.plan.project.repoPath, '/path/to/repo');
  assert.equal(result.plan.workItem.title, 'Implement auth');
  assert.equal(result.plan.workItem.summary, 'Users can log in with Google');
  assert.equal(result.core.conversations.find((c) =>
    c.id === result.plan.project.primaryConversationId)?.title, 'Implement auth');
  assert.equal(result.plan.project.metadata?.intake?.templateId, 'software_delivery');
});

test('generateWorkIntakePlan creates work item linked to project', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Test feature',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  assert.ok(result.plan.workItem);
  assert.equal(result.plan.workItem.projectId, result.plan.project.id);
  assert.equal(result.plan.workItem.status, 'draft');
  assert.equal(result.plan.workItem.taskId, result.plan.tasks[0].id);
  const coreWorkItem = result.core.workItems.find(
    (workItem) => workItem.id === result.plan.workItem.id,
  );
  assert.equal(
    coreWorkItem?.taskId,
    result.plan.tasks[0].id,
  );
});

test('generateWorkIntakePlan creates work_thread conversation and assigns owner', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Conversation test',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  // Should have created a conversation
  const conversations = result.core.conversations.filter(
    (c) => c.kind === 'work_thread',
  );
  assert.ok(conversations.length > 0, 'should have a work_thread conversation');
  const conv = conversations[0];
  assert.equal(conv.status, 'planned');
  assert.ok(conv.participantActorIds.includes(result.core.ownerProfile.actorId));

  // Project should be linked to conversation
  assert.equal(result.plan.project.primaryConversationId, conv.id);

  // All tasks should have conversationId and owner assigned
  for (const task of result.plan.tasks) {
    assert.equal(task.conversationId, conv.id, `Task "${task.title}" should have conversationId`);
    assert.ok(
      task.assignedActorIds.includes(result.core.ownerProfile.actorId),
      `Task "${task.title}" should have owner in assignedActorIds`,
    );
    assert.equal(task.ownerActorId, result.core.ownerProfile.actorId);
  }
});

test('generateWorkIntakePlan creates tasks matching template blueprints', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Template tasks',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  assert.equal(result.plan.tasks.length, template.taskBlueprints.length);

  for (let i = 0; i < template.taskBlueprints.length; i++) {
    const blueprint = template.taskBlueprints[i];
    const task = result.plan.tasks[i];
    assert.equal(task.title, blueprint.title);
    assert.equal(task.status, 'draft');
  }
});

test('generateWorkIntakePlan sets correct planning metadata on tasks', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Planning metadata',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  for (let i = 0; i < template.taskBlueprints.length; i++) {
    const blueprint = template.taskBlueprints[i];
    const task = result.plan.tasks[i];
    const planning = readTaskPlanningMetadata(task.metadata);

    assert.equal(planning.productHint, blueprint.productHint);
    assert.equal(planning.strategyHint, blueprint.strategyHint);
    assert.equal(planning.acceptanceCriteria, blueprint.acceptanceCriteria);
  }
});

test('generateWorkIntakePlan resolves dependsOnTaskIds from blueprint keys', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Dependencies',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  const taskIdByKey = new Map();
  for (let i = 0; i < template.taskBlueprints.length; i++) {
    taskIdByKey.set(template.taskBlueprints[i].key, result.plan.tasks[i].id);
  }

  for (let i = 0; i < template.taskBlueprints.length; i++) {
    const blueprint = template.taskBlueprints[i];
    const task = result.plan.tasks[i];
    const planning = readTaskPlanningMetadata(task.metadata);

    const expectedDeps = blueprint.dependsOnKeys
      .map((key) => taskIdByKey.get(key))
      .filter((id) => id !== undefined);

    assert.deepEqual(
      planning.dependsOnTaskIds,
      expectedDeps,
      `Task "${blueprint.key}" should have correct dependsOnTaskIds`,
    );
  }
});

test('generateWorkIntakePlan stores workIntake metadata on tasks', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'WorkIntake meta',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  for (let i = 0; i < template.taskBlueprints.length; i++) {
    const blueprint = template.taskBlueprints[i];
    const task = result.plan.tasks[i];
    const workIntake = task.metadata?.workIntake;

    assert.ok(workIntake, `Task "${blueprint.key}" should have workIntake metadata`);
    assert.equal(workIntake.blueprintKey, blueprint.key);
    assert.equal(workIntake.roleKey, blueprint.roleKey);
    assert.equal(workIntake.projectId, result.plan.project.id);
    assert.equal(workIntake.workItemId, result.plan.workItem.id);
  }
});

test('generateWorkIntakePlan creates activity records', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Activities',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  assert.ok(result.plan.activities.length > 0, 'should have activity records');
  assert.ok(
    result.plan.activities.length >= template.taskBlueprints.length + 1,
    'should have at least 1 project activity + 1 per task',
  );
});

test('generateWorkIntakePlan persists initial approval placeholders on Core tasks', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Approval placeholders',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  for (const task of result.plan.tasks) {
    assert.equal(task.approval.status, 'not_requested');
    assert.equal(task.approval.requestedAt, null);
    assert.equal(task.approval.decidedAt, null);
    assert.equal(task.approval.decidedByActorId, null);
    assert.equal(task.approval.decisionAction, null);
    assert.equal(task.approval.notes, null);
  }
});

test('generateWorkIntakePlan updates core state correctly', () => {
  const { now, core, template } = createIntakeFixture();
  const originalProjectCount = core.projects.length;
  const originalTaskCount = core.tasks.length;

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'State update',
      brief: 'Brief',
      desiredOutcome: 'Outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  assert.equal(
    result.core.projects.length,
    originalProjectCount + 1,
    'should add 1 project to core',
  );
  assert.equal(
    result.core.workItems.length,
    1,
    'should add 1 work item to core',
  );
  assert.equal(
    result.core.tasks.length,
    originalTaskCount + template.taskBlueprints.length,
    'should add tasks matching blueprint count',
  );
});

test('generateWorkIntakePlan handles optional fields', () => {
  const { now, core, template } = createIntakeFixture();

  const result = generateWorkIntakePlan(
    core,
    {
      title: 'Minimal',
      brief: 'Minimal brief',
      desiredOutcome: 'Minimal outcome',
      templateId: 'software_delivery',
    },
    template,
    now,
  );

  assert.ok(result.plan.project);
  assert.equal(result.plan.project.repoPath, null);
  const intake = result.plan.project.metadata?.intake;
  assert.ok(intake);
  assert.equal(intake.deadline, undefined);
  assert.equal(intake.priority, undefined);
});
