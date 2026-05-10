import { verifySessionTokenHash } from './session.js';
import type { PlatformSessionRecord } from './types.js';

export type CatsCsrfValidationResult =
  | { ok: true }
  | { ok: false; reason: 'missing_secret' | 'missing_token' | 'missing_session_hash' | 'mismatch' };

export function validateCatsCsrfToken(input: {
  session: PlatformSessionRecord;
  token: string | undefined;
  sessionSecret: string | null;
}): CatsCsrfValidationResult {
  if (!input.sessionSecret) {
    return { ok: false, reason: 'missing_secret' };
  }
  if (!input.token) {
    return { ok: false, reason: 'missing_token' };
  }
  if (!input.session.csrfTokenHash) {
    return { ok: false, reason: 'missing_session_hash' };
  }
  if (!verifySessionTokenHash(input.token, input.session.csrfTokenHash, input.sessionSecret)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}
