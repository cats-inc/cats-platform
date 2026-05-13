import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GITHUB_ISSUE_IMPORT_METADATA_KEY,
  GitHubIssuesAdapterError,
  buildGitHubIssueExportPayload,
  createGitHubIssuesAdapter,
  parseGitHubIssueSnapshot,
} from '../src/products/work/integrations/githubIssuesAdapter.js';
import {
  EXTERNAL_ISSUE_IMPORT_METADATA_KEY,
} from '../src/products/work/integrations/externalIssueImport.js';

test('GitHub Issues adapter fetches and maps an issue into a Work import draft', async () => {
  const requests: Array<{
    url: string;
    headers: Record<string, string>;
  }> = [];
  const adapter = createGitHubIssuesAdapter({
    owner: 'cats-inc',
    repo: 'cats-platform',
    token: 'github-token',
    apiBaseUrl: 'https://api.github.test/',
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
            title: 'Import todos from GitHub',
            body: 'Keep the GitHub issue as an external reference.',
            state: 'open',
            html_url: 'https://github.com/cats-inc/cats-platform/issues/123',
            updated_at: '2026-05-13T10:10:00Z',
            closed_at: null,
            labels: [
              { name: 'enhancement' },
              { name: 'work' },
              { name: 'work' },
              '',
            ],
            assignees: [
              { login: 'boss-cat' },
              { login: 'boss-cat' },
              { login: 'kitten' },
            ],
          };
        },
      };
    },
  });

  const draft = await adapter.fetchIssue('123');

  assert.deepEqual(requests, [
    {
      url: 'https://api.github.test/repos/cats-inc/cats-platform/issues/123',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'cats-platform-work-github-issues-adapter',
        Authorization: 'Bearer github-token',
      },
    },
  ]);
  assert.equal(draft.title, 'Import todos from GitHub');
  assert.equal(draft.summary, 'Keep the GitHub issue as an external reference.');
  assert.equal(draft.status, 'planned');
  assert.deepEqual(draft.bindingDefaults, {
    provider: 'github',
    externalType: 'issue',
    externalId: '123',
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    syncDirection: 'pull',
    externalUpdatedAt: '2026-05-13T10:10:00Z',
  });
  assert.deepEqual(draft.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY], {
    provider: 'github',
    externalType: 'issue',
    externalId: '123',
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    sourceKey: 'cats-inc/cats-platform',
    state: 'open',
    labels: ['enhancement', 'work'],
    assignees: ['boss-cat', 'kitten'],
    sourceUpdatedAt: '2026-05-13T10:10:00Z',
    sourceClosedAt: null,
  });
  assert.deepEqual(draft.metadata[GITHUB_ISSUE_IMPORT_METADATA_KEY], {
    provider: 'github',
    repository: 'cats-inc/cats-platform',
    externalId: '123',
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    state: 'open',
    labels: ['enhancement', 'work'],
    assignees: ['boss-cat', 'kitten'],
    sourceUpdatedAt: '2026-05-13T10:10:00Z',
    sourceClosedAt: null,
  });
});

test('GitHub Issues adapter rejects failed fetches and pull request rows', async () => {
  const failingAdapter = createGitHubIssuesAdapter({
    owner: 'cats-inc',
    repo: 'cats-platform',
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
    (error) => error instanceof GitHubIssuesAdapterError
      && error.code === 'github_issue_fetch_failed'
      && error.status === 404,
  );

  assert.throws(
    () => parseGitHubIssueSnapshot({
      number: 7,
      title: 'Pull request row',
      body: null,
      state: 'open',
      html_url: 'https://github.com/cats-inc/cats-platform/pull/7',
      updated_at: '2026-05-13T10:10:00Z',
      labels: [],
      assignees: [],
      pull_request: {},
    }, 'cats-inc/cats-platform'),
    (error) => error instanceof GitHubIssuesAdapterError
      && error.code === 'github_pull_request_not_supported',
  );
});

test('GitHub Issues export payload trims optional fields without writing remotely', () => {
  assert.deepEqual(buildGitHubIssueExportPayload({
    title: '  Export Work Item  ',
    summary: '  Body from Cats Work.  ',
    labels: [' work ', '', 'work', 'automation'],
    assignees: [' boss-cat ', 'boss-cat'],
  }), {
    title: 'Export Work Item',
    body: 'Body from Cats Work.',
    labels: ['work', 'automation'],
    assignees: ['boss-cat'],
  });

  assert.throws(
    () => buildGitHubIssueExportPayload({ title: '   ' }),
    (error) => error instanceof GitHubIssuesAdapterError
      && error.code === 'github_issue_invalid_export_payload',
  );
});
