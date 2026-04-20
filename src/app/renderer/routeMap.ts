export type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import { isEnabledPlatformSurface, normalizePlatformSurface } from '../../shared/platformSurfaces.js';
import { resolvePlatformSurfaceApiBase } from '../../shared/platformSurfaceApi.js';
import {
  isSettingsPath,
} from '../../shared/platformRoutePaths.js';
import {
  listPlatformSurfaceDescriptors,
  resolvePlatformSurfaceFromPath,
} from '../../core/platformSurface.js';

export { isPlatformNonProductPath } from '../../shared/platformRoutePaths.js';

export interface PlatformSurfaceRoute {
  surface: PlatformSurfaceId;
  routePrefix: string;
  apiBase: string | null;
  placeholder: boolean;
}

export const PLATFORM_SURFACE_ROUTES = Object.fromEntries(
  listPlatformSurfaceDescriptors().map((descriptor) => [
    descriptor.id,
    {
      surface: descriptor.id,
      routePrefix: descriptor.routePrefix,
      apiBase: resolvePlatformSurfaceApiBase(descriptor.id),
      placeholder: !isEnabledPlatformSurface(descriptor.id),
    } satisfies PlatformSurfaceRoute,
  ]),
) as Record<PlatformSurfaceId, PlatformSurfaceRoute>;

export function resolvePlatformSurfaceForPath(pathname: string): PlatformSurfaceId {
  return resolvePlatformSurfaceFromPath(pathname);
}

export function resolvePreferredPlatformSurface(
  routeSurface: string | null | undefined,
  sessionSurface: string | null | undefined,
  storedSurface: string | null | undefined,
  fallbackSurface: string | null | undefined = 'chat',
): PlatformSurfaceId {
  const explicitSurface = normalizePlatformSurface(routeSurface);
  if (explicitSurface) {
    return explicitSurface;
  }

  const nextSessionSurface = normalizePlatformSurface(sessionSurface);
  if (nextSessionSurface) {
    return nextSessionSurface;
  }

  const nextStoredSurface = normalizePlatformSurface(storedSurface);
  if (nextStoredSurface) {
    return nextStoredSurface;
  }

  const nextFallbackSurface = normalizePlatformSurface(fallbackSurface);
  if (nextFallbackSurface) {
    return nextFallbackSurface;
  }

  return 'chat';
}

export function resolvePlatformShellSurface(
  pathname: string,
  lastKnownSurface: PlatformSurfaceId | null | undefined,
): PlatformSurfaceId {
  if (isSettingsPath(pathname)) {
    return lastKnownSurface ?? 'chat';
  }

  return resolvePlatformSurfaceForPath(pathname);
}
