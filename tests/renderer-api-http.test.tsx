import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expectJson,
  readErrorMessage,
} from '../src/products/shared/renderer/api/http.ts';

test('readErrorMessage prefers string and structured error payloads, then falls back safely', async () => {
  assert.equal(
    await readErrorMessage(
      new Response(JSON.stringify({ error: 'plain failure' }), {
        headers: { 'content-type': 'application/json' },
      }),
      'fallback',
    ),
    'plain failure',
  );

  assert.equal(
    await readErrorMessage(
      new Response(JSON.stringify({ error: { code: 'bad', message: 'structured failure' } }), {
        headers: { 'content-type': 'application/json' },
      }),
      'fallback',
    ),
    'structured failure',
  );

  assert.equal(
    await readErrorMessage(
      new Response(JSON.stringify({ nope: true }), {
        headers: { 'content-type': 'application/json' },
      }),
      'fallback',
    ),
    'fallback',
  );

  assert.equal(
    await readErrorMessage(
      new Response('not-json', {
        headers: { 'content-type': 'text/plain' },
      }),
      'fallback',
    ),
    'fallback',
  );
});

test('expectJson returns parsed payloads and throws the resolved error message for non-ok responses', async () => {
  const payload = await expectJson<{ ok: boolean }>(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    'fallback',
  );
  assert.deepEqual(payload, { ok: true });

  await assert.rejects(
    () => expectJson(
      new Response(JSON.stringify({ error: { message: 'denied' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
      'fallback',
    ),
    /denied/u,
  );

  await assert.rejects(
    () => expectJson(
      new Response('bad gateway', {
        status: 502,
        headers: { 'content-type': 'text/plain' },
      }),
      'fallback',
    ),
    /fallback/u,
  );
});
