import {
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { PlatformHostEnvelope } from '../../shared/platform-contract';
import type {
  PlatformSurfaceId,
  PlatformUiLanguagePreference,
} from '../../shared/platform-contract.js';
import {
  platformSurfaceLabel,
  platformSurfaceRoutePrefix,
} from '../../core/platformSurface.js';
import { resolvePlatformProductShortLabelById } from './platformProductCopy.js';
import { I18nProvider } from './i18n/I18nProvider.js';
import {
  createTranslator,
  normalizeMessageLocale,
  parseMessageLocale,
  type MessageInterpolationValues,
  type MessageKey,
  type MessageLocale,
} from '../../shared/i18n/index.js';
import { normalizePlatformSurface } from '../../shared/platformSurfaces.js';
import {
  isPlatformNonProductPath,
  resolvePreferredPlatformSurface,
  resolvePlatformShellSurface,
  resolvePlatformSurfaceForPath,
  PLATFORM_SURFACE_ROUTES,
} from './routeMap';
import { GuideCatSidecar } from '../../design/components/GuideCatSidecar';
import { AppHostRoute } from './AppHostRoute.js';
import { CatProfilePage } from './entities/CatProfilePage.js';
import { CatsCanvasPage } from './entities/CatsCanvasPage.js';
import { CatteryHome } from './entities/CatteryHome.js';
import { ClowderHome } from './entities/ClowderHome.js';
import {
  CatteriesListPage,
  ClowdersListPage,
} from './entities/EntityListPages.js';
import { EntitiesShell } from './lobby/EntitiesShell.js';
import { PlatformLobby } from './PlatformLobby';
import {
  GuideCatPlacementProvider,
} from './GuideCatPlacementProvider';
import { useGuideCatUiPrefs } from './guideCatUiPrefsStore.js';
import { PLATFORM_ENVELOPE_REFRESH_EVENT } from './platformEnvelopeEvents.js';
import { PlatformSetupWizard } from './setup';
import { fetchPlatformEnvelope } from './setup/api';
import { prefetchProviderCatalogsForRegistryFromClientCache } from './providerCatalogClient.js';
import { fetchProviderRegistryFromClientCache } from './providerRegistryClient.js';
import { recordSettingsRouteTransition } from './settings/settingsExitMemory.js';
import { isGuideCatEnabledStatus } from '../../shared/guideCatIdentity.js';
import { isSettingsPath } from '../../shared/settingsRoute.js';
import {
  isLobbyPath,
  isProductsPath,
} from '../../shared/platformRoutePaths.js';
import { createLazyProductSurface } from './productSurfaceEntries.js';

type PlatformLoadState =
  | { status: 'loading' }
  | { status: 'ready'; envelope: PlatformHostEnvelope }
  | { status: 'error'; message: string };

const PLATFORM_ENVELOPE_BACKGROUND_REFRESH_MS = 5_000;
const ChatApp = createLazyProductSurface('chat');
const WorkApp = createLazyProductSurface('work');
const CodeApp = createLazyProductSurface('code');

function resolveAutoDetectedUiLocale(): MessageLocale {
  if (typeof navigator === 'undefined') {
    return 'en';
  }

  const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];

  for (const candidate of candidates) {
    const locale = parseMessageLocale(candidate);
    if (locale) {
      return locale;
    }
  }

  return 'en';
}

function resolveEnvelopeUiLanguagePreference(
  envelope: PlatformHostEnvelope | null,
): PlatformUiLanguagePreference {
  return envelope?.language?.uiLanguagePreference ?? 'auto';
}

function resolveUiLocaleForLanguagePreference(
  preference: PlatformUiLanguagePreference,
): MessageLocale {
  return preference === 'auto'
    ? resolveAutoDetectedUiLocale()
    : normalizeMessageLocale(preference);
}

