import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../src/core/model/index.js';
import { MemoryCoreStore } from '../src/core/store.js';
import {
  createInMemoryToolEvidenceSink,
  createToolBoundary,
} from '../src/platform/supervision/toolBoundary.js';
import { createSupervisedToolRegistry } from '../src/platform/supervision/toolRegistry.js';
import { EXTERNAL_WORK_BINDING_METADATA_KEY } from '../src/products/work/shared/externalWorkBinding.js';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  createPhaseScopedWorkToolManifests,
} from '../src/products/work/shared/workToolSurface.js';
import {
  createWorkExternalBindingDelegate,
  createWorkExternalBindingToolExecutors,
} from '../src/products/work/state/workExternalBindingDelegate.js';

function coreWithWorkObjects() {
  const now = new Date('2026-05-13T10:00:00.000Z');
  let core = createDefaultCoreState();
  core = upsertCoreProject(core, {
    id: 'project-cats-platform',
    title: 'Cats Platform',
    status: 'active',
    ownerActorId: core.ownerProfile.actorId,
    primaryConversationId: 'conversation-cats',
    metadata: {
      existingProjectMetadata: true,
    },
  }, now).core;
  core = upsertCoreWorkItem(core, {
    id: 'work-item-intake',
    title: 'Implement external issue binding',
    status: 'planned',
    projectId: 'project-cats-platform',
    conversationId: 'conversation-cats',
    ownerActorId: core.ownerProfile.actorId,
    metadata: {
      workIntake: {
        phase: 'intake',
        source: {
          surface: 'chat',
          sourceMessageId: 'message-1',
        },
      },
    },
  }, now).core;

  return core;
}

test('Work external issue binding links Work Items through supervised boundary', async () => {
  const coreStore = new MemoryCoreStore(coreWithWorkObjects());
  const delegate = createWorkExternalBindingDelegate({
    coreStore,
    now: () => new Date('2026-05-13T10:10:00.000Z'),
  });
  const executors = createWorkExternalBindingToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:10:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const input = {
    localKind: 'work_item' as const,
    localId: 'work-item-intake',
    provider: 'github' as const,
    externalType: 'issue' as const,
    externalId: '123',
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    syncDirection: 'pull' as const,
    note: 'Manual link from triage.',
  };
  const first = await boundary.invoke({
    toolName: WORK_EXTERNAL_LINK_ISSUE_TOOL,
    input,
    actionId: 'action-external-link-1',
    runId: 'run-external-binding-1',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_EXTERNAL_LINK_ISSUE_TOOL],
  });

  assert.equal(first.status, 'applied');
  assert.equal(first.result.linked, true);
  assert.equal(first.result.bindingCount, 1);
  assert.equal(first.result.externalUrl, 'https://github.com/cats-inc/cats-platform/issues/123');

  const afterFirst = await coreStore.readCore();
  const workItem = afterFirst.workItems.find((candidate) => candidate.id === 'work-item-intake');
  const externalMetadata = workItem?.metadata[EXTERNAL_WORK_BINDING_METADATA_KEY] as {
    bindings?: Array<Record<string, unknown>>;
  } | undefined;
  assert.equal(externalMetadata?.bindings?.length, 1);
  assert.equal(externalMetadata?.bindings?.[0]?.provider, 'github');
  assert.deepEqual(workItem?.metadata.workIntake, {
    phase: 'intake',
    source: {
      surface: 'chat',
      sourceMessageId: 'message-1',
    },
  });
  assert.equal(afterFirst.tasks.length, 0);
  assert.equal(afterFirst.runs.length, 0);
  assert.equal(afterFirst.activities.length, 1);
  assert.equal(afterFirst.activities[0]?.kind, 'work_item_updated');
  assert.equal(afterFirst.activities[0]?.workItemId, 'work-item-intake');

  const second = await boundary.invoke({
    toolName: WORK_EXTERNAL_LINK_ISSUE_TOOL,
    input,
    actionId: 'action-external-link-2',
    runId: 'run-external-binding-1',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_EXTERNAL_LINK_ISSUE_TOOL],
  });

  assert.equal(second.status, 'applied');
  assert.equal(second.result.linked, false);
  assert.equal(second.result.bindingCount, 1);
  assert.equal((await coreStore.readCore()).activities.length, 1);

  const unlink = await boundary.invoke({
    toolName: WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
    input: {
      localKind: 'work_item',
      localId: 'work-item-intake',
      provider: 'github',
      externalType: 'issue',
      externalId: '123',
      note: 'Wrong external issue.',
    },
    actionId: 'action-external-unlink-1',
    runId: 'run-external-binding-1',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_EXTERNAL_UNLINK_ISSUE_TOOL],
  });

  assert.equal(unlink.status, 'applied');
  assert.equal(unlink.result.unlinked, true);
  assert.equal(unlink.result.bindingCount, 0);
  const afterUnlink = await coreStore.readCore();
  const unlinkedWorkItem = afterUnlink.workItems.find(
    (candidate) => candidate.id === 'work-item-intake',
  );
  assert.equal(unlinkedWorkItem?.metadata[EXTERNAL_WORK_BINDING_METADATA_KEY], undefined);
  assert.equal(afterUnlink.activities.length, 2);
  assert.equal(afterUnlink.activities[1]?.kind, 'work_item_updated');
  const unlinkMetadata = afterUnlink.activities[1]?.metadata.workExternalBinding as
    | { toolName?: string }
    | undefined;
  assert.equal(unlinkMetadata?.toolName, WORK_EXTERNAL_UNLINK_ISSUE_TOOL);

  const repeatUnlink = await boundary.invoke({
    toolName: WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
    input: {
      localKind: 'work_item',
      localId: 'work-item-intake',
      provider: 'github',
      externalType: 'issue',
      externalId: '123',
    },
    actionId: 'action-external-unlink-2',
    runId: 'run-external-binding-1',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_EXTERNAL_UNLINK_ISSUE_TOOL],
  });

  assert.equal(repeatUnlink.status, 'applied');
  assert.equal(repeatUnlink.result.unlinked, false);
  assert.equal((await coreStore.readCore()).activities.length, 2);
  assert.deepEqual(
    evidenceSink.read().map((event) => [event.toolName, event.status]),
    [
      [WORK_EXTERNAL_LINK_ISSUE_TOOL, 'applied'],
      [WORK_EXTERNAL_LINK_ISSUE_TOOL, 'applied'],
      [WORK_EXTERNAL_UNLINK_ISSUE_TOOL, 'applied'],
      [WORK_EXTERNAL_UNLINK_ISSUE_TOOL, 'applied'],
    ],
  );
});

