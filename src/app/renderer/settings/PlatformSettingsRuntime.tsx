import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsActionBar,
  SettingsDangerZone,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
  type SettingsStatusChipTone,
} from '../../../design/components/settings/index.js';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import {
  getProviderCatalogRefreshSnapshot,
  subscribeProviderCatalogRefresh,
  subscribeProviderCatalogRefreshResult,
  triggerProviderCatalogRefresh,
} from '../../../products/shared/renderer/api/providerCatalogRefreshStore.js';
import {
  isDesktopEnvironment,
  type RuntimeLifecycleHelperSummary,
} from '../../../shared/desktopRecoveryBridge.js';
import { PLATFORM_RUNTIME_SETUP_PATH } from '../../../shared/runtimeIngressPaths.js';
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import { resolveRuntimePresentationStatus } from '../../../shared/runtimeStatusPresentation.js';
import {
  deriveHelperActions,
  fetchRuntimeLifecycleHelpers,
  runRuntimeLifecycleAction,
  selectLifecycleHelpers,
  selectUninstallableHelpers,
  type RuntimeLifecycleAction,
} from './runtimeLifecycleHelpers.js';

function resolveRuntimeStatusChip(
  runtime: AppShellPayload['runtime'],
  runtimeSetup: RuntimeSetupSummary,
): { tone: SettingsStatusChipTone; label: string } {
  const connection = resolveRuntimePresentationStatus(runtime);
  if (connection === 'unavailable' || connection === 'unknown') {
    return { tone: 'warm', label: 'Runtime unavailable' };
  }
  if (connection === 'degraded') {
    return { tone: 'warm', label: 'Runtime degraded' };
  }
  switch (runtimeSetup.status) {
    case 'ready':
      return { tone: 'ready', label: 'Runtime ready' };
    case 'ready_to_apply':
      return { tone: 'warm', label: 'Setup ready to apply' };
    case 'attention_required':
      return { tone: 'warm', label: 'Setup needs remediation' };
    case 'scan_required':
      return { tone: 'warm', label: 'Provider scan required' };
    case 'unavailable':
    default:
      return { tone: 'warm', label: 'Setup unavailable' };
  }
}

interface UninstallPrompt {
  kind: 'single';
  helper: RuntimeLifecycleHelperSummary;
}

interface BulkUninstallPrompt {
  kind: 'bulk';
  helpers: RuntimeLifecycleHelperSummary[];
}

type ConfirmationPrompt = UninstallPrompt | BulkUninstallPrompt | null;