export function shouldRenderGuideCatSidecar(input: {
  guideCat: PlatformHostEnvelope['guideCat'] | null | undefined;
  productSurfaceFallbackActive: boolean;
}): input is {
  guideCat: NonNullable<PlatformHostEnvelope['guideCat']>;
  productSurfaceFallbackActive: false;
} {
  return Boolean(
    input.guideCat
    && isGuideCatEnabledStatus(input.guideCat.status)
    && !input.productSurfaceFallbackActive,
  );
}

function ProductSurfaceFallback({
  surface,
  translate,
  onVisibilityChange,
}: {
  surface: PlatformSurfaceId;
  translate: (key: MessageKey, values?: MessageInterpolationValues) => string;
  onVisibilityChange: (visible: boolean) => void;
}) {
  const surfaceLabel = resolvePlatformProductShortLabelById(
    surface,
    platformSurfaceLabel(surface),
    translate,
  );

  useEffect(() => {
    onVisibilityChange(true);
    return () => onVisibilityChange(false);
  }, [onVisibilityChange]);

  return (
    <div className="screen screenCentered">
      <div className="loadingPanel">
        <p className="eyebrow">{translate('appBrandName')}</p>
        <h1>{translate('appLoadingWithSurface', { surface: surfaceLabel })}</h1>
      </div>
    </div>
  );
}

function renderProductSurface(
  surface: PlatformSurfaceId,
  onFallbackVisibilityChange: (visible: boolean) => void,
  translate: (key: MessageKey, values?: MessageInterpolationValues) => string,
) {
  const AppComponent = surface === 'work'
    ? WorkApp
    : surface === 'code'
      ? CodeApp
      : ChatApp;

  return (
    <Suspense
      fallback={(
        <ProductSurfaceFallback
          surface={surface}
          translate={translate}
          onVisibilityChange={onFallbackVisibilityChange}
        />
      )}
    >
      <AppComponent />
    </Suspense>
  );
}

function readRequestedPlatformSurface(
  value: unknown,
): PlatformSurfaceId | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as { platformShellSurface?: unknown };
  return normalizePlatformSurface(record.platformShellSurface);
}

