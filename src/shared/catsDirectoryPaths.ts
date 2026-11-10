/**
 * Cats Directory owns the cat roster and the add-cat flow (SPEC-102).
 * Settings keeps only app-level pages, so every "manage your cats" entry
 * point navigates here instead of to a Settings route.
 */
export const CATS_DIRECTORY_PATH = '/entities/cats';
export const CATS_DIRECTORY_NEW_CAT_PATH = '/entities/cats/new';

/** A cat's profile page; a stable contract (SPEC-102 path stability). */
export function buildCatProfilePath(catId: string): string {
  return `${CATS_DIRECTORY_PATH}/${encodeURIComponent(catId)}`;
}

/**
 * A cat's settings: the cats canvas with that cat selected. The URL is the
 * only source of the selected cat, so every way of picking one navigates here.
 */
export function buildCatSettingsPath(catId: string): string {
  return `${buildCatProfilePath(catId)}/settings`;
}
