import { startTransition, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { SuiteHostEnvelope } from '../../shared/suite-contract';
import ChatApp from '../../products/chat/renderer/App';
import WorkApp from '../../products/work/renderer/App';
import CodeApp from '../../products/code/renderer/App';
import { resolveSuiteSurfaceForPath, SUITE_SURFACE_ROUTES } from './routeMap';
import { SuiteSetupWizard } from './setup';
import { fetchSuiteEnvelope } from './setup/api';

type SuiteLoadState =
  | { status: 'loading' }
  | { status: 'ready'; envelope: SuiteHostEnvelope }
  | { status: 'error'; message: string };

export default function SuiteApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<SuiteLoadState>({ status: 'loading' });
  const lastSyncedSurface = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetchSuiteEnvelope(controller.signal)
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
    const currentSurface = resolveSuiteSurfaceForPath(location.pathname);
    // Skip sync when at `/` and about to redirect to non-chat product.
    if (location.pathname === '/' && storedSurface !== 'chat') {
      return;
    }
    // First render: seed the ref AND sync if the current surface differs
    // from what's stored (e.g. deep-linked to /work when stored is chat).
    if (lastSyncedSurface.current === null) {
      lastSyncedSurface.current = currentSurface;
      if (currentSurface !== storedSurface) {
        void fetch('/api/suite/preferences', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lastProductSurface: currentSurface }),
        }).catch(() => {});
      }
      return;
    }
    if (currentSurface !== lastSyncedSurface.current) {
      lastSyncedSurface.current = currentSurface;
      void fetch('/api/suite/preferences', {
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

  if (!state.envelope.setupCompleteAt) {
    return (
      <SuiteSetupWizard
        envelope={state.envelope}
        onComplete={() => {
          // Full reload so the suite re-fetches a clean envelope and
          // ChatApp mounts fresh with its own routing.
          window.location.href = '/';
        }}
      />
    );
  }

  return (
    <Routes>
      <Route path={`${SUITE_SURFACE_ROUTES.work.routePrefix}/*`} element={<WorkApp />} />
      <Route path={`${SUITE_SURFACE_ROUTES.code.routePrefix}/*`} element={<CodeApp />} />
      <Route
        path="/"
        element={
          storedSurface !== 'chat'
            ? <Navigate to={SUITE_SURFACE_ROUTES[storedSurface].routePrefix} replace />
            : <ChatApp />
        }
      />
      <Route path="*" element={<ChatApp />} />
    </Routes>
  );
}
