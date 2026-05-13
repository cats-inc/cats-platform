import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExternalIssueImportFetcherError,
  fetchExternalIssueImportDraftFromUrl,
} from '../src/products/work/integrations/externalIssueImportFetcher.js';
import {
  EXTERNAL_ISSUE_IMPORT_METADATA_KEY,
} from '../src/products/work/integrations/externalIssueImport.js';

test('external issue import fetcher reads GitHub issue URLs through the GitHub adapter', async () => {
  const requests: Array<{
    url: string;
    headers: Record<string, string>;
  }> = [];

  const result = await fetchExternalIssueImportDraftFromUrl(
    'https://github.com/cats-inc/cats-platform/issues/123',
    {
      github: {
        token: 'github-token',
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
                number: 123,
                html_url: 'https://github.com/cats-inc/cats-platform/issues/123',
                title: 'Import GitHub issue',
                body: 'Imported from GitHub.',
                state: 'open',
                labels: [{ name: 'work' }],
                assignees: [{ login: 'boss-cat' }],
                updated_at: '2026-05-13T13:00:00Z',
                closed_at: null,
              };
            },
          };
        },
      },
    },
  );

  assert.deepEqual(result.source, {
    provider: 'github',
    externalType: 'issue',
    externalId: '123',
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    owner: 'cats-inc',
    repo: 'cats-platform',
    repository: 'cats-inc/cats-platform',
  });
  assert.deepEqual(requests, [
    {
      url: 'https://api.github.com/repos/cats-inc/cats-platform/issues/123',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'cats-platform-work-github-issues-adapter',
        Authorization: 'Bearer github-token',
      },
    },
  ]);
  assert.equal(result.draft.title, 'Import GitHub issue');
  assert.equal(
    result.draft.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY].sourceKey,
    'cats-inc/cats-platform',
  );
});

test('external issue import fetcher reads self-hosted Redmine URLs through the Redmine adapter', async () => {
  const requests: string[] = [];

  const result = await fetchExternalIssueImportDraftFromUrl(
    'https://tracker.example.test/redmine/issues/77',
    {
      selectedProvider: 'redmine',
      redmine: {
        apiKey: 'redmine-key',
        fetchImpl: async (url) => {
          requests.push(url);
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                issue: {
                  id: 77,
                  project: { name: 'Cats Platform' },
                  subject: 'Import Redmine issue',
                  description: 'Imported from Redmine.',
                  updated_on: '2026-05-13T13:10:00Z',
                  closed_on: null,
                },
              };
            },
          };
        },
      },
    },
  );

  assert.deepEqual(requests, [
    'https://tracker.example.test/redmine/issues/77.json',
  ]);
  assert.equal(result.source.provider, 'redmine');
  assert.equal(result.draft.title, 'Import Redmine issue');
  assert.equal(
    result.draft.bindingDefaults.externalUrl,
    'https://tracker.example.test/redmine/issues/77',
  );
});

test('external issue import fetcher reads Bugzilla URLs through the Bugzilla adapter', async () => {
  const requests: string[] = [];

  const result = await fetchExternalIssueImportDraftFromUrl(
    'https://bugs.example.test/bugzilla/show_bug.cgi?id=1888',
    {
      selectedProvider: 'bugzilla',
      bugzilla: {
        apiKey: 'bugzilla-key',
        fetchImpl: async (url) => {
          requests.push(url);
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                bugs: [
                  {
                    id: 1888,
                    product: 'Cats Platform',
                    component: 'Work',
                    summary: 'Import Bugzilla bug',
                    description: 'Imported from Bugzilla.',
                    resolution: '',
                    is_open: true,
                    last_change_time: '2026-05-13T13:20:00Z',
                  },
                ],
              };
            },
          };
        },
      },
    },
  );

  assert.deepEqual(requests, [
    'https://bugs.example.test/bugzilla/rest/bug/1888',
  ]);
  assert.equal(result.source.provider, 'bugzilla');
  assert.equal(result.draft.title, 'Import Bugzilla bug');
  assert.equal(result.draft.summary, 'Imported from Bugzilla.');
});

test('external issue import fetcher rejects unsupported source URLs before fetching', async () => {
  await assert.rejects(
    () => fetchExternalIssueImportDraftFromUrl(
      'https://gitlab.com/cats-inc/cats-platform/-/issues/123',
    ),
    (error) => error instanceof ExternalIssueImportFetcherError
      && error.code === 'external_issue_import_source_unsupported',
  );
});
