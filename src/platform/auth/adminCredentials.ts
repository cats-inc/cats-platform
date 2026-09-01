/**
 * Shared Admin credential rules for first-admin setup and repair bootstrap.
 *
 * ADR-111 fixes one promotion-period password policy for both paths: 8 to 256
 * Unicode code points inclusive, with no composition rules. Length is counted
 * in code points, not UTF-16 code units, so an emoji or other astral character
 * counts once rather than twice.
 */

export const PLATFORM_ADMIN_PASSWORD_MIN_CODE_POINTS = 8;
export const PLATFORM_ADMIN_PASSWORD_MAX_CODE_POINTS = 256;

export type PlatformAdminCredentialRejectionReason =
  | 'identifier_required'
  | 'password_required'
  | 'password_too_short'
  | 'password_too_long';

export interface PlatformAdminCredentials {
  identifier: string;
  password: string;
}

export type PlatformAdminCredentialValidation =
  | { ok: true; credentials: PlatformAdminCredentials }
  | { ok: false; reason: PlatformAdminCredentialRejectionReason };

export class PlatformAdminCredentialError extends Error {
  constructor(public readonly reason: PlatformAdminCredentialRejectionReason) {
    super(describePlatformAdminCredentialRejection(reason));
    this.name = 'PlatformAdminCredentialError';
  }
}

export function countUnicodeCodePoints(value: string): number {
  let count = 0;
  for (const _codePoint of value) {
    count += 1;
  }
  return count;
}

export function validatePlatformAdminCredentials(input: {
  identifier: unknown;
  password: unknown;
}): PlatformAdminCredentialValidation {
  const identifier = typeof input.identifier === 'string' ? input.identifier.trim() : '';
  if (!identifier) {
    return { ok: false, reason: 'identifier_required' };
  }

  const password = typeof input.password === 'string' ? input.password : '';
  if (!password) {
    return { ok: false, reason: 'password_required' };
  }

  const codePoints = countUnicodeCodePoints(password);
  if (codePoints < PLATFORM_ADMIN_PASSWORD_MIN_CODE_POINTS) {
    return { ok: false, reason: 'password_too_short' };
  }
  if (codePoints > PLATFORM_ADMIN_PASSWORD_MAX_CODE_POINTS) {
    return { ok: false, reason: 'password_too_long' };
  }

  return { ok: true, credentials: { identifier, password } };
}

export function assertPlatformAdminCredentials(input: {
  identifier: unknown;
  password: unknown;
}): PlatformAdminCredentials {
  const validation = validatePlatformAdminCredentials(input);
  if (!validation.ok) {
    throw new PlatformAdminCredentialError(validation.reason);
  }
  return validation.credentials;
}

export function describePlatformAdminCredentialRejection(
  reason: PlatformAdminCredentialRejectionReason,
): string {
  switch (reason) {
    case 'identifier_required':
      return 'Admin identifier is required.';
    case 'password_required':
      return 'Admin password is required.';
    case 'password_too_short':
      return `Admin password must contain at least ${
        PLATFORM_ADMIN_PASSWORD_MIN_CODE_POINTS
      } characters.`;
    case 'password_too_long':
      return `Admin password must contain at most ${
        PLATFORM_ADMIN_PASSWORD_MAX_CODE_POINTS
      } characters.`;
  }
}
