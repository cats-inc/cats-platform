type OpenBrowserContext = (
  url?: string,
  target?: string,
  features?: string,
) => unknown;

interface BrowserLinkContext {
  window?: {
    open?: OpenBrowserContext;
  };
  location?: {
    assign?: (url: string) => void;
  };
}

export function resolveCatsRuntimeRootUrl(runtimeBaseUrl: string): string {
  return new URL('/', runtimeBaseUrl).toString();
}

export function openCatsRuntimeRoot(
  runtimeBaseUrl: string,
  openWindow: OpenBrowserContext | null = null,
): void {
  const runtimeRootUrl = resolveCatsRuntimeRootUrl(runtimeBaseUrl);

  const browserContext = globalThis as BrowserLinkContext;
  const resolvedOpenWindow = openWindow
    ?? browserContext.window?.open?.bind(browserContext.window)
    ?? null;

  if (resolvedOpenWindow) {
    resolvedOpenWindow(runtimeRootUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  if (typeof browserContext.location?.assign === 'function') {
    browserContext.location.assign(runtimeRootUrl);
    return;
  }

  throw new Error('Cats Runtime link requires a browser navigation context.');
}