export function PlatformSettingsRuntime({
  payload,
}: {
  payload: AppShellPayload;
}) {
  const runtimeChip = resolveRuntimeStatusChip(payload.runtime, payload.runtimeSetup);
  const { toasts, showToast } = useToast();
  const refreshSnapshot = useSyncExternalStore(
    subscribeProviderCatalogRefresh,
    getProviderCatalogRefreshSnapshot,
    getProviderCatalogRefreshSnapshot,
  );
  const refreshing = refreshSnapshot.inflight;

  const desktopEnvironment = useMemo(() => isDesktopEnvironment(), []);
  const [helpers, setHelpers] = useState<RuntimeLifecycleHelperSummary[]>([]);
  const [helpersLoading, setHelpersLoading] = useState(false);
  const [runningHelperId, setRunningHelperId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationPrompt>(null);

  const refreshHelpers = useCallback(async () => {
    if (!desktopEnvironment) return;
    setHelpersLoading(true);
    try {
      const next = await fetchRuntimeLifecycleHelpers();
      setHelpers(next);
    } finally {
      setHelpersLoading(false);
    }
  }, [desktopEnvironment]);

  useEffect(() => {
    void refreshHelpers();
  }, [refreshHelpers]);

  useEffect(() => subscribeProviderCatalogRefreshResult((result) => {
    if (result.type === 'success') {
      const { refreshed, failures } = result.value;
      if (failures.length > 0) {
        showToast(`Refreshed ${refreshed} · ${failures.length} failed`);
      } else {
        showToast(`Refreshed ${refreshed} target${refreshed === 1 ? '' : 's'}`);
      }
    } else {
      showToast(
        result.error instanceof Error ? result.error.message : 'Refresh failed.',
      );
    }
  }), [showToast]);

  const handleRefresh = () => {
    void triggerProviderCatalogRefresh().catch(() => {
      // Errors are surfaced via the shared result subscription above.
    });
  };

  const lifecycleHelpers = useMemo(() => selectLifecycleHelpers(helpers), [helpers]);
  const uninstallableHelpers = useMemo(() => selectUninstallableHelpers(helpers), [helpers]);

  const runAction = useCallback(async (
    helper: RuntimeLifecycleHelperSummary,
    action: RuntimeLifecycleAction,
  ) => {
    setRunningHelperId(helper.id);
    try {
      const result = await runRuntimeLifecycleAction(helper, action);
      showToast(result.message);
      if (result.success) {
        await refreshHelpers();
      }
    } finally {
      setRunningHelperId(null);
    }
  }, [refreshHelpers, showToast]);

  const handleUninstallConfirmed = useCallback(async () => {
    if (!confirmation) return;
    if (confirmation.kind === 'single') {
      const helper = confirmation.helper;
      setConfirmation(null);
      await runAction(helper, 'uninstall');
      return;
    }

    const targets = confirmation.helpers;
    setConfirmation(null);
    setBulkRunning(true);
    let successCount = 0;
    let failureCount = 0;
    try {
      for (const helper of targets) {
        setRunningHelperId(helper.id);
        const result = await runRuntimeLifecycleAction(helper, 'uninstall');
        if (result.success) {
          successCount += 1;
        } else {
          failureCount += 1;
          showToast(result.message);
        }
      }
      showToast(
        failureCount === 0
          ? `Uninstalled ${successCount} provider${successCount === 1 ? '' : 's'}.`
          : `Uninstalled ${successCount} · ${failureCount} failed.`,
      );
      await refreshHelpers();
    } finally {
      setRunningHelperId(null);
      setBulkRunning(false);
    }
  }, [confirmation, refreshHelpers, runAction, showToast]);

  return (
    <>
      <SettingsSection
        header={
          <SettingsSectionHeader
            title="Runtime status"
            description="Whether cats-runtime is reachable and your provider setup is complete. The breakdown below shows how many providers are currently usable."
          />
        }
      >
        <div className="settingsChipRow">
          <SettingsStatusChip tone={runtimeChip.tone}>
            {runtimeChip.label}
          </SettingsStatusChip>
        </div>
        <div className="settingsRuntimeMetrics">
          <div className="settingsRuntimeMetric">
            <strong>{payload.runtimeSetup.availableCount}</strong>
            <span>ready providers</span>
          </div>
          <div className="settingsRuntimeMetric">
            <strong>{payload.runtimeSetup.providerCount}</strong>
            <span>providers scanned</span>
          </div>
          <div className="settingsRuntimeMetric">
            <strong>{payload.runtimeSetup.providersNeedingAttention.length}</strong>
            <span>need attention</span>
          </div>
        </div>
      </SettingsSection>

      {payload.runtimeSetup.providersReadyToApply.length > 0 ? (
        <SettingsSection
          header={
            <SettingsSectionHeader
              title="Ready providers"
              description="Providers detected on this machine that are ready to activate in the runtime."
            />
          }
        >
          <ul className="settingsRuntimeList">
            {payload.runtimeSetup.providersReadyToApply.map((entry) => (
              <li key={entry.provider}>
                <strong>{entry.provider}</strong>
                <span>{entry.family}</span>
              </li>
            ))}
          </ul>
        </SettingsSection>
      ) : null}

      {payload.runtimeSetup.providersNeedingAttention.length > 0 ? (
        <SettingsSection
          header={
            <SettingsSectionHeader
              title="Need attention"
              description="Providers the scan flagged for remediation before they can join the runtime."
            />
          }
        >
          <ul className="settingsRuntimeList">
            {payload.runtimeSetup.providersNeedingAttention.map((entry) => (
              <li key={entry.provider}>
                <strong>{entry.provider}</strong>
                <span>
                  {entry.family}
                  {typeof entry.remediationCount === 'number'
                    ? ` • ${entry.remediationCount} fix step(s)`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </SettingsSection>
      ) : null}

      {desktopEnvironment ? (
        <SettingsSection
          header={
            <SettingsSectionHeader
              title="Provider helpers"
              description="Run packaged installers to check, install, upgrade, repair, or rescan local CLI providers. Actions stream through the desktop host bridge; the renderer never executes scripts directly."
            />
          }
        >
          {helpersLoading && lifecycleHelpers.length === 0 ? (
            <p className="settingsRuntimeNote">Loading helpers…</p>
          ) : lifecycleHelpers.length === 0 ? (
            <p className="settingsRuntimeNote">
              No provider helpers are bundled with this host build.
            </p>
          ) : (
            <ul className="settingsRuntimeList settingsRuntimeHelperList">
              {lifecycleHelpers.map((helper) => {
                const actions = deriveHelperActions(helper);
                const isThisHelperRunning = runningHelperId === helper.id;
                return (
                  <li key={helper.id} className="settingsRuntimeHelperRow">
                    <div className="settingsRuntimeHelperHead">
                      <strong>{helper.label}</strong>
                      <span>{helper.packagedRelativePath}</span>
                    </div>
                    <div className="settingsRuntimeHelperActions">
                      {actions
                        .filter((entry) => entry.action !== 'uninstall' && entry.available)
                        .map((entry) => (
                          <button
                            key={entry.action}
                            type="button"
                            className="secondaryButton"
                            disabled={isThisHelperRunning || bulkRunning}
                            onClick={() => void runAction(helper, entry.action)}
                          >
                            {isThisHelperRunning ? 'Working…' : entry.label}
                          </button>
                        ))}
                      {helper.supportsUninstall ? (
                        <button
                          type="button"
                          className="dangerButton"
                          disabled={isThisHelperRunning || bulkRunning}
                          onClick={() => setConfirmation({ kind: 'single', helper })}
                        >
                          Uninstall
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            className="secondaryButton settingsRefreshButton"
            disabled={helpersLoading || bulkRunning || runningHelperId !== null}
            onClick={() => void refreshHelpers()}
          >
            Rescan
          </button>
        </SettingsSection>
      ) : null}

      <SettingsSection
        header={
          <SettingsSectionHeader
            title="Model catalogs"
            description="Ask cats-runtime to refresh every provider's model list now, so newly released models show up in the Brain picker without waiting for the background caches to expire."
          />
        }
      >
        <button
          type="button"
          className="secondaryButton settingsRefreshButton"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <>
              <span className="settingsRefreshSpinner" aria-hidden="true" />
              <span>Refreshing</span>
            </>
          ) : (
            'Refresh model catalogs'
          )}
        </button>
      </SettingsSection>

      <SettingsSection
        header={
          <SettingsSectionHeader
            title="Standalone setup"
            description="Open the standalone runtime setup when you need provider remediation or a deeper scan."
          />
        }
      >
        <a
          className="secondaryButton settingsInlineLink"
          href={PLATFORM_RUNTIME_SETUP_PATH}
          target="_blank"
          rel="noreferrer"
        >
          Open Cats Runtime setup
        </a>
      </SettingsSection>

      {desktopEnvironment && uninstallableHelpers.length > 0 ? (
        <SettingsDangerZone
          title="Bulk uninstall"
          description={
            <>
              Removes the user-owned binaries for every uninstall-capable provider listed above.
              Active sessions using a removed provider will fail until another provider is configured.
              Auth files, API keys, and external configuration are left in place.
            </>
          }
        >
          <button
            type="button"
            className="dangerButton"
            disabled={bulkRunning || runningHelperId !== null}
            onClick={() => setConfirmation({ kind: 'bulk', helpers: uninstallableHelpers })}
          >
            {bulkRunning ? 'Uninstalling…' : 'Uninstall local CLI providers'}
          </button>
        </SettingsDangerZone>
      ) : null}

      {confirmation ? (
        <div className="settingsRuntimeConfirmOverlay" role="dialog" aria-modal="true">
          <div className="settingsRuntimeConfirmCard">
            <h3>
              {confirmation.kind === 'single'
                ? `Uninstall ${confirmation.helper.label}?`
                : `Uninstall ${confirmation.helpers.length} provider${confirmation.helpers.length === 1 ? '' : 's'}?`}
            </h3>
            {confirmation.kind === 'single' ? (
              <>
                <p>
                  This will remove user-owned files for <strong>{confirmation.helper.label}</strong>.
                  Auth files, API keys, and external configuration are left in place.
                  Active sessions using this provider may fail until another provider is configured.
                </p>
                <p className="settingsRuntimeNote">
                  Helper: <code>{confirmation.helper.id}</code>
                  <br />
                  Script: <code>{confirmation.helper.packagedRelativePath}</code>
                </p>
              </>
            ) : (
              <>
                <p>
                  This will run uninstall on every provider helper listed below.
                  Auth files, API keys, and external configuration are left in place.
                </p>
                <ul className="settingsRuntimeList">
                  {confirmation.helpers.map((helper) => (
                    <li key={helper.id}>
                      <strong>{helper.label}</strong>
                      <span>
                        <code>{helper.id}</code>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <SettingsActionBar>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dangerButton"
                onClick={() => void handleUninstallConfirmed()}
              >
                {confirmation.kind === 'single' ? 'Uninstall' : 'Uninstall all listed'}
              </button>
            </SettingsActionBar>
          </div>
        </div>
      ) : null}

      <ToastContainer toasts={toasts} />
    </>
  );
}
