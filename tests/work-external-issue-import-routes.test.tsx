import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { routeWorkApi } from '../src/products/work/api/index.ts';
import type { WorkApiDependencies } from '../src/products/work/api/index.ts';
import {
  EXTERNAL_ISSUE_IMPORT_METADATA_KEY,
} from '../src/products/work/integrations/externalIssueImport.ts';
import { WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH } from '../src/products/work/shared/apiPaths.ts';
import { EXTERNAL_WORK_BINDING_METADATA_KEY } from '../src/products/work/shared/externalWorkBinding.ts';

const NOW = new Date('2026-05-13T14:30:00.000Z');

function createTestServer(
  store: MemoryCoreStore,
  externalIssueImport: WorkApiDependencies['externalIssueImport'],
) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const handled = await routeWorkApi({
        request,
        response,
        url,
        method: request.method ?? 'GET',
        dependencies: {
          coreStore: store,
          now: () => NOW,
          externalIssueImport,
        },
      });
      if (!handled) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'not found' }));
      }
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  });
}

async function request(
  server: ReturnType<typeof createServer>,
  method: string,
  path: string,
  body?: Record<string, unknown>,
) {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected listening test server.');
  }
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    payload: text ? JSON.parse(text) as Record<string, unknown> : null,
  };
}

test('POST /api/work/external-issue-imports imports a GitHub issue as a Work Item', async (t) => {
  const store = new MemoryCoreStore(createDefaultCoreState());
  const requests: string[] = [];
  const server = createTestServer(store, {
    github: {
      fetchImpl: async (url) => {
        requests.push(url);
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              number: 123,
              html_url: 'https://github.com/cats-inc/cats-platform/issues/123',
              title: 'Import route GitHub issue',
              body: 'Imported by Work API route.',
              state: 'open',
              labels: [{ name: 'work' }],
              assignees: [{ login: 'boss-cat' }],
              updated_at: '2026-05-13T14:25:00Z',
              closed_at: null,
            };
          },
        };
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(
    server,
    'POST',
    WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH,
    {
      externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    },
  );

  assert.equal(status, 200);
  assert.equal(payload?.created, true);
  assert.equal(payload?.linked, true);
  assert.deepEqual(requests, [
    'https://api.github.com/repos/cats-inc/cats-platform/issues/123',
  ]);

  const core = await store.readCore();
  assert.equal(core.workItems.length, 1);
  assert.equal(core.tasks.length, 0);
  assert.equal(core.runs.length, 0);
  const workItem = core.workItems[0];
  assert.ok(workItem);
  assert.equal(workItem.title, 'Import route GitHub issue');
  assert.deepEqual(workItem.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY], {
    provider: 'github',
    externalType: 'issue',
    externalId: '123',
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    sourceKey: 'cats-inc/cats-platform',
    state: 'open',
    labels: ['work'],
    assignees: ['boss-cat'],
    sourceUpdatedAt: '2026-05-13T14:25:00Z',
    sourceClosedAt: null,
  });
  const bindingMetadata = workItem.metadata[EXTERNAL_WORK_BINDING_METADATA_KEY] as {
    bindings?: Array<Record<string, unknown>>;
  };
  assert.equal(bindingMetadata.bindings?.[0]?.externalId, '123');
  assert.equal(core.activities.length, 1);
});

