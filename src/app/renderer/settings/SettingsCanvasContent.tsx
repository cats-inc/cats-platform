import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ConfirmDialog,
  useConfirmDialog,
} from '../../../design/components/ConfirmDialog.js';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import {
  fetchAppShell,
  resetSetup,
} from '../../../products/shared/renderer/api/index.js';
import {
  IDLE_BUSY_STATE,
  clearBusyState,
  createSetupBusyState,
  type WorkspaceBusyState,
} from '../../../shared/workspaceBusy.js';
import { syncDesktopHostPlatformShellState } from '../setup/desktopHostBridge.js';
import { clearRememberedExecutionLabels } from '../../../shared/executionLabel.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';
import { PlatformSettingsRoutes } from './PlatformSettingsRoutes.js';

// Background refresh cadence for the AppShellPayload while Settings is
// the active surface. Matches the platform-envelope refresh interval
// in `App.tsx` so settings forms (e.g. /settings/cats list, runtime
// metrics) don't drift away from the live state when the user lingers
// on /settings/* across a runtime restart, provider scan, or window
// blur/focus cycle.
const SETTINGS_PAYLOAD_REFRESH_INTERVAL_MS = 5_000;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string | null }
  | { status: 'ready'; payload: AppShellPayload };

/**
 * Canvas content for `/settings/*` after Settings was promoted to its
 * own surface. Owns the data + busy + confirm machinery the
 * `PlatformSettingsRoutes` tree expects (previously the chat / work /
 * code product apps wired this through `WorkspaceProductApp`).
 *
 * Three render phases:
 *   - `loading` — initial fetch in flight; shows a quiet boot div
 *   - `error`   — fetch failed; shows a panel with title / body /
 *                 retry button so the user has an actual recovery
 *                 path instead of a permanent blank canvas
 *   - `ready`   — payload available; renders `PlatformSettingsRoutes`
 *                 and starts a background refresh loop
 *
 * Background refresh mirrors the `App.tsx` envelope-refresh shape:
 * setInterval poll, focus listener, visibilitychange listener. Each
 * refresh that succeeds updates the payload silently; a refresh that
 * fails leaves the last-good payload in place (we never bounce back
 * to the error panel from a transient blip).
 *
 * The shell chrome (sidebar, collapse, brand row) lives in
 * `SettingsShell` + `SettingsAppShellSidebar`; this component is the
 * `<Outlet />` payload mounted under `<main className="canvas">`.
 */
export function SettingsCanvasContent() {
  const { t } = useI18n();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = useState<WorkspaceBusyState>(IDLE_BUSY_STATE);
  const [feedback, setFeedback] = useState<string>('');
  const {
    dialog: confirmDialog,
    confirm,
    handleClose: onConfirmClose,
  } = useConfirmDialog();
  // `attempt` is bumped by the retry button to re-run the initial-load
  // useEffect. Independent from background-refresh ticks (those don't
  // touch attempt and don't show a loading spinner).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadState((current) =>
      current.status === 'ready' ? current : { status: 'loading' },
    );
    void fetchAppShell()
      .then((next) => {
        if (cancelled) return;
        setLoadState({ status: 'ready', payload: next });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : null;
        setLoadState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Background refresh: only starts once we have a ready payload, and
  // never demotes us back to loading/error on transient failures —
  // those just keep the previous payload visible. Using a ref to
  // hold the latest setLoadState so the interval / listener handlers
  // stay stable across re-renders without resubscribing each time.
  const isReady = loadState.status === 'ready';
  const setLoadStateRef = useRef(setLoadState);
  setLoadStateRef.current = setLoadState;
  useEffect(() => {
    if (!isReady) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;

    const refreshInBackground = (): void => {
      if (cancelled || inFlight) return;
      inFlight = true;
      void fetchAppShell()
        .then((next) => {
          if (cancelled) return;
          setLoadStateRef.current({ status: 'ready', payload: next });
        })
        .catch(() => {
          // Transient failure — keep the last-good payload visible.
          // The user already has a manual retry path via the error
          // panel; background refreshes shouldn't yank the canvas.
        })
        .finally(() => {
          inFlight = false;
        });
    };

    const intervalId = window.setInterval(
      refreshInBackground,
      SETTINGS_PAYLOAD_REFRESH_INTERVAL_MS,
    );
    const handleFocus = () => refreshInBackground();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshInBackground();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isReady]);

  const onPayloadUpdate = useCallback((next: AppShellPayload) => {
    setLoadState({ status: 'ready', payload: next });
  }, []);

  const onResetSetup = useCallback(async (): Promise<void> => {
    const confirmed = await confirm({
      title: t(messageKeys.settingsDataResetAllDataTitle),
      message: t(messageKeys.settingsDataResetAllDataDescription),
      confirmLabel: t(messageKeys.settingsDataResetButtonLabel),
    });
    if (!confirmed) return;

    setBusy(createSetupBusyState());
    try {
      const next = await resetSetup();
      clearRememberedExecutionLabels();
      await syncDesktopHostPlatformShellState({
        bootstrapAttemptId: next.bootstrapAttemptId ?? null,
        setupCompleteAt: next.setupCompleteAt ?? null,
        products: Array.isArray(next.products) ? [...next.products] : [],
      });
      window.location.href = '/';
    } catch (error) {
      setBusy(clearBusyState());
      throw error;
    }
  }, [confirm, t]);

  if (loadState.status === 'loading') {
    return (
      <div
        className="settingsCanvasBoot"
        role="status"
        aria-live="polite"
        aria-label={t(messageKeys.settingsCanvasLoadingLabel)}
      />
    );
  }

  if (loadState.status === 'error') {
    return (
      <section
        className="settingsCanvasError"
        role="alert"
        aria-live="assertive"
      >
        <h1 className="settingsCanvasErrorTitle">
          {t(messageKeys.settingsCanvasLoadErrorTitle)}
        </h1>
        <p className="settingsCanvasErrorBody">
          {t(messageKeys.settingsCanvasLoadErrorBody)}
        </p>
        {loadState.message ? (
          <p className="settingsCanvasErrorDetail">{loadState.message}</p>
        ) : null}
        <div className="settingsCanvasErrorActions">
          <button
            type="button"
            className="primaryButton"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t(messageKeys.sharedCommonRetry)}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <PlatformSettingsRoutes
        payload={loadState.payload}
        onPayloadUpdate={onPayloadUpdate}
        busy={busy}
        onFeedback={setFeedback}
        onBusy={setBusy}
        onResetSetup={onResetSetup}
      />
      {feedback ? (
        <p className="settingsFeedback" role="status">{feedback}</p>
      ) : null}
      <ConfirmDialog dialog={confirmDialog} onClose={onConfirmClose} />
    </>
  );
}
