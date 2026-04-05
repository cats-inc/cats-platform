import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreTask,
} from '../build/server/core/model/index.js';
import { writeTaskPlanningMetadata } from '../build/server/shared/taskPlanning.js';
import {
  readCodePlanFromTask,
  writeCodePlanToTask,
  updatePlanStepStatus,
  replanCodeTask,
  CODE_PLAN_MAX_STEPS,
} from '../build/server/products/code/state/planSteps.js';

function createCodeTaskFixture() {
  const now = new Date('2026-03-29T10:00:00.000Z');
  const core = createDefaultCoreState();

  const metadata = writeTaskPlanningMetadata({}, {
    productHint: 'code',
    strategyHint: 'reflexion',
  });

  const result = upsertCoreTask(core, {
    id: 'task-code-test',
    title: 'Test code task',
    status: 'in_progress',
    metadata,
  }, now);

  return { now, core: result.core, task: result.task };
}

function createSampleSteps() {
  return [
    { id: 'step-0', ordinal: 0, title: 'Analyze requirements', status: 'completed', detail: null, startedAt: null, completedAt: null },
    { id: 'step-1', ordinal: 1, title: 'Implement feature', status: 'in_progress', detail: 'Working on core module', startedAt: null, completedAt: null },
    { id: 'step-2', ordinal: 2, title: 'Write tests', status: 'not_started', detail: null, startedAt: null, completedAt: null },
    { id: 'step-3', ordinal: 3, title: 'Review and commit', status: 'not_started', detail: null, startedAt: null, completedAt: null },
  ];
}

test('readCodePlanFromTask returns null when no plan exists', () => {
  const { task } = createCodeTaskFixture();
  const plan = readCodePlanFromTask(task);
  assert.equal(plan, null);
});

test('writeCodePlanToTask creates a plan and increments version', () => {
  const { core, now } = createCodeTaskFixture();
  const steps = createSampleSteps();

  const result = writeCodePlanToTask(core, 'task-code-test', steps, now);

  assert.equal(result.plan.taskId, 'task-code-test');
  assert.equal(result.plan.steps.length, 4);
  assert.equal(result.plan.version, 1);
  assert.equal(result.plan.replanCount, 0);
  assert.equal(result.plan.steps[0].title, 'Analyze requirements');
  assert.equal(result.plan.steps[1].status, 'in_progress');
});

test('writeCodePlanToTask preserves existing planning metadata', () => {
  const { core, now } = createCodeTaskFixture();
  const steps = createSampleSteps();

  const result = writeCodePlanToTask(core, 'task-code-test', steps, now);
  const task = result.core.tasks.find((t) => t.id === 'task-code-test');

  assert.ok(task.metadata.planning, 'planning metadata should be preserved');
  assert.equal(task.metadata.planning.productHint, 'code');
  assert.equal(task.metadata.planning.strategyHint, 'reflexion');
  assert.ok(task.metadata.codePlan, 'codePlan metadata should exist');
});

test('readCodePlanFromTask reads a previously written plan', () => {
  const { core, now } = createCodeTaskFixture();
  const steps = createSampleSteps();

  const writeResult = writeCodePlanToTask(core, 'task-code-test', steps, now);
  const task = writeResult.core.tasks.find((t) => t.id === 'task-code-test');
  const plan = readCodePlanFromTask(task);

  assert.ok(plan);
  assert.equal(plan.steps.length, 4);
  assert.equal(plan.version, 1);
});

test('updatePlanStepStatus transitions a step and sets timestamp', () => {
  const { core, now } = createCodeTaskFixture();
  const steps = createSampleSteps();
  const writeResult = writeCodePlanToTask(core, 'task-code-test', steps, now);

  const later = new Date('2026-03-29T11:00:00.000Z');
  const result = updatePlanStepStatus(
    writeResult.core,
    'task-code-test',
    'step-2',
    'in_progress',
    later,
  );

  const step = result.plan.steps.find((s) => s.id === 'step-2');
  assert.equal(step.status, 'in_progress');
  assert.equal(step.startedAt, later.toISOString());
  assert.equal(result.plan.version, 2);
});

test('updatePlanStepStatus sets completedAt when completed', () => {
  const { core, now } = createCodeTaskFixture();
  const steps = createSampleSteps();
  const writeResult = writeCodePlanToTask(core, 'task-code-test', steps, now);

  const later = new Date('2026-03-29T12:00:00.000Z');
  const result = updatePlanStepStatus(
    writeResult.core,
    'task-code-test',
    'step-1',
    'completed',
    later,
  );

  const step = result.plan.steps.find((s) => s.id === 'step-1');
  assert.equal(step.status, 'completed');
  assert.equal(step.completedAt, later.toISOString());
});

test('updatePlanStepStatus throws for missing task', () => {
  const { core } = createCodeTaskFixture();
  assert.throws(
    () => updatePlanStepStatus(core, 'nonexistent', 'step-0', 'completed'),
    /Task not found/u,
  );
});

test('updatePlanStepStatus throws for missing plan', () => {
  const { core } = createCodeTaskFixture();
  assert.throws(
    () => updatePlanStepStatus(core, 'task-code-test', 'step-0', 'completed'),
    /No plan found/u,
  );
});

test('replanCodeTask replaces steps and increments replanCount', () => {
  const { core, now } = createCodeTaskFixture();
  const steps = createSampleSteps();
  const writeResult = writeCodePlanToTask(core, 'task-code-test', steps, now);

  const newSteps = [
    { id: 'new-0', ordinal: 0, title: 'Rethink approach', status: 'not_started', detail: null, startedAt: null, completedAt: null },
    { id: 'new-1', ordinal: 1, title: 'Rebuild', status: 'not_started', detail: null, startedAt: null, completedAt: null },
  ];

  const later = new Date('2026-03-29T13:00:00.000Z');
  const result = replanCodeTask(writeResult.core, 'task-code-test', newSteps, later);

  assert.equal(result.plan.steps.length, 2);
  assert.equal(result.plan.replanCount, 1);
  assert.equal(result.plan.version, 2);
  assert.equal(result.plan.steps[0].title, 'Rethink approach');
});

test('plan steps are capped at CODE_PLAN_MAX_STEPS', () => {
  const { core, now } = createCodeTaskFixture();
  const manySteps = Array.from({ length: CODE_PLAN_MAX_STEPS + 20 }, (_, i) => ({
    id: `step-${i}`,
    ordinal: i,
    title: `Step ${i}`,
    status: 'not_started',
    detail: null,
    startedAt: null,
    completedAt: null,
  }));

  const result = writeCodePlanToTask(core, 'task-code-test', manySteps, now);
  assert.equal(result.plan.steps.length, CODE_PLAN_MAX_STEPS);
});

test('readCodePlanFromTask normalizes malformed step data', () => {
  const { core, now } = createCodeTaskFixture();
  const result = upsertCoreTask(core, {
    id: 'task-code-test',
    title: 'Test code task',
    metadata: {
      ...core.tasks.find((t) => t.id === 'task-code-test')?.metadata,
      codePlan: {
        steps: [
          { title: 'Valid step' },
          { title: '' },
          null,
          42,
          { title: 'Another valid', status: 'bogus' },
        ],
        version: 3,
      },
    },
  }, now);

  const task = result.core.tasks.find((t) => t.id === 'task-code-test');
  const plan = readCodePlanFromTask(task);

  assert.ok(plan);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].title, 'Valid step');
  assert.equal(plan.steps[0].status, 'not_started');
  assert.equal(plan.steps[1].title, 'Another valid');
  assert.equal(plan.steps[1].status, 'not_started');
  assert.equal(plan.version, 3);
});

