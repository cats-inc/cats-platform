export const AUTH_SESSION_COOKIE_NAME = 'cats_session';

export function serializeAuthSessionCookie(token: string, ttlMs: number): string {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(1, Math.floor(ttlMs / 1000))}`,
  ].join('; ');
}

export function clearAuthSessionCookie(): string {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}
