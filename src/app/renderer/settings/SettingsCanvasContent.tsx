import { useCallback, useEffect, useState } from 'react';

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

/**
 * Canvas content for `/settings/*` after Settings was promoted to its
 * own surface. Owns the data + busy + confirm machinery the
 * `PlatformSettingsRoutes` tree expects (previously the chat / work /
 * code product apps wired this through `WorkspaceProductApp`).
 *
 * The shell chrome (sidebar, collapse, brand row) lives in
 * `SettingsShell` + `SettingsAppShellSidebar`; this component is the
 * `<Outlet />` payload mounted under `<main className="canvas">`.
 */
export function SettingsCanvasContent() {
  const { t } = useI18n();
  const [payload, setPayload] = useState<AppShellPayload | null>(null);
  const [busy, setBusy] = useState<WorkspaceBusyState>(IDLE_BUSY_STATE);
  const [feedback, setFeedback] = useState<string>('');
  const {
    dialog: confirmDialog,
    confirm,
    handleClose: onConfirmClose,
  } = useConfirmDialog();

  useEffect(() => {
    let cancelled = false;
    void fetchAppShell()
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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

  if (!payload) {
    return <div className="settingsCanvasBoot" />;
  }

  return (
    <>
      <PlatformSettingsRoutes
        payload={payload}
        onPayloadUpdate={setPayload}
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
