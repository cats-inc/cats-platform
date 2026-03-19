export const SIDEBAR_OPEN_STORAGE_KEY = 'cats-inc.sidebar-open';

interface SidebarPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseStoredSidebarOpen(value: string | null | undefined): boolean {
  if (value === 'collapsed') {
    return false;
  }
  return true;
}

export function readSidebarOpenPreference(
  storage: SidebarPreferenceStorage | null | undefined,
): boolean {
  if (!storage) {
    return true;
  }

  try {
    return parseStoredSidebarOpen(storage.getItem(SIDEBAR_OPEN_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function writeSidebarOpenPreference(
  storage: SidebarPreferenceStorage | null | undefined,
  isOpen: boolean,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(SIDEBAR_OPEN_STORAGE_KEY, isOpen ? 'open' : 'collapsed');
  } catch {
    // Ignore storage failures and keep the in-memory toggle working.
  }
}
