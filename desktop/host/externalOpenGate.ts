export const DEFAULT_EXTERNAL_DESKTOP_OPEN_DEDUP_WINDOW_MS = 1_500;

export interface ExternalDesktopOpenDeduper {
  shouldOpen(url: string, nowMs?: number): boolean;
}

export function createExternalDesktopOpenDeduper(
  windowMs = DEFAULT_EXTERNAL_DESKTOP_OPEN_DEDUP_WINDOW_MS,
): ExternalDesktopOpenDeduper {
  let lastOpen: { url: string; openedAtMs: number } | null = null;

  return {
    shouldOpen(url: string, nowMs = Date.now()): boolean {
      const elapsedMs = lastOpen ? nowMs - lastOpen.openedAtMs : Number.POSITIVE_INFINITY;
      if (lastOpen?.url === url && elapsedMs >= 0 && elapsedMs < windowMs) {
        return false;
      }

      lastOpen = { url, openedAtMs: nowMs };
      return true;
    },
  };
}
