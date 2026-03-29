import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../dist-server/core/model/index.js';
import {
  readTaskPlanningMetadata,
} from '../dist-server/shared/taskPlanning.js';
import {
  getWorkTemplate,
} from '../dist-server/products/work/templates/index.js';
import {
  generateWorkIntakePlan,
} from '../dist-server/products/work/intake/index.js';

function createIntakeFixture() {
  const now = new Date('2026-03-29T10:00:00.000Z');
  const core = createDefaultCoreState();
  const template = getWorkTemplate('software_delivery');
  assert.ok(template);

  return { now, core, template };
}

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
