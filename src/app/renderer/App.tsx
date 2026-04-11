import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { PlatformHostEnvelope } from '../../shared/platform-contract';
import type { PlatformSurfaceId } from '../../shared/platform-contract.js';
import ChatApp from '../../products/chat/renderer/App';
import WorkApp from '../../products/work/renderer/App';
import CodeApp from '../../products/code/renderer/App';
import {
  isPlatformNonProductPath,
  resolvePreferredPlatformSurface,
  resolvePlatformShellSurface,
  resolvePlatformSurfaceForPath,
  PLATFORM_SURFACE_ROUTES,
} from './routeMap';
import { GuideCatSidecar } from '../../design/components/GuideCatSidecar';
import { PlatformLobby } from './PlatformLobby';
import { PLATFORM_ENVELOPE_REFRESH_EVENT } from './platformEnvelopeEvents.js';
import { PlatformSetupWizard } from './setup';
import { fetchPlatformEnvelope } from './setup/api';
import { prefetchProviderRegistryFromClientCache } from './providerRegistryClient.js';

type PlatformLoadState =
  | { status: 'loading' }
  | { status: 'ready'; envelope: PlatformHostEnvelope }
  | { status: 'error'; message: string };

const PLATFORM_ENVELOPE_BACKGROUND_REFRESH_MS = 5_000;

function isLobbyPath(pathname: string): boolean {
  return pathname === '/lobby' || pathname.startsWith('/lobby/');
}

function resolveProductEntryPath(surface: string): string {
  const route = PLATFORM_SURFACE_ROUTES[surface as keyof typeof PLATFORM_SURFACE_ROUTES];
  return route ? route.routePrefix : '/';
}

function readRequestedPlatformSurface(
  value: unknown,
): PlatformSurfaceId | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as { platformShellSurface?: unknown };
  const surface = record.platformShellSurface;
  return surface === 'chat' || surface === 'work' || surface === 'code'
    ? surface
    : null;
}

export function resolvePlatformDocumentTitle(input: {
  loadStatus: PlatformLoadState['status'];
  pathname: string;
  setupComplete: boolean;
}): string | null {
  if (input.loadStatus !== 'ready') {
    return 'Cats';
  }

  if (!input.setupComplete) {
    return 'Cats';
  }

  if (
    input.pathname === '/lobby'
    || input.pathname.startsWith('/lobby/')
    || input.pathname === '/products'
    || input.pathname.startsWith('/products/')
  ) {
    return 'Cats';
  }

  return null;
}

function shouldApplyPlatformEnvelopeRefresh(
  currentEnvelope: PlatformHostEnvelope,
  nextEnvelope: PlatformHostEnvelope,
): boolean {
  const currentGeneratedAt = Date.parse(currentEnvelope.metadata.generatedAt);
  const nextGeneratedAt = Date.parse(nextEnvelope.metadata.generatedAt);

  if (Number.isNaN(currentGeneratedAt) || Number.isNaN(nextGeneratedAt)) {
    return true;
  }

  return nextGeneratedAt >= currentGeneratedAt;
}

