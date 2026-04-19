export const FOLDER_BROWSE_PREFERENCE_SURFACES = ['chat', 'work', 'code'] as const;

export type FolderBrowsePreferenceSurface =
  typeof FOLDER_BROWSE_PREFERENCE_SURFACES[number];

export interface FolderBrowsePreferences {
  bySurface: Partial<Record<FolderBrowsePreferenceSurface, string>>;
  chatDirectLaneByCatId: Record<string, string>;
}

export interface FolderBrowsePreferenceScope {
  surface: FolderBrowsePreferenceSurface;
  directLaneCatId?: string | null;
}

export interface FolderBrowseResultLike {
  current: string;
  parent: string;
  entries: ReadonlyArray<{ name: string; path: string }>;
  error?: string;
}

function normalizeTrimmedString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isFolderBrowsePreferenceSurface(
  value: unknown,
): value is FolderBrowsePreferenceSurface {
  return typeof value === 'string'
    && (FOLDER_BROWSE_PREFERENCE_SURFACES as readonly string[]).includes(value);
}

export function createDefaultFolderBrowsePreferences(): FolderBrowsePreferences {
  return {
    bySurface: {},
    chatDirectLaneByCatId: {},
  };
}

export function normalizeFolderBrowsePreferences(
  value: unknown,
): FolderBrowsePreferences {
  const fallback = createDefaultFolderBrowsePreferences();
  if (typeof value !== 'object' || value === null) {
    return fallback;
  }

  const record = value as {
    bySurface?: unknown;
    chatDirectLaneByCatId?: unknown;
  };
  const bySurfaceRecord = typeof record.bySurface === 'object' && record.bySurface !== null
    ? record.bySurface as Record<string, unknown>
    : {};
  const chatDirectLaneRecord =
    typeof record.chatDirectLaneByCatId === 'object' && record.chatDirectLaneByCatId !== null
      ? record.chatDirectLaneByCatId as Record<string, unknown>
      : {};

  const bySurface: FolderBrowsePreferences['bySurface'] = {};
  for (const [key, rawValue] of Object.entries(bySurfaceRecord)) {
    const surface = isFolderBrowsePreferenceSurface(key) ? key : null;
    const path = normalizeTrimmedString(typeof rawValue === 'string' ? rawValue : null);
    if (surface && path) {
      bySurface[surface] = path;
    }
  }

  const chatDirectLaneByCatId: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(chatDirectLaneRecord)) {
    const catId = normalizeTrimmedString(key);
    const path = normalizeTrimmedString(typeof rawValue === 'string' ? rawValue : null);
    if (catId && path) {
      chatDirectLaneByCatId[catId] = path;
    }
  }

  return {
    bySurface,
    chatDirectLaneByCatId,
  };
}

export function readFolderBrowseRememberedPath(
  preferences: FolderBrowsePreferences | null | undefined,
  scope: FolderBrowsePreferenceScope,
): string | null {
  const normalized = normalizeFolderBrowsePreferences(preferences);
  const directLaneCatId = normalizeTrimmedString(scope.directLaneCatId);

  if (scope.surface === 'chat' && directLaneCatId) {
    return normalized.chatDirectLaneByCatId[directLaneCatId] ?? null;
  }

  return normalized.bySurface[scope.surface] ?? null;
}

export function writeFolderBrowseRememberedPath(
  preferences: FolderBrowsePreferences | null | undefined,
  scope: FolderBrowsePreferenceScope,
  path: string | null | undefined,
): FolderBrowsePreferences {
  const normalized = normalizeFolderBrowsePreferences(preferences);
  const nextPath = normalizeTrimmedString(path);
  const directLaneCatId = normalizeTrimmedString(scope.directLaneCatId);

  if (scope.surface === 'chat' && directLaneCatId) {
    const nextDirectLaneByCatId = { ...normalized.chatDirectLaneByCatId };
    if (nextPath) {
      nextDirectLaneByCatId[directLaneCatId] = nextPath;
    } else {
      delete nextDirectLaneByCatId[directLaneCatId];
    }
    return {
      bySurface: { ...normalized.bySurface },
      chatDirectLaneByCatId: nextDirectLaneByCatId,
    };
  }

  const nextBySurface = { ...normalized.bySurface };
  if (nextPath) {
    nextBySurface[scope.surface] = nextPath;
  } else {
    delete nextBySurface[scope.surface];
  }
  return {
    bySurface: nextBySurface,
    chatDirectLaneByCatId: { ...normalized.chatDirectLaneByCatId },
  };
}

export async function browseFolderWithHomeFallback<TResult extends FolderBrowseResultLike>(options: {
  browse: (targetPath?: string) => Promise<TResult>;
  requestedPath?: string | null;
  rememberedPath?: string | null;
}): Promise<TResult> {
  const requestedPath = normalizeTrimmedString(options.requestedPath);
  const rememberedPath = normalizeTrimmedString(options.rememberedPath);
  const initialPath = requestedPath ?? rememberedPath;
  const firstResult = await options.browse(initialPath ?? undefined);

  if (!firstResult.error || !rememberedPath || requestedPath) {
    return firstResult;
  }

  return options.browse(undefined);
}