export function resolvePlatformDocumentTitle(input: {
  loadStatus: PlatformLoadState['status'];
  pathname: string;
  setupComplete: boolean;
  t: (key: MessageKey, values?: MessageInterpolationValues) => string;
}): string | null {
  if (input.loadStatus !== 'ready') {
    return input.t('appTitle');
  }

  if (!input.setupComplete) {
    return input.t('appTitle');
  }

  if (
    isLobbyPath(input.pathname)
    || isProductsPath(input.pathname)
  ) {
    return input.t('appTitle');
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
  const [productSurfaceFallbackActive, setProductSurfaceFallbackActive] = useState(false);
  const [guideCatProactiveGreetingToken, setGuideCatProactiveGreetingToken] = useState(0);
  const envelopeLanguagePreference = resolveEnvelopeUiLanguagePreference(
    state.status === 'ready' ? state.envelope : null,
  );
  const [optimisticLanguagePreference, setOptimisticLanguagePreference] =
    useState<PlatformUiLanguagePreference | null>(null);
  const uiLanguagePreference = optimisticLanguagePreference ?? envelopeLanguagePreference;
  const uiLocale = resolveUiLocaleForLanguagePreference(uiLanguagePreference);
  const t = useMemo(() => createTranslator(uiLocale), [uiLocale]);
  const lastSyncedSurface = useRef<PlatformSurfaceId | null>(null);
  const previousPathnameRef = useRef(location.pathname);
  const [activeSurface, setActiveSurface] = useState<PlatformSurfaceId>('chat');

  useEffect(() => {
    setOptimisticLanguagePreference(null);
  }, [envelopeLanguagePreference]);

  const refreshEnvelope = useCallback(
    async (
      signal?: AbortSignal,
      options?: { suppressErrors?: boolean },
    ): Promise<void> => {
      try {
        const envelope = await fetchPlatformEnvelope({
          signal,
          fallbackMessageForStatus: (status) =>
            t('appLoadStateFailedWithStatus', { status }),
        });
        if (!signal?.aborted) {
          startTransition(() => setState({ status: 'ready', envelope }));
        }
      } catch (error) {
        if (!signal?.aborted && !options?.suppressErrors) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : t('appLoadErrorMessage'),
          });
        }
      }
    },
    [t],
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
  const guideCatUiPrefs = useGuideCatUiPrefs({
    hydrate: state.status === 'ready',
  });
  const persistGuideCatSeen = useCallback(() => {
    // `sidecarSeen` exists only to suppress replaying the one-shot setup
    // greeting if the user later resets setup and goes through onboarding
    // again on the same install.
    guideCatUiPrefs.update({ sidecarSeen: true });
  }, [guideCatUiPrefs.update]);

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
    const historyState = window.history.state as { idx?: number } | null;
    recordSettingsRouteTransition(location.pathname, historyState?.idx);
  }, [location.pathname]);

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

      void fetchPlatformEnvelope({
        signal: controller.signal,
        fallbackMessageForStatus: (status) =>
          t('appLoadStateFailedWithStatus', { status }),
      })
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
  }, [isLobbyRoute, state.status, t]);

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
      t,
    });
    if (title) {
      document.title = title;
    }
  }, [location.pathname, setupComplete, state.status]);

  useEffect(() => {
    if (state.status !== 'ready' || !setupComplete) {
      return;
    }
    void fetchProviderRegistryFromClientCache()
      .then((registry) => prefetchProviderCatalogsForRegistryFromClientCache(registry))
      .catch(() => {});
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
    if (isSettingsPath(location.pathname)) {
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
      <I18nProvider
        languagePreference={uiLanguagePreference}
        locale={uiLocale}
        setLanguagePreference={setOptimisticLanguagePreference}
      >
        <div className="screen screenCentered">
          <div className="loadingPanel">
            <p className="eyebrow">{t('appBrandName')}</p>
            <h1>{t('appLoadingEllipsis')}</h1>
          </div>
        </div>
      </I18nProvider>
    );
  }

  if (state.status === 'error') {
    return (
      <I18nProvider
        languagePreference={uiLanguagePreference}
        locale={uiLocale}
        setLanguagePreference={setOptimisticLanguagePreference}
      >
        <div className="screen screenCentered">
          <div className="errorPanel">
            <p className="eyebrow">{t('appErrorEyebrow')}</p>
            <h1>{t('appErrorTitle')}</h1>
            <p>{state.message}</p>
          </div>
        </div>
      </I18nProvider>
    );
  }

  const { envelope: readyEnvelope } = state;

  if (!readyEnvelope.setupCompleteAt) {
    // Setup incomplete: `/setup` shows wizard, everything else redirects to `/setup`.
    return (
      <I18nProvider
        languagePreference={uiLanguagePreference}
        locale={uiLocale}
        setLanguagePreference={setOptimisticLanguagePreference}
      >
        <Routes>
          <Route
            path="/setup"
            element={
              <PlatformSetupWizard
                envelope={readyEnvelope}
                onComplete={(nextEnvelope) => {
                  flushSync(() => {
                    setState({ status: 'ready', envelope: nextEnvelope });
                    // Fire the one-shot setup greeting only for fresh installs
                    // (sidecarSeen=false). See `persistGuideCatSeen` above for
                    // why sidecarSeen still exists after the renderer-owned
                    // prefs migration — it is the only signal that prevents
                    // replaying this peek after the user resets setup on the
                    // same install. The hydrated guard is pessimistic on
                    // purpose: if hydration is ever made async, skipping is
                    // safer than replaying, at the accepted cost that a fresh
                    // install with a not-yet-hydrated store would miss this
                    // one-shot. Today hydration is synchronous so hydrated is
                    // always true here in practice.
                    if (
                      nextEnvelope.guideCat
                      && isGuideCatEnabledStatus(nextEnvelope.guideCat.status)
                      && guideCatUiPrefs.hydrated
                      && !guideCatUiPrefs.prefs.sidecarSeen
                    ) {
                      setGuideCatProactiveGreetingToken((current) => current + 1);
                    }
                  });
                  navigate('/lobby', { replace: true });
                }}
              />
            }
          />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </I18nProvider>
    );
  }

  // Setup complete: products at their own prefix, settings at /settings/*.
  const shellSurface = resolvePlatformShellSurface(location.pathname, preferredSurface);
  const hasStoredSurface = Boolean(readyEnvelope.lastProductSurface);
  const entryPath = hasStoredSurface ? platformSurfaceRoutePrefix(preferredSurface) : '/lobby';
  const settingsSurfaceElement = renderProductSurface(
    shellSurface,
    setProductSurfaceFallbackActive,
    t,
  );
  const guideCatSidecarInput = {
    guideCat: readyEnvelope.guideCat,
    productSurfaceFallbackActive,
  };
  const guideCatVisible = shouldRenderGuideCatSidecar(guideCatSidecarInput);
  return (
    <I18nProvider
      languagePreference={uiLanguagePreference}
      locale={uiLocale}
      setLanguagePreference={setOptimisticLanguagePreference}
    >
      <GuideCatPlacementProvider
        guideCat={guideCatVisible ? guideCatSidecarInput.guideCat : null}
        placement={guideCatUiPrefs.prefs.placement}
        floatingAnchor={guideCatUiPrefs.prefs.floatingAnchor}
        sidecarMode={guideCatUiPrefs.prefs.sidecarMode}
        proactiveGreetingToken={guideCatProactiveGreetingToken}
        onPersistSeen={persistGuideCatSeen}
        onCommit={guideCatUiPrefs.update}
      >
        {guideCatVisible ? (
          <GuideCatSidecar
            guideCat={guideCatSidecarInput.guideCat}
            ownerDisplayName={readyEnvelope.ownerDisplayName}
            unreadCount={0}
            onDismissed={() => void refreshEnvelope()}
          />
        ) : null}
        <Routes>
          <Route path="/lobby" element={<PlatformLobby envelope={readyEnvelope} />} />
          <Route element={<EntitiesShell envelope={readyEnvelope} />}>
            <Route path="/cats" element={<CatsCanvasPage />} />
            <Route path="/cats/:catId" element={<CatProfilePage />} />
            <Route path="/clowders" element={<ClowdersListPage envelope={readyEnvelope} />} />
            <Route path="/clowders/:clowderId" element={<ClowderHome envelope={readyEnvelope} />} />
            <Route path="/clowders/:clowderId/:tab" element={<ClowderHome envelope={readyEnvelope} />} />
            <Route path="/catteries" element={<CatteriesListPage envelope={readyEnvelope} />} />
            <Route path="/catteries/:catteryId" element={<CatteryHome envelope={readyEnvelope} />} />
            <Route path="/catteries/:catteryId/:tab" element={<CatteryHome envelope={readyEnvelope} />} />
          </Route>
          <Route path="/apps/:appId/*" element={<AppHostRoute envelope={readyEnvelope} />} />
          <Route path="/products" element={<Navigate to="/lobby" replace />} />
          <Route path="/settings/*" element={settingsSurfaceElement} />
          <Route
            path={`${PLATFORM_SURFACE_ROUTES.chat.routePrefix}/*`}
            element={renderProductSurface('chat', setProductSurfaceFallbackActive, t)}
          />
          <Route
            path={`${PLATFORM_SURFACE_ROUTES.work.routePrefix}/*`}
            element={renderProductSurface('work', setProductSurfaceFallbackActive, t)}
          />
          <Route
            path={`${PLATFORM_SURFACE_ROUTES.code.routePrefix}/*`}
            element={renderProductSurface('code', setProductSurfaceFallbackActive, t)}
          />
          <Route path="/setup" element={<Navigate to={entryPath} replace />} />
          <Route path="/" element={<Navigate to={entryPath} replace />} />
          <Route path="*" element={<Navigate to={entryPath} replace />} />
        </Routes>
      </GuideCatPlacementProvider>
    </I18nProvider>
  );
}
