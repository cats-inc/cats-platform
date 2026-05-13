import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_AGENT_MAX_TOOL_INPUT_HINT_LENGTH,
  PROVIDER_AGENT_MAX_TOOL_INPUT_HINTS,
} from '../src/platform/orchestration/index.js';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_CAPTURE_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
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

function assertBoundedInputHints(
  observation: ReturnType<typeof createPhaseScopedWorkToolObservation>,
): void {
  for (const descriptor of observation.descriptors) {
    assert.ok(
      descriptor.inputHints && descriptor.inputHints.length > 0,
      `${descriptor.manifest.name} should carry provider-agent input hints`,
    );
    assert.ok(descriptor.inputHints.length <= PROVIDER_AGENT_MAX_TOOL_INPUT_HINTS);

    for (const hint of descriptor.inputHints) {
      assert.ok(hint.trim().length > 0);
      assert.ok(hint.length <= PROVIDER_AGENT_MAX_TOOL_INPUT_HINT_LENGTH);
    }
  }
}

test('Work tool observation keeps intake proposal read-only and capture narrow-write', () => {
  const readOnlyObservation = createPhaseScopedWorkToolObservation({
    phase: 'intake',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'read_only',
    policyToolScope: 'read_only',
  });
  const narrowWriteObservation = createPhaseScopedWorkToolObservation({
    phase: 'intake',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.deepEqual(toolNames(readOnlyObservation), [WORK_ITEM_PROPOSE_SPLIT_TOOL]);
  assert.deepEqual(toolNames(narrowWriteObservation), [
    WORK_ITEM_CAPTURE_TOOL,
    WORK_ITEM_PROPOSE_SPLIT_TOOL,
  ]);
  assertBoundedInputHints(readOnlyObservation);
  assertBoundedInputHints(narrowWriteObservation);
  assert.ok(readOnlyObservation.invariants.some((entry) =>
    entry.includes('must not claim capture or persistence'),
  ));
  assert.ok(narrowWriteObservation.invariants.some((entry) =>
    entry.includes(WORK_ITEM_CAPTURE_TOOL)
    && entry.includes('must not create Tasks, Runs, or runtime sessions'),
  ));
});

test('Work tool observation exposes only read-only triage tools under read-only policy', () => {
  const observation = createPhaseScopedWorkToolObservation({
    phase: 'triage',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'read_only',
    policyToolScope: 'read_only',
  });

  assert.deepEqual(toolNames(observation), [WORK_PROJECT_LOOKUP_TOOL]);
  assertBoundedInputHints(observation);
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
  assertBoundedInputHints(observation);
  const updateDescriptor = observation.descriptors.find((descriptor) =>
    descriptor.manifest.name === WORK_ITEM_UPDATE_TOOL);
  const assignDescriptor = observation.descriptors.find((descriptor) =>
    descriptor.manifest.name === WORK_ITEM_ASSIGN_PROJECT_TOOL);
  assert.ok(updateDescriptor?.inputHints?.some((entry) =>
    entry.includes('status?: "draft" | "planned" | "ready" | "blocked"'),
  ));
  assert.ok(updateDescriptor?.inputHints?.some((entry) =>
    entry.includes('re-resolves workItemId'),
  ));
  assert.ok(assignDescriptor?.inputHints?.some((entry) =>
    entry.includes('note?: string') && entry.includes('workItemId and projectId'),
  ));
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
  assertBoundedInputHints(bossObservation);
  assert.ok(bossObservation.invariants.some((entry) =>
    entry.includes('pending-approval Tasks') && entry.includes('must not create Runs'),
  ));
});

test('Work tool observation keeps execution task creation hidden under read-only policy', () => {
  const observation = createPhaseScopedWorkToolObservation({
    phase: 'execution_preparation',
    capabilityProfile: 'boss_cat',
    parentToolScope: 'read_only',
    policyToolScope: 'read_only',
  });

  assert.deepEqual(toolNames(observation), [WORK_ITEM_PREPARE_EXECUTION_TOOL]);
  assertBoundedInputHints(observation);
  assert.ok(observation.invariants.some((entry) =>
    entry.includes(WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL)
    && entry.includes('Do not request'),
  ));
});

test('Work tool observation exposes local external binding without active sync', () => {
  const observation = createPhaseScopedWorkToolObservation({
    phase: 'external_tracker_binding',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.deepEqual(toolNames(observation), [
    WORK_EXTERNAL_LINK_ISSUE_TOOL,
    WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  ]);
  assertBoundedInputHints(observation);
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
