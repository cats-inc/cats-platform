import { useCallback, useState } from 'react';
import { useOutletContext } from 'react-router-dom';

import {
  ConfirmDialog,
  useConfirmDialog,
} from '../../../design/components/ConfirmDialog.js';
import {
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
import type { SettingsCanvasOutletContext } from './SettingsShell.js';

/**
 * Canvas content for `/settings/*` after Settings was promoted to its
 * own surface. Owns the busy + confirm machinery the
 * `PlatformSettingsRoutes` tree expects (previously the chat / work /
 * code product apps wired this through `WorkspaceProductApp`).
 *
 * Three render phases:
 *   - `loading` — initial fetch in flight; shows a quiet boot div
 *   - `error`   — fetch failed; shows a panel with title / body /
 *                 retry button so the user has an actual recovery
 *                 path instead of a permanent blank canvas
 *   - `ready`   — payload available; renders `PlatformSettingsRoutes`
 *
 * Initial load, retry, and background runtime-envelope refresh live in
 * `SettingsShell` so the settings sidebar and canvas consume the same
 * current payload.
 *
 * The shell chrome (sidebar, collapse, brand row) lives in
 * `SettingsShell` + `SettingsAppShellSidebar`; this component is the
 * `<Outlet />` payload mounted under `<main className="canvas">`.
 */
export function SettingsCanvasContent() {
  const { t } = useI18n();
  const {
    loadState,
    onPayloadUpdate,
    onRetryLoad,
  } = useOutletContext<SettingsCanvasOutletContext>();
  const [busy, setBusy] = useState<WorkspaceBusyState>(IDLE_BUSY_STATE);
  const [feedback, setFeedback] = useState<string>('');
  const {
    dialog: confirmDialog,
    confirm,
    handleClose: onConfirmClose,
  } = useConfirmDialog();

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
            onClick={onRetryLoad}
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
