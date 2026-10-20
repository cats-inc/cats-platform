// Host-only downloads for the official App catalog and its release artifacts (SPEC-120 FR-09).
// Every hop is HTTPS to an allowed host; redirects are followed by hand so a release
// download can reach GitHub's asset host without letting any other destination in.
export type AppCatalogFetchKind = 'catalog' | 'artifact';

export class AppCatalogError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AppCatalogError';
  }
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ARTIFACT_PATH = /^\/cats-inc\/cats-apps\/releases\/download\/[a-z][a-z0-9-]*-v\d+\.\d+\.\d+\/[a-z][a-z0-9-]*-\d+\.\d+\.\d+\.catsapp$/;

function isPlainHttps(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port;
}

// The first request must name the official catalog or a cats-apps release asset.
export function isAllowedAppCatalogSource(kind: AppCatalogFetchKind, url: URL): boolean {
  if (!isPlainHttps(url) || url.search || url.hash) return false;
  return kind === 'catalog'
    ? url.hostname === 'cats-inc.github.io' && url.pathname.startsWith('/cats-apps/')
    : url.hostname === 'github.com' && ARTIFACT_PATH.test(url.pathname);
}

// Release downloads redirect to GitHub's asset hosts with signed query strings. The
// artifact digest, not the redirect target, is what binds the downloaded bytes.
export function isAllowedAppCatalogRedirect(kind: AppCatalogFetchKind, url: URL): boolean {
  if (!isPlainHttps(url)) return false;
  return kind === 'catalog'
    ? url.hostname === 'cats-inc.github.io'
    : url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com');
}

export async function fetchAppCatalogBytes(
  kind: AppCatalogFetchKind,
  source: string,
  options: { maxBytes: number; timeoutMs: number; fetch?: typeof fetch },
): Promise<Uint8Array> {
  const fetchImpl = options.fetch ?? fetch;
  let url = new URL(source);
  if (!isAllowedAppCatalogSource(kind, url)) throw new AppCatalogError('download_rejected', `Refusing to download from ${url.origin}.`);
  const signal = AbortSignal.timeout(options.timeoutMs);
  try {
    for (let hop = 0; ; hop++) {
      const response = await fetchImpl(url, { redirect: 'manual', signal });
      if (REDIRECT_STATUSES.has(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        const next = location ? new URL(location, url) : null;
        if (!next || hop >= MAX_REDIRECTS || !isAllowedAppCatalogRedirect(kind, next)) {
          throw new AppCatalogError('download_rejected', `Refusing a redirect to ${next?.origin ?? 'an empty location'}.`);
        }
        url = next;
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new AppCatalogError('download_failed', `Download failed with HTTP ${response.status}.`);
      }
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > options.maxBytes) {
        await response.body.cancel();
        throw new AppCatalogError('download_rejected', `Download exceeds ${options.maxBytes} bytes.`);
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > options.maxBytes) {
          await reader.cancel();
          throw new AppCatalogError('download_rejected', `Download exceeds ${options.maxBytes} bytes.`);
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    }
  } catch (error) {
    if (error instanceof AppCatalogError) throw error;
    throw new AppCatalogError('download_failed', `Download failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
