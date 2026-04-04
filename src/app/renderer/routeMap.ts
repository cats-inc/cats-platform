export type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import { isEnabledPlatformSurface } from '../../shared/platformSurfaces.js';

export interface PlatformSurfaceRoute {
  surface: PlatformSurfaceId;
  routePrefix: string;
  apiBase: string | null;
  placeholder: boolean;
}

export const PLATFORM_SURFACE_ROUTES: Record<PlatformSurfaceId, PlatformSurfaceRoute> = {
  chat: {
    surface: 'chat',
    routePrefix: '/chat',
    apiBase: null,
    placeholder: !isEnabledPlatformSurface('chat'),
  },
  work: {
    surface: 'work',
    routePrefix: '/work',
    apiBase: '/api/work',
    placeholder: !isEnabledPlatformSurface('work'),
  },
  code: {
    surface: 'code',
    routePrefix: '/code',
    apiBase: '/api/code',
    placeholder: !isEnabledPlatformSurface('code'),
  },
};

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
  if (pathname === '/work' || pathname.startsWith('/work/')) {
    return 'work';
  }

  if (pathname === '/code' || pathname.startsWith('/code/')) {
    return 'code';
  }

  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
    return 'chat';
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
