import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Lets code outside the router, such as a composer toast's action, ask the app
 * to navigate. It stays an in-app route change, so unsent drafts survive
 * (SPEC-145 FR-C1); a full reload would drop them.
 */
export const RENDERER_NAVIGATE_EVENT = 'cats:navigate';

export function requestRendererNavigation(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new window.CustomEvent(RENDERER_NAVIGATE_EVENT, { detail: { path } }));
}

/** Mounted once, inside the router, by the app root. */
export function useRendererNavigationRequests(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const handle = (event: Event) => {
      const path = (event as CustomEvent<{ path?: unknown }>).detail?.path;
      if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) {
        navigate(path);
      }
    };
    window.addEventListener(RENDERER_NAVIGATE_EVENT, handle);
    return () => {
      window.removeEventListener(RENDERER_NAVIGATE_EVENT, handle);
    };
  }, [navigate]);
}
