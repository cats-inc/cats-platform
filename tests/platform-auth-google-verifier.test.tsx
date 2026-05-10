import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PlatformGoogleTokenVerificationError,
  verifyPlatformGoogleIdentityToken,
  type PlatformGoogleIdTokenClaims,
  type PlatformGoogleIdTokenVerifier,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const BASE_CLAIMS = {
  sub: 'google-subject-1',
  aud: 'browser-client-id',
  iss: 'https://accounts.google.com',
  exp: Math.floor(NOW.getTime() / 1000) + 600,
  email: 'OWNER@EXAMPLE.TEST',
  email_verified: true,
  hd: 'example.test',
  name: 'Owner',
  picture: 'https://example.test/avatar.png',
} satisfies PlatformGoogleIdTokenClaims;

test('google verifier normalizes trusted claims from injected verifier', async () => {
  const identity = await verifyPlatformGoogleIdentityToken({
    token: 'id-token',
    audiences: ['browser-client-id'],
    hostedDomains: ['example.test'],
    verifier: fakeVerifier(BASE_CLAIMS),
    now: NOW,
  });

  assert.deepEqual(identity, {
    providerSubject: 'google-subject-1',
    email: 'owner@example.test',
    hostedDomain: 'example.test',
    displayName: 'Owner',
    avatarUrl: 'https://example.test/avatar.png',
    audience: 'browser-client-id',
    issuer: 'https://accounts.google.com',
    expiresAt: new Date(BASE_CLAIMS.exp * 1000).toISOString(),
  });
});

test('google verifier rejects mismatched audience and issuer', async () => {
  await assert.rejects(
    () => verifyPlatformGoogleIdentityToken({
      token: 'id-token',
      audiences: ['other-client-id'],
      verifier: fakeVerifier(BASE_CLAIMS),
      now: NOW,
    }),
    (error) => isVerificationError(error, 'audience_mismatch'),
  );

  await assert.rejects(
    () => verifyPlatformGoogleIdentityToken({
      token: 'id-token',
      audiences: ['browser-client-id'],
      verifier: fakeVerifier({ ...BASE_CLAIMS, iss: 'https://evil.example.test' }),
      now: NOW,
    }),
    (error) => isVerificationError(error, 'issuer_mismatch'),
  );
});

test('google verifier rejects expired or unverified-email tokens', async () => {
  await assert.rejects(
    () => verifyPlatformGoogleIdentityToken({
      token: 'id-token',
      audiences: ['browser-client-id'],
      verifier: fakeVerifier({ ...BASE_CLAIMS, exp: Math.floor(NOW.getTime() / 1000) - 120 }),
      now: NOW,
    }),
    (error) => isVerificationError(error, 'expired'),
  );

  await assert.rejects(
    () => verifyPlatformGoogleIdentityToken({
      token: 'id-token',
      audiences: ['browser-client-id'],
      verifier: fakeVerifier({ ...BASE_CLAIMS, email_verified: false }),
      now: NOW,
    }),
    (error) => isVerificationError(error, 'email_unverified'),
  );
});

test('google verifier enforces hosted-domain allowlist when configured', async () => {
  await assert.rejects(
    () => verifyPlatformGoogleIdentityToken({
      token: 'id-token',
      audiences: ['browser-client-id'],
      hostedDomains: ['company.example'],
      verifier: fakeVerifier(BASE_CLAIMS),
      now: NOW,
    }),
    (error) => isVerificationError(error, 'hosted_domain_mismatch'),
  );
});

test('google verifier accepts configured mobile audiences', async () => {
  const identity = await verifyPlatformGoogleIdentityToken({
    token: 'mobile-id-token',
    audiences: ['ios-client-id', 'android-client-id'],
    verifier: fakeVerifier({ ...BASE_CLAIMS, aud: 'ios-client-id' }),
    now: NOW,
  });

  assert.equal(identity.audience, 'ios-client-id');
});

function fakeVerifier(claims: PlatformGoogleIdTokenClaims): PlatformGoogleIdTokenVerifier {
  return {
    async verifyIdToken() {
      return claims;
    },
  };
}

function isVerificationError(
  error: unknown,
  code: PlatformGoogleTokenVerificationError['code'],
): boolean {
  return error instanceof PlatformGoogleTokenVerificationError && error.code === code;
}
