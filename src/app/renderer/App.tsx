import { startTransition, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import type { PlatformHostEnvelope } from '../../shared/platform-contract';
import ChatApp from '../../products/chat/renderer/App';
import WorkApp from '../../products/work/renderer/App';
import CodeApp from '../../products/code/renderer/App';
import {
  isPlatformNonProductPath,
  resolvePlatformSurfaceForPath,
  PLATFORM_SURFACE_ROUTES,
} from './routeMap';
import { PlatformLobby } from './PlatformLobby';
import { PlatformSetupWizard } from './setup';
import { fetchPlatformEnvelope } from './setup/api';

type PlatformLoadState =
  | { status: 'loading' }
  | { status: 'ready'; envelope: PlatformHostEnvelope }
  | { status: 'error'; message: string };

function resolveProductEntryPath(surface: string): string {
  const route = PLATFORM_SURFACE_ROUTES[surface as keyof typeof PLATFORM_SURFACE_ROUTES];
  return route ? route.routePrefix : '/';
}

export default function PlatformApp() {
  const location = useLocation();
  const [state, setState] = useState<PlatformLoadState>({ status: 'loading' });
  const lastSyncedSurface = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetchPlatformEnvelope(controller.signal)
      .then((envelope) => {
        if (!controller.signal.aborted) {
          startTransition(() => setState({ status: 'ready', envelope }));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load',
          });
        }
      });

    return () => controller.abort();
  }, []);

  const envelope = state.status === 'ready' ? state.envelope : null;
  const setupComplete = Boolean(envelope?.setupCompleteAt);
  const storedSurface = envelope?.lastProductSurface ?? 'chat';

  useEffect(() => {
    if (!setupComplete) {
      return;
    }
    const currentSurface = resolvePlatformSurfaceForPath(location.pathname);
    // Skip sync when at `/` and about to redirect to a non-chat product.
    if (location.pathname === '/' && storedSurface !== 'chat') {
      return;
    }
    // Skip sync for platform-level routes that aren't product surfaces.
    if (isPlatformNonProductPath(location.pathname)) {
      return;
    }
    // First render: seed the ref AND sync if the current surface differs
    // from what's stored (e.g. deep-linked to /work when stored is chat).
    if (lastSyncedSurface.current === null) {
      lastSyncedSurface.current = currentSurface;
      if (currentSurface !== storedSurface) {
        void fetch('/api/platform/preferences', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lastProductSurface: currentSurface }),
        }).catch(() => {});
      }
      return;
    }
    if (currentSurface !== lastSyncedSurface.current) {
      lastSyncedSurface.current = currentSurface;
      void fetch('/api/platform/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lastProductSurface: currentSurface }),
      }).catch(() => {});
    }
  }, [setupComplete, storedSurface, location.pathname]);

  if (state.status === 'loading') {
    return (
      <div className="screen screenCentered">
        <div className="loadingPanel">
          <p className="eyebrow">Cats</p>
          <h1>Loading&hellip;</h1>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="screen screenCentered">
        <div className="errorPanel">
          <p className="eyebrow">Error</p>
          <h1>Could not start Cats</h1>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { envelope: readyEnvelope } = state;

  if (!readyEnvelope.setupCompleteAt) {
    // Setup incomplete: `/setup` shows wizard, everything else redirects to `/setup`.
    return (
      <Routes>
        <Route
          path="/setup"
          element={
            <PlatformSetupWizard
              envelope={readyEnvelope}
              onComplete={() => {
                window.location.href = '/';
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  // Setup complete: products at their own prefix, settings at /settings/*.
  const entryPath = resolveProductEntryPath(storedSurface);
  const settingsSurfaceElement = storedSurface === 'work'
    ? <WorkApp />
    : storedSurface === 'code'
      ? <CodeApp />
      : <ChatApp />;
  return (
    <Routes>
      <Route path="/lobby" element={<PlatformLobby envelope={readyEnvelope} />} />
      <Route path="/products" element={<Navigate to="/lobby" replace />} />
      <Route path="/settings/*" element={settingsSurfaceElement} />
      <Route path={`${PLATFORM_SURFACE_ROUTES.chat.routePrefix}/*`} element={<ChatApp />} />
      <Route path={`${PLATFORM_SURFACE_ROUTES.work.routePrefix}/*`} element={<WorkApp />} />
      <Route path={`${PLATFORM_SURFACE_ROUTES.code.routePrefix}/*`} element={<CodeApp />} />
      <Route path="/setup" element={<Navigate to={entryPath} replace />} />
      <Route path="/" element={<Navigate to={entryPath} replace />} />
      <Route path="*" element={<Navigate to={entryPath} replace />} />
    </Routes>
  );
}
