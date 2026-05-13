import assert from 'node:assert/strict';
import test from 'node:test';

import { WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH } from '../src/products/work/shared/apiPaths.ts';
import { importWorkExternalIssue } from '../src/products/work/renderer/api/workRecords.ts';

test('importWorkExternalIssue posts external issue import requests through the Work API', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({
      workItemId: 'work-item-external-123',
      provider: 'github',
      externalType: 'issue',
      externalId: '123',
      created: true,
      linked: true,
      bindingCount: 1,
      source: {
        provider: 'github',
        externalType: 'issue',
        externalId: '123',
        externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
      },
    });
  }) as typeof fetch;

  const result = await importWorkExternalIssue(
    {
      externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
      provider: 'github',
    },
    'import failed',
  );

  assert.equal(calls[0]?.url, WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH);
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(readHeader(calls[0]?.init, 'content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    provider: 'github',
  });
  assert.equal(result.created, true);
  assert.equal(result.workItemId, 'work-item-external-123');
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function readHeader(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers) || headers instanceof Headers) {
    return headers instanceof Headers ? headers.get(name) : null;
  }
  return headers[name] ?? null;
}
