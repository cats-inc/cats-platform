import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_CAPTURE_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
} from '../src/products/work/shared/workToolSurface.js';
import {
  createPhaseScopedWorkToolObservation,
} from '../src/products/work/shared/workToolObservation.js';

function toolNames(input: ReturnType<typeof createPhaseScopedWorkToolObservation>): string[] {
  return input.descriptors.map((descriptor) => descriptor.manifest.name);
}

test('Work tool observation exposes only read-only triage tools under read-only policy', () => {
  const observation = createPhaseScopedWorkToolObservation({
    phase: 'triage',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'read_only',
    policyToolScope: 'read_only',
  });

  assert.deepEqual(toolNames(observation), [WORK_PROJECT_LOOKUP_TOOL]);
  assert.match(observation.descriptors[0]?.reason ?? '', /without writing Core/u);
  assert.ok(observation.invariants.some((entry) => entry.includes('must not claim completion')));
});

test('Work tool observation exposes bounded triage writes when policy grants narrow-write', () => {
  const observation = createPhaseScopedWorkToolObservation({
    phase: 'triage',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.deepEqual(toolNames(observation), [
    WORK_ITEM_ASSIGN_PROJECT_TOOL,
    WORK_ITEM_UPDATE_TOOL,
    WORK_PROJECT_CREATE_TOOL,
    WORK_PROJECT_LOOKUP_TOOL,
  ]);
});

test('Work tool observation keeps execution preparation Boss-only and approval-safe', () => {
  const strongObservation = createPhaseScopedWorkToolObservation({
    phase: 'execution_preparation',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });
  const bossObservation = createPhaseScopedWorkToolObservation({
    phase: 'execution_preparation',
    capabilityProfile: 'boss_cat',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.deepEqual(toolNames(strongObservation), []);
  assert.deepEqual(toolNames(bossObservation), [
    WORK_ITEM_PREPARE_EXECUTION_TOOL,
    WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  ]);
  assert.ok(bossObservation.invariants.some((entry) =>
    entry.includes('pending-approval Tasks') && entry.includes('must not create Runs'),
  ));
});

test('Work tool observation exposes local external binding without active sync', () => {
  const observation = createPhaseScopedWorkToolObservation({
    phase: 'external_tracker_binding',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.deepEqual(toolNames(observation), [WORK_EXTERNAL_LINK_ISSUE_TOOL]);
  assert.ok(observation.invariants.some((entry) =>
    entry.includes('local binding metadata only'),
  ));
  assert.ok(observation.invariants.some((entry) =>
    entry.includes('bidirectional sync'),
  ));
});

test('Work tool observation can be disabled by caller', () => {
  const observation = createPhaseScopedWorkToolObservation({
    enabled: false,
    phase: 'intake',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.deepEqual(observation, {
    descriptors: [],
    invariants: [],
  });
});
