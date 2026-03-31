export type { SuiteSurfaceId } from '../../shared/suite-contract.js';
import type { SuiteSurfaceId } from '../../shared/suite-contract.js';
import { isEnabledSuiteSurface } from '../../shared/suiteSurfaces.js';

export interface SuiteSurfaceRoute {
  surface: SuiteSurfaceId;
  routePrefix: string;
  apiBase: string | null;
  placeholder: boolean;
}

export const SUITE_SURFACE_ROUTES: Record<SuiteSurfaceId, SuiteSurfaceRoute> = {
  chat: {
    surface: 'chat',
    routePrefix: '/chat',
    apiBase: null,
    placeholder: !isEnabledSuiteSurface('chat'),
  },
  work: {
    surface: 'work',
    routePrefix: '/work',
    apiBase: '/api/work',
    placeholder: !isEnabledSuiteSurface('work'),
  },
  code: {
    surface: 'code',
    routePrefix: '/code',
    apiBase: '/api/code',
    placeholder: !isEnabledSuiteSurface('code'),
  },
};

export function isSuiteNonProductPath(pathname: string): boolean {
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

  return pathname === '/chat/settings' || pathname.startsWith('/chat/settings/');
}

export function resolveSuiteSurfaceForPath(pathname: string): SuiteSurfaceId {
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