test('Work external issue binding rejects missing or read-only targets before writing', async () => {
  const coreStore = new MemoryCoreStore(coreWithWorkObjects());
  const delegate = createWorkExternalBindingDelegate({ coreStore });
  const executors = createWorkExternalBindingToolExecutors(delegate);
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-05-13T10:10:00.000Z',
  });

  for (const manifest of createPhaseScopedWorkToolManifests()) {
    registry.register(manifest);
  }

  const readOnly = await boundary.invoke({
    toolName: WORK_EXTERNAL_LINK_ISSUE_TOOL,
    input: {
      localKind: 'work_item',
      localId: 'work-item-intake',
      provider: 'github',
      externalId: '123',
    },
    actionId: 'action-external-link-readonly',
    runId: 'run-external-binding-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'read_only', policyToolScope: 'read_only' },
    execute: executors[WORK_EXTERNAL_LINK_ISSUE_TOOL],
  });

  assert.equal(readOnly.status, 'rejected');
  assert.equal(readOnly.error.code, 'E_TOOL_SCOPE_DENIED');

  const credentialUrl = await boundary.invoke({
    toolName: WORK_EXTERNAL_LINK_ISSUE_TOOL,
    input: {
      localKind: 'work_item',
      localId: 'work-item-intake',
      provider: 'github',
      externalId: '123',
      externalUrl: 'https://user:pass@example.com/issues/123',
    },
    actionId: 'action-external-link-credential-url',
    runId: 'run-external-binding-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_EXTERNAL_LINK_ISSUE_TOOL],
  });

  assert.equal(credentialUrl.status, 'rejected');
  assert.equal(credentialUrl.error.code, 'E_SCHEMA_INVALID');

  const missing = await boundary.invoke({
    toolName: WORK_EXTERNAL_LINK_ISSUE_TOOL,
    input: {
      localKind: 'work_item',
      localId: 'work-item-missing',
      provider: 'github',
      externalId: '123',
    },
    actionId: 'action-external-link-missing',
    runId: 'run-external-binding-2',
    actorRef: 'cat:boss',
    grant: { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' },
    execute: executors[WORK_EXTERNAL_LINK_ISSUE_TOOL],
  });

  assert.equal(missing.status, 'rejected');
  assert.equal(missing.error.code, 'E_PRECHECK_FAILED');
  const after = await coreStore.readCore();
  assert.equal(after.activities.length, 0);
  assert.equal(
    after.workItems[0]?.metadata[EXTERNAL_WORK_BINDING_METADATA_KEY],
    undefined,
  );
});
