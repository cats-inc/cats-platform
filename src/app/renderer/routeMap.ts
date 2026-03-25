export type { SuiteSurfaceId } from '../../shared/suite-contract.js';
import type { SuiteSurfaceId } from '../../shared/suite-contract.js';

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
    placeholder: false,
  },
  work: {
    surface: 'work',
    routePrefix: '/work',
    apiBase: '/api/work',
    placeholder: true,
  },
  code: {
    surface: 'code',
    routePrefix: '/code',
    apiBase: '/api/code',
    placeholder: true,
  },
};

export function isSuiteNonProductPath(pathname: string): boolean {
  if (pathname === '/setup') {
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
