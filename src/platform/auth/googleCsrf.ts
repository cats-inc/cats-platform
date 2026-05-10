export const GOOGLE_GIS_CSRF_COOKIE_NAME = 'g_csrf_token';

export type GoogleGisCsrfValidationResult =
  | { ok: true }
  | { ok: false; reason: 'missing_cookie' | 'missing_body_token' | 'mismatch' };

export function validateGoogleGisCsrfToken(input: {
  cookieHeader: string | string[] | undefined;
  bodyToken: unknown;
}): GoogleGisCsrfValidationResult {
  const cookieToken = readCookie(input.cookieHeader, GOOGLE_GIS_CSRF_COOKIE_NAME);
  if (!cookieToken) {
    return { ok: false, reason: 'missing_cookie' };
  }
  const bodyToken = typeof input.bodyToken === 'string' ? input.bodyToken.trim() : '';
  if (!bodyToken) {
    return { ok: false, reason: 'missing_body_token' };
  }
  if (cookieToken !== bodyToken) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}

function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | null {
  const value = Array.isArray(header) ? header.join(';') : header;
  if (!value) {
    return null;
  }
  for (const part of value.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('=')).trim() || null;
    }
  }
  return null;
}
