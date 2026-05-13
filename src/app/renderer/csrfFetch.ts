// Renderer-side global fetch wrapper that attaches the CSRF token required by
// the platform auth gate (authGate.ts) to mutating same-origin /api requests.
//
// Without this, every POST/PUT/PATCH/DELETE from the renderer hits 403
// E_CSRF_MISMATCH once auth is enabled and the user is logged in via cookie.

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_HEADER = 'x-cats-csrf-token';

let cachedToken: string | null = null;
let inflightStatusFetch: Promise<string | null> | null = null;
let originalFetch: typeof window.fetch | null = null;
let installed = false;

export function seedCsrfToken(token: string | null | undefined): void {
  const trimmed = token?.trim();
  cachedToken = trimmed ? trimmed : null;
}

export function clearCsrfToken(): void {
  cachedToken = null;
}

async function refreshCsrfToken(): Promise<string | null> {
  if (!originalFetch) {
    return null;
  }
  if (inflightStatusFetch) {
    return inflightStatusFetch;
  }
  inflightStatusFetch = (async () => {
    try {
      const response = await originalFetch!('/api/auth/status', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as { csrfToken?: string | null };
      const token = payload?.csrfToken?.trim();
      return token ? token : null;
    } catch {
      return null;
    } finally {
      inflightStatusFetch = null;
    }
  })();
  const token = await inflightStatusFetch;
  if (token) {
    cachedToken = token;
  }
  return token;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method.toUpperCase();
  }
  if (input instanceof Request) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function isSameOriginApi(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      parsed.origin === window.location.origin
      && parsed.pathname.startsWith('/api/')
    );
  } catch {
    return false;
  }
}

function collectHeaderEntries(
  source: HeadersInit | undefined,
): Array<[string, string]> {
  if (!source) {
    return [];
  }
  if (source instanceof Headers) {
    const entries: Array<[string, string]> = [];
    source.forEach((value, key) => {
      entries.push([key, value]);
    });
    return entries;
  }
  if (Array.isArray(source)) {
    return source.map(([k, v]) => [k, v]);
  }
  return Object.entries(source as Record<string, string>);
}

function readEffectiveHeaders(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Array<[string, string]> {
  if (input instanceof Request) {
    return collectHeaderEntries(input.headers);
  }
  return collectHeaderEntries(init?.headers);
}

function hasHeader(entries: Array<[string, string]>, name: string): boolean {
  const lowered = name.toLowerCase();
  return entries.some(([key]) => key.toLowerCase() === lowered);
}

function hasBearerAuthorization(entries: Array<[string, string]>): boolean {
  return entries.some(([key, value]) => (
    key.toLowerCase() === 'authorization' && /^bearer\s/i.test(value)
  ));
}

function buildInitWithCsrf(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  token: string,
): { input: RequestInfo | URL; init: RequestInit | undefined } {
  if (input instanceof Request) {
    const headers = new Headers(input.headers);
    headers.set(CSRF_HEADER, token);
    const cloned = new Request(input, { headers });
    return { input: cloned, init };
  }
  const headers = new Headers(init?.headers);
  headers.set(CSRF_HEADER, token);
  return { input, init: { ...init, headers } };
}

async function isCsrfMismatchResponse(response: Response): Promise<boolean> {
  if (response.status !== 403) {
    return false;
  }
  try {
    const cloned = response.clone();
    const payload = await cloned.json() as { error?: { code?: unknown } } | null;
    return payload?.error?.code === 'E_CSRF_MISMATCH';
  } catch {
    return false;
  }
}

async function csrfAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!originalFetch) {
    throw new Error('csrfAwareFetch invoked before installation');
  }
  const method = methodOf(input, init);
  if (!MUTATING_METHODS.has(method)) {
    return originalFetch(input, init);
  }
  const url = urlOf(input);
  if (!isSameOriginApi(url)) {
    return originalFetch(input, init);
  }
  const headerEntries = readEffectiveHeaders(input, init);
  if (hasHeader(headerEntries, CSRF_HEADER)) {
    return originalFetch(input, init);
  }
  if (hasBearerAuthorization(headerEntries)) {
    return originalFetch(input, init);
  }

  let token = cachedToken ?? await refreshCsrfToken();
  if (!token) {
    return originalFetch(input, init);
  }

  const first = buildInitWithCsrf(input, init, token);
  const firstResponse = await originalFetch(first.input, first.init);
  if (!(await isCsrfMismatchResponse(firstResponse))) {
    return firstResponse;
  }

  clearCsrfToken();
  token = await refreshCsrfToken();
  if (!token) {
    return firstResponse;
  }
  const retried = buildInitWithCsrf(input, init, token);
  return originalFetch(retried.input, retried.init);
}

export function installCsrfFetch(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }
  installed = true;
  originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => (
    csrfAwareFetch(input, init)
  )) as typeof window.fetch;
}
