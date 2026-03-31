import { startTransition, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import type { SuiteHostEnvelope } from '../../shared/suite-contract';
import ChatApp from '../../products/chat/renderer/App';
import WorkApp from '../../products/work/renderer/App';
import CodeApp from '../../products/code/renderer/App';
import {
  isSuiteNonProductPath,
  resolveSuiteSurfaceForPath,
  SUITE_SURFACE_ROUTES,
} from './routeMap';
import { SuiteLobby } from './SuiteLobby';
import { SuiteSettingsRoutes } from './settings/SuiteSettingsRoutes';
import { SuiteSetupWizard } from './setup';
import { fetchSuiteEnvelope } from './setup/api';

type SuiteLoadState =
  | { status: 'loading' }
  | { status: 'ready'; envelope: SuiteHostEnvelope }
  | { status: 'error'; message: string };

function resolveProductEntryPath(surface: string): string {
  const route = SUITE_SURFACE_ROUTES[surface as keyof typeof SUITE_SURFACE_ROUTES];
  return route ? route.routePrefix : '/';
}

export default function SuiteApp() {
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

  const onEnvelopeUpdate = (updater: (current: SuiteHostEnvelope) => SuiteHostEnvelope): void => {
    startTransition(() => {
      setState((current) =>
        current.status === 'ready'
          ? { status: 'ready', envelope: updater(current.envelope) }
          : current,
      );
    });
  };

  useEffect(() => {
    if (!setupComplete) {
      return;
    }
    const currentSurface = resolveSuiteSurfaceForPath(location.pathname);
    // Skip sync when at `/` and about to redirect to a non-chat product.
    if (location.pathname === '/' && storedSurface !== 'chat') {
      return;
    }
    // Skip sync for suite-level routes that aren't product surfaces.
    if (isSuiteNonProductPath(location.pathname)) {
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

  const { envelope: readyEnvelope } = state;

  if (!readyEnvelope.setupCompleteAt) {
    // Setup incomplete: `/setup` shows wizard, everything else redirects to `/setup`.
    return (
      <Routes>
        <Route
          path="/setup"
          element={
            <SuiteSetupWizard
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
  return (
    <Routes>
      <Route path="/lobby" element={<SuiteLobby envelope={readyEnvelope} />} />
      <Route path="/products" element={<Navigate to="/lobby" replace />} />
      <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
      <Route
        path="/settings/*"
        element={(
          <SuiteSettingsRoutes
            envelope={readyEnvelope}
            onEnvelopeUpdate={onEnvelopeUpdate}
          />
        )}
      />
      <Route path={`${SUITE_SURFACE_ROUTES.chat.routePrefix}/*`} element={<ChatApp />} />
      <Route path={`${SUITE_SURFACE_ROUTES.work.routePrefix}/*`} element={<WorkApp />} />
      <Route path={`${SUITE_SURFACE_ROUTES.code.routePrefix}/*`} element={<CodeApp />} />
      <Route path="/setup" element={<Navigate to={entryPath} replace />} />
      <Route path="/" element={<Navigate to={entryPath} replace />} />
      <Route path="*" element={<Navigate to={entryPath} replace />} />
    </Routes>
  );
}
