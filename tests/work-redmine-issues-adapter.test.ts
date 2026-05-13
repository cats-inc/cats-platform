import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXTERNAL_ISSUE_IMPORT_METADATA_KEY,
} from '../src/products/work/integrations/externalIssueImport.js';
import {
  RedmineIssuesAdapterError,
  createRedmineIssuesAdapter,
  parseRedmineIssueImportDraft,
} from '../src/products/work/integrations/redmineIssuesAdapter.js';

test('Redmine Issues adapter fetches and maps an issue into a Work import draft', async () => {
  const requests: Array<{
    url: string;
    headers: Record<string, string>;
  }> = [];
  const adapter = createRedmineIssuesAdapter({
    baseUrl: 'https://redmine.example.test/',
    apiKey: 'redmine-key',
    fetchImpl: async (url, init) => {
      requests.push({
        url,
        headers: init.headers,
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            issue: {
              id: 77,
              project: { id: 3, name: 'cats-platform' },
              subject: 'Import Redmine ticket',
              description: 'Keep Redmine as the source of truth.',
              status: { id: 1, name: 'New' },
              assigned_to: { id: 9, name: 'Boss Cat' },
              updated_on: '2026-05-13T12:00:00Z',
              closed_on: null,
            },
          };
        },
      };
    },
  });

  const draft = await adapter.fetchIssue('77');

  assert.deepEqual(requests, [
    {
      url: 'https://redmine.example.test/issues/77.json',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'cats-platform-work-redmine-issues-adapter',
        'X-Redmine-API-Key': 'redmine-key',
      },
    },
  ]);
  assert.equal(draft.title, 'Import Redmine ticket');
  assert.equal(draft.summary, 'Keep Redmine as the source of truth.');
  assert.deepEqual(draft.bindingDefaults, {
    provider: 'redmine',
    externalType: 'ticket',
    externalId: '77',
    externalUrl: 'https://redmine.example.test/issues/77',
    syncDirection: 'pull',
    externalUpdatedAt: '2026-05-13T12:00:00Z',
  });
  assert.deepEqual(draft.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY], {
    provider: 'redmine',
    externalType: 'ticket',
    externalId: '77',
    externalUrl: 'https://redmine.example.test/issues/77',
    sourceKey: 'cats-platform',
    state: 'open',
    labels: [],
    assignees: ['Boss Cat'],
    sourceUpdatedAt: '2026-05-13T12:00:00Z',
    sourceClosedAt: null,
  });
});

test('Redmine Issues adapter rejects failed fetches and malformed issues', async () => {
  const failingAdapter = createRedmineIssuesAdapter({
    baseUrl: 'https://redmine.example.test',
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async json() {
        return {};
      },
    }),
  });

  await assert.rejects(
    () => failingAdapter.fetchIssue(404),
    (error) => error instanceof RedmineIssuesAdapterError
      && error.code === 'redmine_issue_fetch_failed'
      && error.status === 404,
  );

  assert.throws(
    () => parseRedmineIssueImportDraft({ issue: { id: 1 } }, 'https://redmine.example.test'),
    (error) => error instanceof RedmineIssuesAdapterError
      && error.code === 'redmine_issue_invalid_response',
  );
});
