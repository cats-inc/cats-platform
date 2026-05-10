import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import test from 'node:test';

import {
  PlatformGoogleTokenVerificationError,
  createGoogleJwksIdTokenVerifier,
  type PlatformGoogleIdTokenClaims,
} from '../src/platform/auth/index.ts';

const NOW = new Date('2026-05-10T00:00:00.000Z');
const BASE_CLAIMS = {
  sub: 'google-subject-1',
  aud: 'browser-client-id',
  iss: 'https://accounts.google.com',
  exp: Math.floor(NOW.getTime() / 1000) + 600,
  email: 'owner@example.test',
  email_verified: true,
} satisfies PlatformGoogleIdTokenClaims;

type TestJwk = Record<string, unknown> & {
  kid: string;
  alg: 'RS256';
  use: 'sig';
};

test('google jwks verifier validates RS256 JWT signatures and caches keys', async () => {
  const fixture = createSigningFixture();
  const fetches: string[] = [];
  const verifier = createGoogleJwksIdTokenVerifier({
    now: () => NOW,
    fetchImpl: async (url) => {
      fetches.push(String(url));
      return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
        status: 200,
        headers: { 'cache-control': 'public, max-age=3600' },
      });
    },
  });

  assert.deepEqual(
    await verifier.verifyIdToken({
      token: fixture.sign(BASE_CLAIMS),
      audiences: ['browser-client-id'],
    }),
    BASE_CLAIMS,
  );
  assert.deepEqual(
    await verifier.verifyIdToken({
      token: fixture.sign({ ...BASE_CLAIMS, sub: 'google-subject-2' }),
      audiences: ['browser-client-id'],
    }),
    { ...BASE_CLAIMS, sub: 'google-subject-2' },
  );
  assert.equal(fetches.length, 1);
});

test('google jwks verifier rejects tampered payloads and unsupported headers', async () => {
  const fixture = createSigningFixture();
  const verifier = createGoogleJwksIdTokenVerifier({
    now: () => NOW,
    fetchImpl: async () => new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
      status: 200,
    }),
  });
  const valid = fixture.sign(BASE_CLAIMS).split('.');
  const tampered = [
    valid[0],
    encodeBase64UrlJson({ ...BASE_CLAIMS, sub: 'attacker' }),
    valid[2],
  ].join('.');

  await assert.rejects(
    () => verifier.verifyIdToken({ token: tampered, audiences: ['browser-client-id'] }),
    (error) => isVerificationError(error, 'invalid_token'),
  );
  await assert.rejects(
    () => verifier.verifyIdToken({
      token: [
        encodeBase64UrlJson({ alg: 'none', kid: fixture.publicJwk.kid }),
        encodeBase64UrlJson(BASE_CLAIMS),
        'signature',
      ].join('.'),
      audiences: ['browser-client-id'],
    }),
    (error) => isVerificationError(error, 'invalid_token'),
  );
});

test('google jwks verifier refreshes keys when kid is not cached', async () => {
  const first = createSigningFixture('kid-1');
  const second = createSigningFixture('kid-2');
  let fetchCount = 0;
  const verifier = createGoogleJwksIdTokenVerifier({
    now: () => NOW,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({
        keys: [fetchCount === 1 ? first.publicJwk : second.publicJwk],
      }), { status: 200 });
    },
  });

  await verifier.verifyIdToken({
    token: first.sign(BASE_CLAIMS),
    audiences: ['browser-client-id'],
  });
  await verifier.verifyIdToken({
    token: second.sign(BASE_CLAIMS),
    audiences: ['browser-client-id'],
  });
  assert.equal(fetchCount, 2);
});

function createSigningFixture(kid = 'kid-1'): {
  publicJwk: TestJwk;
  sign: (claims: PlatformGoogleIdTokenClaims) => string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid,
    alg: 'RS256',
    use: 'sig',
  } as TestJwk;
  return {
    publicJwk,
    sign: (claims) => signJwt(privateKey, { alg: 'RS256', kid }, claims),
  };
}

function signJwt(
  privateKey: KeyObject,
  header: { alg: 'RS256'; kid: string },
  claims: PlatformGoogleIdTokenClaims,
): string {
  const signingInput = `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(claims)}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(privateKey)
    .toString('base64url');
  return `${signingInput}.${signature}`;
}

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function isVerificationError(
  error: unknown,
  code: PlatformGoogleTokenVerificationError['code'],
): boolean {
  return error instanceof PlatformGoogleTokenVerificationError && error.code === code;
}
