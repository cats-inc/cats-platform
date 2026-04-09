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

export function openBrowserUrl(
  url: string,
  openWindow: OpenBrowserContext | null = null,
): void {
  const browserContext = globalThis as BrowserLinkContext;
  const resolvedOpenWindow = openWindow
    ?? browserContext.window?.open?.bind(browserContext.window)
    ?? null;

  if (resolvedOpenWindow) {
    resolvedOpenWindow(url, '_blank', 'noopener,noreferrer');
    return;
  }

  if (typeof browserContext.location?.assign === 'function') {
    browserContext.location.assign(url);
    return;
  }

  throw new Error('External link requires a browser navigation context.');
}
