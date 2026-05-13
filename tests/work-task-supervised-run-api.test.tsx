import assert from 'node:assert/strict';
import test from 'node:test';

import { startWorkTaskSupervisedRun } from '../src/products/work/renderer/api/workRecords.ts';

test('startWorkTaskSupervisedRun posts to the Work task supervised-run route', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({
      task: { id: 'task-approved-work', status: 'approved' },
      run: { id: 'run-approved-work', taskId: 'task-approved-work', status: 'queued' },
      created: true,
      supervision: null,
    });
  }) as typeof fetch;

  const result = await startWorkTaskSupervisedRun(
    'task-approved-work',
    'start failed',
  );

  assert.equal(calls[0]?.url, '/api/work/tasks/task-approved-work/supervised-run');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(readHeader(calls[0]?.init, 'Accept'), 'application/json');
  assert.equal(result.run.id, 'run-approved-work');
  assert.equal(result.created, true);
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 201,
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
