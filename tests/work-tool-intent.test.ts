import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPhaseScopedWorkToolManifests,
  WORK_EXTERNAL_IMPORT_ISSUE_TOOL,
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
  WORK_MCP_PROFILE_ID,
  resolvePhaseScopedWorkToolIntentManifest,
} from '../src/products/work/shared/workToolIntent.js';

test('Work tool intent projects the work-memory profile into phase-scoped tools', () => {
  const manifest = resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase: 'triage',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
    channelId: 'channel-1',
    catId: 'cat-boss',
    participantKind: 'cat',
    roomMode: 'direct_message',
    transport: 'web',
  });

  assert.ok(manifest);
  assert.equal(manifest.profileId, WORK_MCP_PROFILE_ID);
  assert.equal(manifest.strict, true);
  assert.deepEqual(manifest.allowedTools, [
    WORK_ITEM_ASSIGN_PROJECT_TOOL,
    WORK_ITEM_UPDATE_TOOL,
    WORK_PROJECT_CREATE_TOOL,
    WORK_PROJECT_LOOKUP_TOOL,
  ]);
  assert.deepEqual(manifest.requiredCapabilities, [
    'work.phase.triage',
    'work.capability.strong_agent',
    'work.tool_scope.narrow_write',
  ]);
  assert.deepEqual(manifest.lazyGroups, ['work.triage', 'work.write']);
  assert.deepEqual(manifest.context, {
    catId: 'cat-boss',
    channelId: 'channel-1',
    participantKind: 'cat',
    roomMode: 'direct_message',
    transport: 'web',
  });
});

test('Work tool intent describes allowed tools from the product-owned surface', () => {
  const manifest = resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase: 'intake',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.ok(manifest);
  assert.deepEqual(manifest.allowedTools, [
    WORK_ITEM_CAPTURE_TOOL,
    WORK_ITEM_PROPOSE_SPLIT_TOOL,
  ]);
  assert.deepEqual(manifest.toolDescriptions, buildExpectedToolDescriptions(manifest.allowedTools));
});

test('Work tool intent preserves read-only policy bounds', () => {
  const manifest = resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase: 'triage',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'read_only',
    policyToolScope: 'read_only',
  });

  assert.ok(manifest);
  assert.deepEqual(manifest.allowedTools, [WORK_PROJECT_LOOKUP_TOOL]);
  assert.deepEqual(manifest.lazyGroups, ['work.triage']);
  assert.deepEqual(manifest.requiredCapabilities, [
    'work.phase.triage',
    'work.capability.strong_agent',
    'work.tool_scope.read_only',
  ]);
});

test('Work tool intent projects execution-preparation tools for Boss Cat scope', () => {
  const readOnlyManifest = resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase: 'execution_preparation',
    capabilityProfile: 'boss_cat',
    parentToolScope: 'read_only',
    policyToolScope: 'read_only',
  });
  const writeManifest = resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase: 'execution_preparation',
    capabilityProfile: 'boss_cat',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });
  const strongAgentManifest = resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase: 'execution_preparation',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.ok(readOnlyManifest);
  assert.deepEqual(readOnlyManifest.allowedTools, [WORK_ITEM_PREPARE_EXECUTION_TOOL]);
  assert.deepEqual(readOnlyManifest.lazyGroups, ['work.execution_preparation']);

  assert.ok(writeManifest);
  assert.deepEqual(writeManifest.allowedTools, [
    WORK_ITEM_PREPARE_EXECUTION_TOOL,
    WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  ]);
  assert.deepEqual(writeManifest.lazyGroups, ['work.execution_preparation', 'work.write']);

  assert.ok(strongAgentManifest);
  assert.deepEqual(strongAgentManifest.allowedTools, []);
});

test('Work tool intent projects external tracker binding tools under narrow write scope', () => {
  const readOnlyManifest = resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase: 'external_tracker_binding',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'read_only',
    policyToolScope: 'read_only',
  });
  const writeManifest = resolvePhaseScopedWorkToolIntentManifest({
    profileId: WORK_MCP_PROFILE_ID,
    phase: 'external_tracker_binding',
    capabilityProfile: 'strong_agent',
    parentToolScope: 'narrow_write',
    policyToolScope: 'narrow_write',
  });

  assert.ok(readOnlyManifest);
  assert.deepEqual(readOnlyManifest.allowedTools, []);
  assert.deepEqual(readOnlyManifest.lazyGroups, ['work.external_tracker_binding']);

  assert.ok(writeManifest);
  assert.deepEqual(writeManifest.allowedTools, [
    WORK_EXTERNAL_IMPORT_ISSUE_TOOL,
    WORK_EXTERNAL_LINK_ISSUE_TOOL,
    WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  ]);
  assert.deepEqual(writeManifest.requiredCapabilities, [
    'work.phase.external_tracker_binding',
    'work.capability.strong_agent',
    'work.tool_scope.narrow_write',
  ]);
  assert.deepEqual(writeManifest.lazyGroups, [
    'work.external_tracker_binding',
    'work.write',
  ]);
});

test('Work tool intent ignores non-Work MCP profiles', () => {
  assert.equal(
    resolvePhaseScopedWorkToolIntentManifest({
      profileId: 'chat-memory',
      phase: 'triage',
      capabilityProfile: 'strong_agent',
      parentToolScope: 'narrow_write',
      policyToolScope: 'narrow_write',
    }),
    null,
  );
});

function buildExpectedToolDescriptions(
  toolNames: readonly string[],
): Array<{ name: string; description: string }> {
  const descriptions = new Map(
    createPhaseScopedWorkToolManifests().map((manifest) => [
      manifest.name,
      manifest.description,
    ]),
  );

  return toolNames.map((name) => {
    const description = descriptions.get(name);
    assert.ok(description, `Expected product-owned description for ${name}`);
    return {
      name,
      description,
    };
  });
}
