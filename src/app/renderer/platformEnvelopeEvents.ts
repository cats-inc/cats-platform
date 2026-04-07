export const PLATFORM_ENVELOPE_REFRESH_EVENT = 'cats:platform-envelope-refresh';

export function dispatchPlatformEnvelopeRefresh(): void {
  const browserHost = globalThis as typeof globalThis & {
    document?: unknown;
    dispatchEvent?: (event: { type: string }) => boolean;
    CustomEvent?: new (type: string, init?: { detail?: unknown }) => { type: string };
  };

  if (
    browserHost.document === undefined
    || typeof browserHost.dispatchEvent !== 'function'
    || typeof browserHost.CustomEvent !== 'function'
  ) {
    return;
  }

  browserHost.dispatchEvent(new browserHost.CustomEvent(PLATFORM_ENVELOPE_REFRESH_EVENT));
}
