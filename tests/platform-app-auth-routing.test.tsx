import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PLATFORM_LOGIN_ROUTE,
  PLATFORM_LOBBY_ROUTE,
  PLATFORM_REPAIR_ROUTE,
  resolvePlatformEnvelopeLoadFailureDecision,
  resolvePostAuthenticationEntryPath,
} from '../src/app/renderer/auth/appAuthRouting.ts';
import { PlatformSetupApiError } from '../src/app/renderer/setup/api.ts';
import { PLATFORM_AUTH_ERROR_CODES } from '../src/platform/auth/errorCodes.ts';

test('platform app treats unauthenticated app-shell failures as login routing state', () => {
  const decision = resolvePlatformEnvelopeLoadFailureDecision(
    new PlatformSetupApiError(
      'Authentication required.',
      401,
      PLATFORM_AUTH_ERROR_CODES.unauthenticated,
    ),
    'fallback',
  );

  assert.deepEqual(decision, { status: 'unauthenticated' });
  assert.equal(PLATFORM_LOGIN_ROUTE, '/login');
});

test('platform app keeps non-auth app-shell failures on the error path', () => {
  assert.deepEqual(
    resolvePlatformEnvelopeLoadFailureDecision(
      new PlatformSetupApiError('Forbidden.', 403, PLATFORM_AUTH_ERROR_CODES.forbidden),
      'fallback',
    ),
    { status: 'error', message: 'Forbidden.' },
  );
  assert.deepEqual(
    resolvePlatformEnvelopeLoadFailureDecision('unknown failure', 'fallback'),
    { status: 'error', message: 'fallback' },
  );
});

test('platform app treats repair app-shell failures as repair routing state', () => {
  const decision = resolvePlatformEnvelopeLoadFailureDecision(
    new PlatformSetupApiError(
      'Auth repair is required.',
      403,
      PLATFORM_AUTH_ERROR_CODES.forbidden,
    ),
    'fallback',
  );

  assert.deepEqual(decision, { status: 'repairRequired' });
  assert.equal(PLATFORM_REPAIR_ROUTE, '/repair');
});

test('platform app resolves the post-login entry path from the authenticated envelope', () => {
  assert.equal(resolvePostAuthenticationEntryPath({ lastProductSurface: null }), PLATFORM_LOBBY_ROUTE);
  assert.equal(resolvePostAuthenticationEntryPath({ lastProductSurface: 'work' }), '/work');
  assert.equal(resolvePostAuthenticationEntryPath({ lastProductSurface: 'code' }), '/code');
});
