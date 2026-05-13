import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
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
