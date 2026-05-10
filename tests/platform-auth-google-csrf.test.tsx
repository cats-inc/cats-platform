import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GOOGLE_GIS_CSRF_COOKIE_NAME,
  validateGoogleGisCsrfToken,
} from '../src/platform/auth/index.ts';

test('google gis csrf accepts matching cookie and body token', () => {
  assert.deepEqual(validateGoogleGisCsrfToken({
    cookieHeader: `${GOOGLE_GIS_CSRF_COOKIE_NAME}=csrf-token`,
    bodyToken: 'csrf-token',
  }), { ok: true });
});

test('google gis csrf rejects missing or mismatched double-submit token', () => {
  assert.deepEqual(validateGoogleGisCsrfToken({
    cookieHeader: undefined,
    bodyToken: 'csrf-token',
  }), { ok: false, reason: 'missing_cookie' });
  assert.deepEqual(validateGoogleGisCsrfToken({
    cookieHeader: `${GOOGLE_GIS_CSRF_COOKIE_NAME}=csrf-token`,
    bodyToken: undefined,
  }), { ok: false, reason: 'missing_body_token' });
  assert.deepEqual(validateGoogleGisCsrfToken({
    cookieHeader: `${GOOGLE_GIS_CSRF_COOKIE_NAME}=csrf-token`,
    bodyToken: 'other-token',
  }), { ok: false, reason: 'mismatch' });
});

test('google gis csrf parses encoded token among unrelated cookies', () => {
  assert.deepEqual(validateGoogleGisCsrfToken({
    cookieHeader: [
      'other=value',
      `${GOOGLE_GIS_CSRF_COOKIE_NAME}=csrf%20token`,
    ],
    bodyToken: 'csrf token',
  }), { ok: true });
});
