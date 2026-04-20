export type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import { isEnabledPlatformSurface, normalizePlatformSurface } from '../../shared/platformSurfaces.js';
import { resolvePlatformSurfaceApiBase } from '../../shared/platformSurfaceApi.js';
import {
  listPlatformSurfaceDescriptors,
  resolvePlatformSurfaceFromPath,
} from '../../core/platformSurface.js';

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

export function isPlatformNonProductPath(pathname: string): boolean {
  if (pathname === '/setup') {
    return true;
  }

  if (
    pathname === '/lobby'
    || pathname.startsWith('/lobby/')
    || pathname === '/products'
    || pathname.startsWith('/products/')
  ) {
    return true;
  }

  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return true;
  }

  return false;
}

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
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return lastKnownSurface ?? 'chat';
  }

  return resolvePlatformSurfaceForPath(pathname);
}
