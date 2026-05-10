export type PlatformGoogleTokenVerificationErrorCode =
  | 'invalid_token'
  | 'missing_audience'
  | 'audience_mismatch'
  | 'issuer_mismatch'
  | 'expired'
  | 'missing_subject'
  | 'missing_email'
  | 'email_unverified'
  | 'hosted_domain_mismatch'
  | 'nonce_mismatch';

export class PlatformGoogleTokenVerificationError extends Error {
  constructor(
    public readonly code: PlatformGoogleTokenVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlatformGoogleTokenVerificationError';
  }
}

export interface PlatformGoogleIdTokenClaims {
  sub?: unknown;
  aud?: unknown;
  iss?: unknown;
  exp?: unknown;
  email?: unknown;
  email_verified?: unknown;
  hd?: unknown;
  name?: unknown;
  picture?: unknown;
  nonce?: unknown;
}

export interface PlatformVerifiedGoogleIdentity {
  providerSubject: string;
  email: string;
  hostedDomain: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  audience: string;
  issuer: string;
  expiresAt: string;
}

export interface PlatformGoogleIdTokenVerifier {
  verifyIdToken(input: {
    token: string;
    audiences: readonly string[];
  }): Promise<PlatformGoogleIdTokenClaims>;
}

const GOOGLE_TOKEN_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);
const DEFAULT_CLOCK_SKEW_MS = 60_000;

export async function verifyPlatformGoogleIdentityToken(input: {
  token: string;
  audiences: readonly string[];
  hostedDomains?: readonly string[];
  verifier: PlatformGoogleIdTokenVerifier;
  expectedNonce?: string | null;
  now?: Date;
  clockSkewMs?: number;
}): Promise<PlatformVerifiedGoogleIdentity> {
  const token = input.token.trim();
  if (!token) {
    throw new PlatformGoogleTokenVerificationError('invalid_token', 'Google token is required.');
  }
  const audiences = normalizeStringList(input.audiences);
  if (audiences.length === 0) {
    throw new PlatformGoogleTokenVerificationError(
      'missing_audience',
      'At least one Google audience is required.',
    );
  }

  const claims = await input.verifier.verifyIdToken({ token, audiences });
  const issuer = readRequiredString(claims.iss, 'issuer_mismatch', 'Google issuer is missing.');
  if (!GOOGLE_TOKEN_ISSUERS.has(issuer)) {
    throw new PlatformGoogleTokenVerificationError(
      'issuer_mismatch',
      'Google issuer is not trusted.',
    );
  }

  const audience = readAudience(claims.aud, audiences);
  validateNonce(claims.nonce, input.expectedNonce);
  const expiresAt = readExpiry(claims.exp);
  const nowMs = input.now?.getTime() ?? Date.now();
  const clockSkewMs = input.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  if (expiresAt.getTime() <= nowMs - clockSkewMs) {
    throw new PlatformGoogleTokenVerificationError('expired', 'Google token is expired.');
  }

  const providerSubject = readRequiredString(
    claims.sub,
    'missing_subject',
    'Google subject is missing.',
  );
  const email = readRequiredString(claims.email, 'missing_email', 'Google email is missing.');
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new PlatformGoogleTokenVerificationError(
      'email_unverified',
      'Google email is not verified.',
    );
  }

  const hostedDomain = readOptionalString(claims.hd);
  const hostedDomains = normalizeStringList(input.hostedDomains ?? []);
  if (hostedDomains.length > 0 && (!hostedDomain || !hostedDomains.includes(hostedDomain))) {
    throw new PlatformGoogleTokenVerificationError(
      'hosted_domain_mismatch',
      'Google hosted domain is not allowed.',
    );
  }

  return {
    providerSubject,
    email: email.toLowerCase(),
    hostedDomain,
    displayName: readOptionalString(claims.name),
    avatarUrl: readOptionalString(claims.picture),
    audience,
    issuer,
    expiresAt: expiresAt.toISOString(),
  };
}

function validateNonce(value: unknown, expectedNonce: string | null | undefined): void {
  const expected = expectedNonce?.trim();
  if (!expected) {
    return;
  }
  if (readOptionalString(value) !== expected) {
    throw new PlatformGoogleTokenVerificationError(
      'nonce_mismatch',
      'Google nonce is not valid for this request.',
    );
  }
}

function readAudience(value: unknown, allowedAudiences: readonly string[]): string {
  const candidates = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : typeof value === 'string'
      ? [value]
      : [];
  const matched = candidates.find((candidate) => allowedAudiences.includes(candidate));
  if (!matched) {
    throw new PlatformGoogleTokenVerificationError(
      'audience_mismatch',
      'Google audience is not allowed.',
    );
  }
  return matched;
}

function readExpiry(value: unknown): Date {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PlatformGoogleTokenVerificationError('expired', 'Google expiry is missing.');
  }
  return new Date(value * 1000);
}

function readRequiredString(
  value: unknown,
  code: PlatformGoogleTokenVerificationErrorCode,
  message: string,
): string {
  const normalized = readOptionalString(value);
  if (!normalized) {
    throw new PlatformGoogleTokenVerificationError(code, message);
  }
  return normalized;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeStringList(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
