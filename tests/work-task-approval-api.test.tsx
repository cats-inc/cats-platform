import assert from 'node:assert/strict';
import test from 'node:test';

import { decideWorkTaskApproval } from '../src/products/work/renderer/api/workRecords.ts';

test('decideWorkTaskApproval approves pending Work Tasks through core approvals', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({
      task: { id: 'task-work-approval', status: 'approved' },
      approval: { status: 'approved', decisionAction: 'approve' },
    });
  }) as typeof fetch;

  const result = await decideWorkTaskApproval(
    'task-work-approval',
    {
      action: 'approve',
      decidedByActorId: 'actor-owner',
    },
    'approval failed',
  );

  assert.equal(calls[0]?.url, '/api/core/approvals');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(readHeader(calls[0]?.init, 'content-type'), 'application/json');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    taskId: 'task-work-approval',
    status: 'approved',
    action: 'approve',
    decidedByActorId: 'actor-owner',
    notes: null,
    taskStatus: 'approved',
  });
  assert.equal(result.task.status, 'approved');
});

test('decideWorkTaskApproval rejects pending Work Tasks as cancelled execution', async (t) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return jsonResponse({
      task: { id: 'task-work-approval', status: 'cancelled' },
      approval: { status: 'rejected', decisionAction: 'reject' },
    });
  }) as typeof fetch;

  await decideWorkTaskApproval(
    'task-work-approval',
    {
      action: 'reject',
      decidedByActorId: 'actor-owner',
      notes: 'Not ready.',
    },
    'approval failed',
  );

  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    taskId: 'task-work-approval',
    status: 'rejected',
    action: 'reject',
    decidedByActorId: 'actor-owner',
    notes: 'Not ready.',
    taskStatus: 'cancelled',
  });
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
