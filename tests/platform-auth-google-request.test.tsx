import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseGoogleCredentialRequestPayload,
} from '../src/app/server/googleAuthRequest.ts';

test('google credential parser accepts GIS form post payloads', () => {
  const payload = parseGoogleCredentialRequestPayload({
    contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
    rawBody: new URLSearchParams({
      credential: 'id-token',
      g_csrf_token: 'csrf-token',
    }).toString(),
  });

  assert.deepEqual(payload, {
    credential: 'id-token',
    csrfToken: 'csrf-token',
  });
});

test('google credential parser accepts json payloads for tests and non-GIS clients', () => {
  const payload = parseGoogleCredentialRequestPayload({
    contentType: 'application/json',
    rawBody: JSON.stringify({
      credential: 'id-token',
      csrfToken: 'csrf-token',
    }),
  });

  assert.deepEqual(payload, {
    credential: 'id-token',
    csrfToken: 'csrf-token',
  });
});

test('google credential parser normalizes blank fields to null', () => {
  const payload = parseGoogleCredentialRequestPayload({
    contentType: 'application/json',
    rawBody: JSON.stringify({
      credential: ' ',
      g_csrf_token: '',
    }),
  });

  assert.deepEqual(payload, {
    credential: null,
    csrfToken: null,
  });
});
