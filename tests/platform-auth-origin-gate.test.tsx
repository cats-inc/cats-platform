import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePreAuthOriginGate } from '../src/platform/auth/index.ts';

const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:8181'];

test('pre-auth origin gate accepts configured browser origins', () => {
  assert.deepEqual(
    evaluatePreAuthOriginGate({
      method: 'POST',
      origin: 'http://localhost:5173/setup',
      fetchSite: 'same-origin',
      allowedBrowserOrigins: ALLOWED_ORIGINS,
    }),
    { allowed: true },
  );
});

test('pre-auth origin gate rejects missing, untrusted, and cross-site mutation requests', () => {
  assert.deepEqual(
    evaluatePreAuthOriginGate({
      method: 'POST',
      origin: undefined,
      fetchSite: 'same-origin',
      allowedBrowserOrigins: ALLOWED_ORIGINS,
    }),
    { allowed: false, reason: 'origin_required' },
  );
  assert.deepEqual(
    evaluatePreAuthOriginGate({
      method: 'POST',
      origin: 'http://evil.example.test',
      fetchSite: 'same-origin',
      allowedBrowserOrigins: ALLOWED_ORIGINS,
    }),
    { allowed: false, reason: 'origin_not_allowed' },
  );
  assert.deepEqual(
    evaluatePreAuthOriginGate({
      method: 'POST',
      origin: 'http://localhost:5173',
      fetchSite: 'cross-site',
      allowedBrowserOrigins: ALLOWED_ORIGINS,
    }),
    { allowed: false, reason: 'fetch_site_not_allowed' },
  );
  assert.deepEqual(
    evaluatePreAuthOriginGate({
      method: 'POST',
      origin: 'http://localhost:5173',
      fetchSite: 'none',
      allowedBrowserOrigins: ALLOWED_ORIGINS,
    }),
    { allowed: false, reason: 'fetch_site_not_allowed' },
  );
});

test('pre-auth origin gate treats same-site without origin as rejected', () => {
  assert.deepEqual(
    evaluatePreAuthOriginGate({
      method: 'GET',
      origin: undefined,
      fetchSite: 'same-site',
      allowedBrowserOrigins: ALLOWED_ORIGINS,
    }),
    { allowed: false, reason: 'origin_required' },
  );
});
