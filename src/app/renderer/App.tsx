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
  const targetSurface = envelope?.lastProductSurface ?? 'chat';

  useEffect(() => {
    if (!setupComplete) {
      return;
    }
    const currentSurface = resolveSuiteSurfaceForPath(location.pathname);
    // Don't sync when we're at `/` and about to redirect to a non-chat product —
    // the redirect will fire the correct sync on the next render.
    if (location.pathname === '/' && targetSurface !== 'chat') {
      return;
    }
    if (lastSyncedSurface.current === null) {
      lastSyncedSurface.current = currentSurface;
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
  }, [setupComplete, targetSurface, location.pathname]);

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
        onComplete={(updatedEnvelope) => {
          startTransition(() =>
            setState({ status: 'ready', envelope: updatedEnvelope }),
          );
          const surface = updatedEnvelope.lastProductSurface ?? 'chat';
          const route = SUITE_SURFACE_ROUTES[surface];
          navigate(route.routePrefix, { replace: true });
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
          targetSurface !== 'chat'
            ? <Navigate to={SUITE_SURFACE_ROUTES[targetSurface].routePrefix} replace />
            : <ChatApp />
        }
      />
      <Route path="*" element={<ChatApp />} />
    </Routes>
  );
}
