export type PlatformAuthGatePhase = 'pre_setup' | 'post_setup' | 'repair';

export type PlatformAuthRouteAccess = 'public' | 'protected';

export interface PlatformAuthRoutePolicyInput {
  pathname: string;
  method: string;
  phase: PlatformAuthGatePhase;
}

export interface PlatformAuthRoutePolicy {
  access: PlatformAuthRouteAccess;
  reason: string;
  minimalEnvelope: boolean;
}

export function classifyPlatformAuthRoute(
  input: PlatformAuthRoutePolicyInput,
): PlatformAuthRoutePolicy {
  const method = input.method.toUpperCase();
  const pathname = normalizePathname(input.pathname);

  if (isPublicRendererRoute(pathname, method)) {
    return publicRoute('renderer_navigation_or_asset');
  }
  if (isHealthRoute(pathname, method)) {
    return publicRoute('health');
  }
  if (isPublicMobileBootstrapRoute(pathname, method)) {
    return publicRoute('mobile_bootstrap');
  }
  if (isPublicMobileAuthRoute(pathname, method)) {
    return publicRoute('mobile_auth');
  }
  if (isPublicAuthRoute(pathname, method)) {
    return publicRoute('auth');
  }
  if (isAppShellBootstrapRoute(pathname, method)) {
    return publicRoute('minimal_app_shell', true);
  }
  if (input.phase === 'pre_setup' && isPublicPreSetupRoute(pathname, method)) {
    return publicRoute('pre_setup_bootstrap');
  }

  return {
    access: 'protected',
    reason: input.phase === 'repair' ? 'auth_repair_fail_closed' : 'protected_api',
    minimalEnvelope: false,
  };
}

export function isAppShellBootstrapRoute(pathname: string, method: string): boolean {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod === 'GET'
    && (pathname === '/api/app-shell' || pathname === '/api/views/app-shell');
}

function publicRoute(reason: string, minimalEnvelope = false): PlatformAuthRoutePolicy {
  return {
    access: 'public',
    reason,
    minimalEnvelope,
  };
}

function isPublicRendererRoute(pathname: string, method: string): boolean {
  if (method !== 'GET') {
    return false;
  }
  if (pathname.startsWith('/runtime/')) {
    return false;
  }
  return !pathname.startsWith('/api/');
}

function isHealthRoute(pathname: string, method: string): boolean {
  return method === 'GET' && pathname === '/health';
}

function isPublicMobileBootstrapRoute(pathname: string, method: string): boolean {
  if (method !== 'GET') {
    return false;
  }
  return pathname === '/api/mobile/manifest'
    || pathname.startsWith('/api/mobile/bundle/')
    || pathname.startsWith('/api/mobile/assets/')
    || pathname === '/assets'
    || pathname.startsWith('/assets/');
}

function isPublicMobileAuthRoute(pathname: string, method: string): boolean {
  return (
    pathname === '/api/mobile/auth/status' && method === 'GET'
  ) || (
    pathname === '/api/mobile/auth/login' && method === 'POST'
  ) || (
    pathname === '/api/mobile/auth/logout' && method === 'POST'
  );
}

function isPublicAuthRoute(pathname: string, method: string): boolean {
  return (
    pathname === '/api/auth/status' && method === 'GET'
  ) || (
    pathname === '/api/auth/login' && method === 'POST'
  ) || (
    pathname === '/api/auth/google/login' && method === 'POST'
  ) || (
    pathname === '/api/auth/repair/first-admin' && method === 'POST'
  ) || (
    pathname === '/api/auth/throttle/clear' && method === 'POST'
  ) || (
    pathname === '/api/auth/logout' && method === 'POST'
  );
}

function isPublicPreSetupRoute(pathname: string, method: string): boolean {
  if (
    (pathname === '/api/platform/ingress' && method === 'GET')
    || (pathname === '/api/platform/bootstrap-diagnostics' && method === 'GET')
    || (pathname === '/api/platform/bootstrap-diagnostics/opened' && method === 'POST')
    || (pathname === '/api/platform/setup/complete' && method === 'POST')
    || (pathname === '/api/setup/complete' && method === 'POST')
    || (pathname === '/api/platform/preferences' && method === 'POST')
    || (pathname === '/api/platform/guide-cat' && ['PUT', 'PATCH', 'DELETE'].includes(method))
    || (pathname === '/api/platform/assistants' && ['GET', 'POST'].includes(method))
  ) {
    return true;
  }
  return /^\/api\/platform\/assistants\/[^/]+$/u.test(pathname)
    && ['PUT', 'DELETE'].includes(method);
}

function normalizePathname(pathname: string): string {
  if (!pathname.startsWith('/')) {
    return `/${pathname}`;
  }
  return pathname;
}
