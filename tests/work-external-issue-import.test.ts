import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXTERNAL_ISSUE_IMPORT_METADATA_KEY,
  toExternalIssueImportDraft,
} from '../src/products/work/integrations/externalIssueImport.js';

test('external issue import draft maps Redmine tickets onto the provider-neutral seam', () => {
  const draft = toExternalIssueImportDraft({
    provider: 'redmine',
    externalType: 'ticket',
    externalId: '77',
    externalUrl: 'https://redmine.example.test/issues/77',
    sourceKey: 'cats-platform',
    title: 'Import Redmine issue',
    summary: 'Keep Redmine as the source tracker.',
    state: 'open',
    labels: ['bug', 'backend'],
    assignees: ['boss-cat'],
    updatedAt: '2026-05-13T11:00:00.000Z',
    closedAt: null,
  });

  assert.deepEqual(draft, {
    title: 'Import Redmine issue',
    summary: 'Keep Redmine as the source tracker.',
    status: 'planned',
    metadata: {
      [EXTERNAL_ISSUE_IMPORT_METADATA_KEY]: {
        provider: 'redmine',
        externalType: 'ticket',
        externalId: '77',
        externalUrl: 'https://redmine.example.test/issues/77',
        sourceKey: 'cats-platform',
        state: 'open',
        labels: ['bug', 'backend'],
        assignees: ['boss-cat'],
        sourceUpdatedAt: '2026-05-13T11:00:00.000Z',
        sourceClosedAt: null,
      },
    },
    bindingDefaults: {
      provider: 'redmine',
      externalType: 'ticket',
      externalId: '77',
      externalUrl: 'https://redmine.example.test/issues/77',
      syncDirection: 'pull',
      externalUpdatedAt: '2026-05-13T11:00:00.000Z',
    },
  });
});

test('external issue import draft maps Bugzilla tickets without a project source key', () => {
  const draft = toExternalIssueImportDraft({
    provider: 'bugzilla',
    externalType: 'ticket',
    externalId: '1888',
    externalUrl: 'https://bugzilla.example.test/show_bug.cgi?id=1888',
    sourceKey: null,
    title: 'Import Bugzilla bug',
    summary: null,
    state: 'closed',
    labels: [],
    assignees: [],
    updatedAt: '2026-05-13T11:30:00.000Z',
    closedAt: '2026-05-13T11:31:00.000Z',
  });

  assert.deepEqual(draft.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY], {
    provider: 'bugzilla',
    externalType: 'ticket',
    externalId: '1888',
    externalUrl: 'https://bugzilla.example.test/show_bug.cgi?id=1888',
    sourceKey: null,
    state: 'closed',
    labels: [],
    assignees: [],
    sourceUpdatedAt: '2026-05-13T11:30:00.000Z',
    sourceClosedAt: '2026-05-13T11:31:00.000Z',
  });
  assert.equal(draft.bindingDefaults.provider, 'bugzilla');
  assert.equal(draft.bindingDefaults.externalType, 'ticket');
});
