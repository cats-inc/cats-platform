import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.js';
import { MemoryCoreStore } from '../src/core/store.js';
import {
  EXTERNAL_ISSUE_IMPORT_METADATA_KEY,
  toExternalIssueImportDraft,
} from '../src/products/work/integrations/externalIssueImport.js';
import { EXTERNAL_WORK_BINDING_METADATA_KEY } from '../src/products/work/shared/externalWorkBinding.js';
import {
  WORK_EXTERNAL_ISSUE_IMPORT_METADATA_KEY,
  createWorkExternalIssueImportDelegate,
} from '../src/products/work/state/workExternalIssueImportDelegate.js';

test('Work external issue import delegate creates a planned Work Item with local binding metadata', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const delegate = createWorkExternalIssueImportDelegate({
    coreStore,
    now: () => new Date('2026-05-13T14:00:00.000Z'),
  });
  const draft = toExternalIssueImportDraft({
    provider: 'redmine',
    externalType: 'ticket',
    externalId: '77',
    externalUrl: 'https://redmine.example.test/issues/77',
    sourceKey: 'Cats Platform',
    title: 'Import Redmine ticket',
    summary: 'Imported from Redmine.',
    state: 'open',
    labels: ['work'],
    assignees: ['Boss Cat'],
    updatedAt: '2026-05-13T13:00:00Z',
    closedAt: null,
  });

  const result = await delegate.importDraft(draft, {
    actorRef: 'cat:boss',
    actionId: 'action-import-redmine',
    runId: 'run-import-redmine',
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.result.created, true);
  assert.equal(result.result.linked, true);
  assert.equal(result.result.provider, 'redmine');
  assert.equal(result.result.bindingCount, 1);

  const core = await coreStore.readCore();
  assert.equal(core.workItems.length, 1);
  assert.equal(core.tasks.length, 0);
  assert.equal(core.runs.length, 0);
  const workItem = core.workItems[0];
  assert.ok(workItem);
  assert.equal(workItem.id, result.result.workItemId);
  assert.equal(workItem.title, 'Import Redmine ticket');
  assert.equal(workItem.summary, 'Imported from Redmine.');
  assert.equal(workItem.status, 'planned');
  assert.deepEqual(workItem.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY], {
    provider: 'redmine',
    externalType: 'ticket',
    externalId: '77',
    externalUrl: 'https://redmine.example.test/issues/77',
    sourceKey: 'Cats Platform',
    state: 'open',
    labels: ['work'],
    assignees: ['Boss Cat'],
    sourceUpdatedAt: '2026-05-13T13:00:00Z',
    sourceClosedAt: null,
  });
  const bindingMetadata = workItem.metadata[EXTERNAL_WORK_BINDING_METADATA_KEY] as {
    bindings?: Array<Record<string, unknown>>;
  };
  assert.equal(bindingMetadata.bindings?.length, 1);
  assert.equal(bindingMetadata.bindings?.[0]?.localId, workItem.id);
  assert.equal(bindingMetadata.bindings?.[0]?.provider, 'redmine');
  assert.equal(bindingMetadata.bindings?.[0]?.externalType, 'ticket');
  assert.equal(bindingMetadata.bindings?.[0]?.externalId, '77');
  assert.equal(bindingMetadata.bindings?.[0]?.syncDirection, 'pull');
  assert.equal(bindingMetadata.bindings?.[0]?.externalUpdatedAt, '2026-05-13T13:00:00Z');

  const importMetadata = workItem.metadata[WORK_EXTERNAL_ISSUE_IMPORT_METADATA_KEY] as {
    phase?: string;
    actionId?: string | null;
    runId?: string | null;
    importedByActorRef?: string;
  };
  assert.equal(importMetadata.phase, 'external_issue_import');
  assert.equal(importMetadata.actionId, 'action-import-redmine');
  assert.equal(importMetadata.runId, 'run-import-redmine');
  assert.equal(importMetadata.importedByActorRef, 'cat:boss');
  assert.equal(core.activities.length, 1);
  assert.equal(core.activities[0]?.kind, 'work_item_updated');
  assert.equal(core.activities[0]?.workItemId, workItem.id);
});

test('Work external issue import delegate is idempotent for the same external issue', async () => {
  const coreStore = new MemoryCoreStore(createDefaultCoreState());
  const delegate = createWorkExternalIssueImportDelegate({
    coreStore,
    now: () => new Date('2026-05-13T14:00:00.000Z'),
  });
  const draft = toExternalIssueImportDraft({
    provider: 'bugzilla',
    externalType: 'ticket',
    externalId: '1888',
    externalUrl: 'https://bugzilla.example.test/show_bug.cgi?id=1888',
    sourceKey: 'Cats Platform',
    title: 'Import Bugzilla bug',
    summary: null,
    state: 'open',
    labels: ['Work'],
    assignees: ['boss-cat@example.test'],
    updatedAt: '2026-05-13T13:20:00Z',
    closedAt: null,
  });

  const first = await delegate.importDraft(draft, {
    actorRef: 'cat:boss',
    actionId: 'action-import-bugzilla-1',
  });
  const second = await delegate.importDraft(draft, {
    actorRef: 'cat:boss',
    actionId: 'action-import-bugzilla-2',
  });

  assert.equal(first.status, 'applied');
  assert.equal(second.status, 'applied');
  assert.equal(first.result.workItemId, second.result.workItemId);
  assert.equal(first.result.created, true);
  assert.equal(second.result.created, false);
  assert.equal(second.result.linked, false);
  assert.equal(second.result.bindingCount, 1);

  const core = await coreStore.readCore();
  assert.equal(core.workItems.length, 1);
  assert.equal(core.activities.length, 1);
});
