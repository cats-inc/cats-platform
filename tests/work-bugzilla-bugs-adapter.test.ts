import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BugzillaBugsAdapterError,
  createBugzillaBugsAdapter,
  parseBugzillaBugImportDraft,
} from '../src/products/work/integrations/bugzillaBugsAdapter.js';
import {
  EXTERNAL_ISSUE_IMPORT_METADATA_KEY,
} from '../src/products/work/integrations/externalIssueImport.js';

test('Bugzilla Bugs adapter fetches and maps a bug into a Work import draft', async () => {
  const requests: Array<{
    url: string;
    headers: Record<string, string>;
  }> = [];
  const adapter = createBugzillaBugsAdapter({
    baseUrl: 'https://bugzilla.example.test/',
    apiKey: 'bugzilla-key',
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
            bugs: [
              {
                id: 1888,
                product: 'Cats Platform',
                component: 'Work',
                summary: 'Import Bugzilla bug',
                status: 'NEW',
                resolution: '',
                severity: 'normal',
                priority: 'P2',
                assigned_to: 'boss-cat@example.test',
                is_open: true,
                last_change_time: '2026-05-13T12:30:00Z',
              },
            ],
          };
        },
      };
    },
  });

  const draft = await adapter.fetchBug('1888');

  assert.deepEqual(requests, [
    {
      url: 'https://bugzilla.example.test/rest/bug/1888',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'cats-platform-work-bugzilla-bugs-adapter',
        'X-BUGZILLA-API-KEY': 'bugzilla-key',
      },
    },
  ]);
  assert.equal(draft.title, 'Import Bugzilla bug');
  assert.equal(draft.summary, null);
  assert.deepEqual(draft.bindingDefaults, {
    provider: 'bugzilla',
    externalType: 'ticket',
    externalId: '1888',
    externalUrl: 'https://bugzilla.example.test/show_bug.cgi?id=1888',
    syncDirection: 'pull',
    externalUpdatedAt: '2026-05-13T12:30:00Z',
  });
  assert.deepEqual(draft.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY], {
    provider: 'bugzilla',
    externalType: 'ticket',
    externalId: '1888',
    externalUrl: 'https://bugzilla.example.test/show_bug.cgi?id=1888',
    sourceKey: 'Cats Platform',
    state: 'open',
    labels: ['Work', 'normal', 'P2'],
    assignees: ['boss-cat@example.test'],
    sourceUpdatedAt: '2026-05-13T12:30:00Z',
    sourceClosedAt: null,
  });
});

test('Bugzilla Bugs adapter maps non-empty resolution to closed state', () => {
  const draft = parseBugzillaBugImportDraft({
    bugs: [
      {
        id: 1889,
        product: 'Cats Platform',
        summary: 'Closed Bugzilla bug',
        status: 'RESOLVED',
        resolution: 'FIXED',
        last_change_time: '2026-05-13T12:40:00Z',
      },
    ],
  }, 'https://bugzilla.example.test/');

  assert.equal(
    draft.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY].state,
    'closed',
  );
  assert.equal(
    draft.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY].sourceClosedAt,
    '2026-05-13T12:40:00Z',
  );
});

test('Bugzilla Bugs adapter rejects failed fetches and malformed bugs', async () => {
  const failingAdapter = createBugzillaBugsAdapter({
    baseUrl: 'https://bugzilla.example.test',
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      async json() {
        return {};
      },
    }),
  });

  await assert.rejects(
    () => failingAdapter.fetchBug(404),
    (error) => error instanceof BugzillaBugsAdapterError
      && error.code === 'bugzilla_bug_fetch_failed'
      && error.status === 404,
  );

  assert.throws(
    () => parseBugzillaBugImportDraft({ bugs: [] }, 'https://bugzilla.example.test'),
    (error) => error instanceof BugzillaBugsAdapterError
      && error.code === 'bugzilla_bug_invalid_response',
  );
});