export default function PlatformApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<PlatformLoadState>({ status: 'loading' });
  const lastSyncedSurface = useRef<string | null>(null);
  const previousPathnameRef = useRef(location.pathname);
  const [activeSurface, setActiveSurface] = useState<PlatformSurfaceId>('chat');

  const refreshEnvelope = useCallback(
    async (
      signal?: AbortSignal,
      options?: { suppressErrors?: boolean },
    ): Promise<void> => {
      try {
        const envelope = await fetchPlatformEnvelope(signal);
        if (!signal?.aborted) {
          startTransition(() => setState({ status: 'ready', envelope }));
        }
      } catch (error) {
        if (!signal?.aborted && !options?.suppressErrors) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load',
          });
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshEnvelope(controller.signal);
    return () => controller.abort();
  }, [refreshEnvelope]);

  useEffect(() => {
    function handleEnvelopeRefresh(): void {
      void refreshEnvelope(undefined, { suppressErrors: true });
    }

    window.addEventListener(PLATFORM_ENVELOPE_REFRESH_EVENT, handleEnvelopeRefresh);
    return () => {
      window.removeEventListener(PLATFORM_ENVELOPE_REFRESH_EVENT, handleEnvelopeRefresh);
    };
  }, [refreshEnvelope]);

  const isLobbyRoute = isLobbyPath(location.pathname);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = location.pathname;
    const enteredLobby = isLobbyRoute && !isLobbyPath(previousPathname);
    if (!enteredLobby || state.status !== 'ready') {
      return;
    }
    void refreshEnvelope(undefined, { suppressErrors: true });
  }, [isLobbyRoute, location.pathname, refreshEnvelope, state.status]);

  useEffect(() => {
    if (
      state.status !== 'ready'
      || !isLobbyRoute
      || typeof window === 'undefined'
      || typeof document === 'undefined'
    ) {
      return;
    }

    let refreshController: AbortController | null = null;

    const refreshEnvelopeInBackground = () => {
      if (document.visibilityState === 'hidden' || refreshController) {
        return;
      }

      const controller = new AbortController();
      refreshController = controller;

      void fetchPlatformEnvelope(controller.signal)
        .then((envelope) => {
          if (controller.signal.aborted) {
            return;
          }

          startTransition(() => {
            setState((current) => {
              if (
                current.status !== 'ready'
                || !shouldApplyPlatformEnvelopeRefresh(current.envelope, envelope)
              ) {
                return current;
              }

              return {
                status: 'ready',
                envelope: {
                  ...current.envelope,
                  runtime: envelope.runtime,
                  runtimeSetup: envelope.runtimeSetup,
                  metadata: envelope.metadata,
                  bootstrapAttemptId: envelope.bootstrapAttemptId,
                },
              };
            });
          });
        })
        .catch(() => {})
        .finally(() => {
          if (refreshController === controller) {
            refreshController = null;
          }
        });
    };

    const intervalId = window.setInterval(
      refreshEnvelopeInBackground,
      PLATFORM_ENVELOPE_BACKGROUND_REFRESH_MS,
    );
    const handleFocus = () => {
      refreshEnvelopeInBackground();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshEnvelopeInBackground();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (refreshController) {
        refreshController.abort();
      }
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLobbyRoute, state.status]);

  const envelope = state.status === 'ready' ? state.envelope : null;
  const setupComplete = Boolean(envelope?.setupCompleteAt);
  const storedSurface = envelope?.lastProductSurface ?? null;
  const routeSurface = readRequestedPlatformSurface(location.state);
  const sessionSurface = lastSyncedSurface.current;
  const preferredSurface = resolvePreferredPlatformSurface(
    routeSurface,
    sessionSurface,
    storedSurface,
    activeSurface,
  );

  useEffect(() => {
    const title = resolvePlatformDocumentTitle({
      loadStatus: state.status,
      pathname: location.pathname,
      setupComplete,
    });
    if (title) {
      document.title = title;
    }
  }, [location.pathname, setupComplete, state.status]);

  useEffect(() => {
    if (state.status !== 'ready' || !setupComplete) {
      return;
    }
    void prefetchProviderRegistryFromClientCache();
  }, [setupComplete, state.status]);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const nextSurface = state.envelope.lastProductSurface ?? null;
    if (nextSurface) {
      setActiveSurface((current) => (current === nextSurface ? current : nextSurface));
    }
  }, [state.status, state.status === 'ready' ? state.envelope.lastProductSurface : null]);

  useEffect(() => {
    if (location.pathname === '/settings' || location.pathname.startsWith('/settings/')) {
      setActiveSurface((current) => (current === preferredSurface ? current : preferredSurface));
      return;
    }
  }, [location.pathname, preferredSurface]);

  useEffect(() => {
    if (!setupComplete) {
      return;
    }
    const currentSurface = resolvePlatformSurfaceForPath(location.pathname);
    // Skip sync when at `/` and about to redirect (no stored surface, or non-chat product).
    if (location.pathname === '/' && storedSurface !== 'chat') {
      return;
    }
    if (location.pathname === '/' && !storedSurface) {
      return;
    }
    // Skip sync for platform-level routes that aren't product surfaces.
    if (isPlatformNonProductPath(location.pathname)) {
      return;
    }
    setActiveSurface((current) => (current === currentSurface ? current : currentSurface));
    // First render: seed the ref AND sync if the current surface differs
    // from what's stored (e.g. deep-linked to /work when stored is chat).
    if (lastSyncedSurface.current === null) {
      lastSyncedSurface.current = currentSurface;
      if (currentSurface !== storedSurface) {
        startTransition(() => {
          setState((current) =>
            current.status === 'ready'
              ? {
                  status: 'ready',
                  envelope: { ...current.envelope, lastProductSurface: currentSurface },
                }
              : current,
          );
        });
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
      startTransition(() => {
        setState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                envelope: { ...current.envelope, lastProductSurface: currentSurface },
              }
            : current,
        );
      });
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
              onComplete={(nextEnvelope) => {
                flushSync(() => {
                  setState({ status: 'ready', envelope: nextEnvelope });
                });
                navigate('/lobby', { replace: true });
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  // Setup complete: products at their own prefix, settings at /settings/*.
  const shellSurface = resolvePlatformShellSurface(location.pathname, preferredSurface);
  const hasStoredSurface = Boolean(readyEnvelope.lastProductSurface);
  const entryPath = hasStoredSurface ? resolveProductEntryPath(preferredSurface) : '/lobby';
  const settingsSurfaceElement = shellSurface === 'work'
    ? <WorkApp />
    : shellSurface === 'code'
      ? <CodeApp />
      : <ChatApp />;
  return (
    <>
      {readyEnvelope.guideCat && readyEnvelope.guideCat.status !== 'dismissed' ? (
        <GuideCatSidecar
          guideCat={readyEnvelope.guideCat}
          ownerDisplayName={readyEnvelope.ownerDisplayName}
          guideCatSidecarSeen={readyEnvelope.guideCatSidecarSeen ?? false}
          guideCatSidecarMode={readyEnvelope.guideCatSidecarMode ?? 'auto'}
          unreadCount={0}
          onDismissed={() => void refreshEnvelope()}
        />
      ) : null}
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
    </>
  );
}
