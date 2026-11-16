/**
 * Clowder (貓群) and Cattery (貓窩) URLs in the Directory, mirroring the cats
 * canvas: `/new` creates, `/:id/settings` is the canvas with that group
 * selected, and `/:id` is the group's home page. The URL is the only source of
 * the selected group.
 */
export const CLOWDERS_DIRECTORY_PATH = '/entities/clowders';
export const CLOWDERS_DIRECTORY_NEW_PATH = '/entities/clowders/new';
export const CATTERIES_DIRECTORY_PATH = '/entities/catteries';
export const CATTERIES_DIRECTORY_NEW_PATH = '/entities/catteries/new';

export function buildClowderHomePath(clowderId: string): string {
  return `${CLOWDERS_DIRECTORY_PATH}/${encodeURIComponent(clowderId)}`;
}

export function buildClowderSettingsPath(clowderId: string): string {
  return `${buildClowderHomePath(clowderId)}/settings`;
}

export function buildCatteryHomePath(catteryId: string): string {
  return `${CATTERIES_DIRECTORY_PATH}/${encodeURIComponent(catteryId)}`;
}

export function buildCatterySettingsPath(catteryId: string): string {
  return `${buildCatteryHomePath(catteryId)}/settings`;
}
