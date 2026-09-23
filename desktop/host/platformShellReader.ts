import type { AppShellPayload } from './readiness.js';
import { parseDesktopHostPlatformShellUpdate } from './platformShellUpdate.js';

type SessionFetch = (url: string, init: RequestInit) => Promise<Response>;

function parsePlatformShellResponse(value: unknown): AppShellPayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid platform shell response.');
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.products)
    && (record.setupCompleteAt === null || typeof record.setupCompleteAt === 'string')) {
    return parseDesktopHostPlatformShellUpdate(record);
  }

  // A logged-out/repair response deliberately omits products. Preserve the
  // setup fact, but never retain authenticated shortcuts across sign-out.
  const auth = record.auth as { authenticated?: unknown } | undefined;
  const setup = record.setup as { completeAt?: unknown } | undefined;
  if (auth?.authenticated === false
    && (setup?.completeAt === null || typeof setup?.completeAt === 'string')) {
    return { setupCompleteAt: setup.completeAt, products: [] };
  }
  // A malformed success response is not an authoritative empty product list.
  throw new Error('Invalid platform shell response.');
}

/** Uses the window's session, including its HttpOnly login cookie. */
export class DesktopPlatformShellReader {
  private payload: AppShellPayload | null = null;
  private revision = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly sessionFetch: SessionFetch,
  ) {}

  read(): AppShellPayload | null {
    return this.payload;
  }

  replace(payload: AppShellPayload | null): void {
    this.revision += 1;
    this.payload = payload;
  }

  async refresh(): Promise<void> {
    const revision = ++this.revision;
    const response = await this.sessionFetch(`${this.baseUrl}/api/app-shell`, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch platform shell: HTTP ${response.status}`);
    }
    const payload = parsePlatformShellResponse(await response.json());
    // Login/logout or a renderer update may supersede an in-flight refresh.
    if (revision === this.revision) this.payload = payload;
  }
}

export function isDesktopPlatformSessionCookie(
  cookie: { name: string; domain?: string },
  appBaseUrl: string,
): boolean {
  return cookie.name === 'cats_session'
    && cookie.domain?.replace(/^\./u, '') === new URL(appBaseUrl).hostname;
}
