import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readDesktopGoogleClientId(
  configDir: string, env: NodeJS.ProcessEnv,
): Promise<string | null> {
  const configured = env.CATS_AUTH_GOOGLE_DESKTOP_CLIENT_ID?.trim();
  if (configured) return configured;
  try {
    const value = JSON.parse(await readFile(path.join(configDir, 'google-desktop-oauth.json'), 'utf8')) as {
      clientId?: unknown;
    };
    return typeof value.clientId === 'string' ? value.clientId.trim() || null : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('The distributor Google Desktop configuration is invalid.');
  }
}

/** Node fetch avoids putting the private host key into renderer networking. */
export function createDesktopGoogleTransport(options: {
  baseUrl: string;
  key: string;
  sessionCookie: () => Promise<string | null>;
  fetch?: typeof fetch;
}) {
  const allowed = new Set(['/api/desktop/auth/google/start', '/api/desktop/auth/google/complete',
    '/api/desktop/auth/google/cancel', '/api/platform/setup/complete', '/api/auth/password/first']);
  return async (pathname: string, body: unknown, headers: Record<string, string> = {}) => {
    if (!allowed.has(pathname)) throw new Error('Invalid native Google transport path.');
    const cookie = await options.sessionCookie();
    const privateRoute = pathname.startsWith('/api/desktop/auth/google/');
    const response = await (options.fetch ?? fetch)(new URL(pathname, options.baseUrl), {
      method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(pathname.endsWith('/cancel') ? 1000 : 25_000),
      headers: { 'content-type': 'application/json', ...headers,
        ...(cookie ? { cookie: `cats_session=${encodeURIComponent(cookie)}` } : {}),
        ...(privateRoute ? { 'x-cats-desktop-auth-key': options.key }
          : { origin: new URL(options.baseUrl).origin }),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as unknown,
      setCookie: response.headers.get('set-cookie') ?? undefined };
  };
}

export function desktopGoogleSessionCookie(cookie: string, baseUrl: string) {
  const pieces = cookie.split(';').map((piece) => piece.trim());
  const token = /^cats_session=([^;]+)$/u.exec(pieces[0] ?? '')?.[1];
  const maxAge = pieces.find((piece) => /^Max-Age=/iu.test(piece))?.split('=')[1];
  if (!token || !pieces.some((piece) => /^HttpOnly$/iu.test(piece))
    || !pieces.some((piece) => /^SameSite=Lax$/iu.test(piece)) || !maxAge
    || !/^\d+$/u.test(maxAge) || Number(maxAge) <= 0) throw new Error('Invalid Cats session cookie.');
  return { url: new URL(baseUrl).origin, name: 'cats_session', value: decodeURIComponent(token),
    path: '/', httpOnly: true, secure: new URL(baseUrl).protocol === 'https:', sameSite: 'lax' as const,
    expirationDate: Math.floor(Date.now() / 1000) + Number(maxAge) };
}
