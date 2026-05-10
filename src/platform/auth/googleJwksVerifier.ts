import { webcrypto } from 'node:crypto';

import {
  PlatformGoogleTokenVerificationError,
  type PlatformGoogleIdTokenClaims,
  type PlatformGoogleIdTokenVerifier,
} from './googleVerifier.js';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const DEFAULT_JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

interface GoogleJwksResponse {
  keys?: unknown;
}

type GoogleRsaSigningJwk = Record<string, unknown> & {
  kty: 'RSA';
  use: 'sig';
  alg: 'RS256';
  kid: string;
  n: string;
  e: string;
};

interface CachedGoogleJwks {
  keysById: Map<string, GoogleRsaSigningJwk>;
  expiresAtMs: number;
}

export interface GoogleJwksIdTokenVerifierOptions {
  jwksUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export function createGoogleJwksIdTokenVerifier(
  options: GoogleJwksIdTokenVerifierOptions = {},
): PlatformGoogleIdTokenVerifier {
  const jwksUrl = options.jwksUrl ?? GOOGLE_JWKS_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  let cache: CachedGoogleJwks | null = null;

  async function readKeys(forceRefresh: boolean): Promise<CachedGoogleJwks> {
    const nowMs = (options.now?.() ?? new Date()).getTime();
    if (!forceRefresh && cache && cache.expiresAtMs > nowMs) {
      return cache;
    }

    let response: Response;
    try {
      response = await fetchImpl(jwksUrl, { headers: { Accept: 'application/json' } });
    } catch (error) {
      throw new PlatformGoogleTokenVerificationError(
        'invalid_token',
        `Failed to fetch Google JWKS: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      throw new PlatformGoogleTokenVerificationError(
        'invalid_token',
        `Failed to fetch Google JWKS (${response.status}).`,
      );
    }

    const payload = await response.json() as GoogleJwksResponse;
    const keysById = new Map<string, GoogleRsaSigningJwk>();
    for (const key of Array.isArray(payload.keys) ? payload.keys : []) {
      if (!isGoogleRsaSigningJwk(key)) {
        continue;
      }
      keysById.set(key.kid, key);
    }
    if (keysById.size === 0) {
      throw new PlatformGoogleTokenVerificationError(
        'invalid_token',
        'Google JWKS did not contain usable RSA signing keys.',
      );
    }

    cache = {
      keysById,
      expiresAtMs: nowMs + readCacheTtlMs(response.headers),
    };
    return cache;
  }

  return {
    async verifyIdToken(input) {
      const parsed = parseJwt(input.token);
      if (parsed.header.alg !== 'RS256' || typeof parsed.header.kid !== 'string') {
        throw new PlatformGoogleTokenVerificationError(
          'invalid_token',
          'Google ID token header is not an RS256 token with a key id.',
        );
      }

      let keys = await readKeys(false);
      let jwk = keys.keysById.get(parsed.header.kid);
      if (!jwk) {
        keys = await readKeys(true);
        jwk = keys.keysById.get(parsed.header.kid);
      }
      if (!jwk) {
        throw new PlatformGoogleTokenVerificationError(
          'invalid_token',
          'Google ID token key id is not in the current JWKS.',
        );
      }

      const key = await webcrypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const verified = await webcrypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        key,
        parsed.signature,
        new TextEncoder().encode(parsed.signingInput),
      );
      if (!verified) {
        throw new PlatformGoogleTokenVerificationError(
          'invalid_token',
          'Google ID token signature is invalid.',
        );
      }

      return parsed.claims;
    },
  };
}

function parseJwt(token: string): {
  header: { alg?: unknown; kid?: unknown };
  claims: PlatformGoogleIdTokenClaims;
  signingInput: string;
  signature: Uint8Array;
} {
  const [encodedHeader, encodedClaims, encodedSignature, extra] = token.split('.');
  if (!encodedHeader || !encodedClaims || !encodedSignature || extra !== undefined) {
    throw new PlatformGoogleTokenVerificationError(
      'invalid_token',
      'Google ID token must be a compact JWT.',
    );
  }
  return {
    header: readJsonSegment(encodedHeader, 'header'),
    claims: readJsonSegment(encodedClaims, 'claims'),
    signingInput: `${encodedHeader}.${encodedClaims}`,
    signature: base64UrlDecode(encodedSignature),
  };
}

function readJsonSegment<T>(segment: string, label: string): T {
  try {
    return JSON.parse(Buffer.from(base64UrlDecode(segment)).toString('utf8')) as T;
  } catch {
    throw new PlatformGoogleTokenVerificationError(
      'invalid_token',
      `Google ID token ${label} is not valid JSON.`,
    );
  }
}

function base64UrlDecode(value: string): Uint8Array {
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    throw new PlatformGoogleTokenVerificationError(
      'invalid_token',
      'Google ID token contains invalid base64url.',
    );
  }
}

function isGoogleRsaSigningJwk(value: unknown): value is GoogleRsaSigningJwk {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const key = value as Record<string, unknown>;
  return key.kty === 'RSA'
    && key.use === 'sig'
    && key.alg === 'RS256'
    && typeof key.kid === 'string'
    && typeof key.n === 'string'
    && typeof key.e === 'string';
}

function readCacheTtlMs(headers: Headers): number {
  const cacheControl = headers.get('cache-control');
  const maxAge = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/iu)?.[1];
  if (!maxAge) {
    return DEFAULT_JWKS_CACHE_TTL_MS;
  }
  const parsed = Number.parseInt(maxAge, 10);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed * 1000
    : DEFAULT_JWKS_CACHE_TTL_MS;
}
