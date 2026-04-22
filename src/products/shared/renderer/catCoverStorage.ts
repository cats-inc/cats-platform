const COVER_STORAGE_PREFIX = 'cats:draft-header:cover:';
const COVER_UPDATED_EVENT = 'cats:cat-cover-updated';
export const MAX_COVER_BYTES = 4 * 1024 * 1024;

function storageKey(catId: string): string {
  return COVER_STORAGE_PREFIX + catId;
}

export function readCatCover(catId: string | null | undefined): string | null {
  if (!catId) return null;
  try {
    return window.localStorage.getItem(storageKey(catId));
  } catch {
    return null;
  }
}

export function writeCatCover(catId: string, value: string | null): void {
  try {
    if (value == null) {
      window.localStorage.removeItem(storageKey(catId));
    } else {
      window.localStorage.setItem(storageKey(catId), value);
    }
  } catch {
    /* quota or privacy-mode: silently ignore */
  }
  window.dispatchEvent(new CustomEvent(COVER_UPDATED_EVENT, { detail: { catId } }));
}

export function subscribeCatCover(
  catId: string | null | undefined,
  callback: (value: string | null) => void,
): () => void {
  if (!catId) return () => {};
  function handle(event: Event) {
    const detail = (event as CustomEvent<{ catId: string }>).detail;
    if (detail?.catId === catId) {
      callback(readCatCover(catId));
    }
  }
  function handleStorage(event: StorageEvent) {
    if (event.key === storageKey(catId)) {
      callback(readCatCover(catId));
    }
  }
  window.addEventListener(COVER_UPDATED_EVENT, handle);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(COVER_UPDATED_EVENT, handle);
    window.removeEventListener('storage', handleStorage);
  };
}