test('POST /api/work/external-issue-imports imports selected Redmine issue URLs', async (t) => {
  const store = new MemoryCoreStore(createDefaultCoreState());
  const requests: string[] = [];
  const server = createTestServer(store, {
    redmine: {
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
                subject: 'Import route Redmine issue',
                description: 'Imported from nested Redmine.',
                updated_on: '2026-05-13T14:35:00Z',
                closed_on: null,
              },
            };
          },
        };
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(
    server,
    'POST',
    WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH,
    {
      externalUrl: 'https://tracker.example.test/redmine/issues/77',
      provider: 'redmine',
    },
  );

  assert.equal(status, 200);
  assert.equal(payload?.provider, 'redmine');
  assert.deepEqual(requests, [
    'https://tracker.example.test/redmine/issues/77.json',
  ]);
  const core = await store.readCore();
  assert.equal(core.workItems[0]?.title, 'Import route Redmine issue');
  assert.deepEqual(
    core.workItems[0]?.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY],
    {
      provider: 'redmine',
      externalType: 'ticket',
      externalId: '77',
      externalUrl: 'https://tracker.example.test/redmine/issues/77',
      sourceKey: 'Cats Platform',
      state: 'open',
      labels: [],
      assignees: [],
      sourceUpdatedAt: '2026-05-13T14:35:00Z',
      sourceClosedAt: null,
    },
  );
});

test('POST /api/work/external-issue-imports imports Bugzilla bug URLs', async (t) => {
  const store = new MemoryCoreStore(createDefaultCoreState());
  const requests: string[] = [];
  const server = createTestServer(store, {
    bugzilla: {
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
                  summary: 'Import route Bugzilla bug',
                  description: 'Imported from Bugzilla route.',
                  resolution: '',
                  is_open: true,
                  last_change_time: '2026-05-13T14:40:00Z',
                },
              ],
            };
          },
        };
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(
    server,
    'POST',
    WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH,
    {
      externalUrl: 'https://bugs.example.test/bugzilla/show_bug.cgi?id=1888',
      provider: 'bugzilla',
    },
  );

  assert.equal(status, 200);
  assert.equal(payload?.provider, 'bugzilla');
  assert.deepEqual(requests, [
    'https://bugs.example.test/bugzilla/rest/bug/1888',
  ]);
  const core = await store.readCore();
  assert.equal(core.workItems[0]?.title, 'Import route Bugzilla bug');
  assert.deepEqual(
    core.workItems[0]?.metadata[EXTERNAL_ISSUE_IMPORT_METADATA_KEY],
    {
      provider: 'bugzilla',
      externalType: 'ticket',
      externalId: '1888',
      externalUrl: 'https://bugs.example.test/bugzilla/show_bug.cgi?id=1888',
      sourceKey: 'Cats Platform',
      state: 'open',
      labels: ['Work'],
      assignees: [],
      sourceUpdatedAt: '2026-05-13T14:40:00Z',
      sourceClosedAt: null,
    },
  );
});

test('POST /api/work/external-issue-imports rejects unsupported URLs before fetching', async (t) => {
  const store = new MemoryCoreStore(createDefaultCoreState());
  let fetchCount = 0;
  const server = createTestServer(store, {
    github: {
      fetchImpl: async () => {
        fetchCount += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return {};
          },
        };
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(
    server,
    'POST',
    WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH,
    {
      externalUrl: 'https://gitlab.com/cats-inc/cats-platform/-/issues/123',
    },
  );

  assert.equal(status, 400);
  assert.equal(
    (payload?.error as { code?: string } | undefined)?.code,
    'external_issue_import_source_unsupported',
  );
  assert.equal(fetchCount, 0);
  assert.equal((await store.readCore()).workItems.length, 0);
});

test('POST /api/work/external-issue-imports rejects unsupported provider fields', async (t) => {
  const store = new MemoryCoreStore(createDefaultCoreState());
  let fetchCount = 0;
  const server = createTestServer(store, {
    github: {
      fetchImpl: async () => {
        fetchCount += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return {};
          },
        };
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const { status, payload } = await request(
    server,
    'POST',
    WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH,
    {
      externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
      provider: 'jira',
    },
  );

  assert.equal(status, 400);
  assert.equal(
    (payload?.error as { code?: string } | undefined)?.code,
    'external_issue_import_provider_unsupported',
  );
  assert.equal(fetchCount, 0);
  assert.equal((await store.readCore()).workItems.length, 0);
});
