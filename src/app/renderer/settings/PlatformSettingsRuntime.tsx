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
  previewRuntimeLifecycleUninstall,
  runRuntimeLifecycleAction,
  selectLifecycleHelpers,
  selectUninstallableHelpers,
  type RuntimeLifecycleAction,
  type RuntimeUninstallPreview,
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

interface SinglePrompt {
  kind: 'single';
  helper: RuntimeLifecycleHelperSummary;
  preview: RuntimeUninstallPreview | null;
  loading: boolean;
}

interface BulkPrompt {
  kind: 'bulk';
  helpers: RuntimeLifecycleHelperSummary[];
  previews: Map<string, RuntimeUninstallPreview>;
  loading: boolean;
}

type ConfirmationPrompt = SinglePrompt | BulkPrompt | null;

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
    void triggerProviderCatalogRefresh().catch(() => undefined);
  };

  const lifecycleHelpers = useMemo(() => selectLifecycleHelpers(helpers), [helpers]);
  const uninstallableHelpers = useMemo(() => selectUninstallableHelpers(helpers), [helpers]);

  const runAction = useCallback(async (
    helper: RuntimeLifecycleHelperSummary,
    action: RuntimeLifecycleAction,
  ) => {
    setRunningHelperId(helper.id);
    try {
      const outcome = await runRuntimeLifecycleAction(helper, action);
      showToast(outcome.message);
      if (outcome.kind !== 'failure') {
        await refreshHelpers();
      }
      return outcome;
    } finally {
      setRunningHelperId(null);
    }
  }, [refreshHelpers, showToast]);

  const openSingleUninstallPrompt = useCallback(async (helper: RuntimeLifecycleHelperSummary) => {
    setConfirmation({ kind: 'single', helper, preview: null, loading: true });
    const preview = await previewRuntimeLifecycleUninstall(helper);
    setConfirmation((prev) => {
      if (!prev || prev.kind !== 'single' || prev.helper.id !== helper.id) {
        return prev;
      }
      return { kind: 'single', helper, preview, loading: false };
    });
  }, []);

  const openBulkUninstallPrompt = useCallback(async (
    targets: RuntimeLifecycleHelperSummary[],
  ) => {
    setConfirmation({
      kind: 'bulk',
      helpers: targets,
      previews: new Map(),
      loading: true,
    });
    const entries = await Promise.all(
      targets.map(async (helper) => {
        const preview = await previewRuntimeLifecycleUninstall(helper);
        return [helper.id, preview] as const;
      }),
    );
    const previews = new Map<string, RuntimeUninstallPreview>(entries);
    setConfirmation((prev) => {
      if (!prev || prev.kind !== 'bulk') {
        return prev;
      }
      return { kind: 'bulk', helpers: targets, previews, loading: false };
    });
  }, []);

  const handleUninstallConfirmed = useCallback(async () => {
    if (!confirmation || confirmation.loading) return;
    if (confirmation.kind === 'single') {
      const helper = confirmation.helper;
      setConfirmation(null);
      await runAction(helper, 'uninstall');
      return;
    }

    const targets = confirmation.helpers;
    setConfirmation(null);
    setBulkRunning(true);
    let success = 0;
    let partial = 0;
    let failed = 0;
    try {
      for (const helper of targets) {
        const outcome = await runAction(helper, 'uninstall');
        if (outcome.kind === 'success') success += 1;
        else if (outcome.kind === 'partial') partial += 1;
        else failed += 1;
      }
      const summaryParts = [`${success} uninstalled`];
      if (partial > 0) summaryParts.push(`${partial} partial`);
      if (failed > 0) summaryParts.push(`${failed} failed`);
      showToast(`Bulk uninstall: ${summaryParts.join(' · ')}.`);
      await refreshHelpers();
    } finally {
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
                          onClick={() => void openSingleUninstallPrompt(helper)}
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
            onClick={() => void openBulkUninstallPrompt(uninstallableHelpers)}
          >
            {bulkRunning ? 'Uninstalling…' : 'Uninstall local CLI providers'}
          </button>
        </SettingsDangerZone>
      ) : null}

      {confirmation ? (
        <div className="settingsRuntimeConfirmOverlay" role="dialog" aria-modal="true">
          <div className="settingsRuntimeConfirmCard">
            {confirmation.kind === 'single' ? (
              <SingleUninstallConfirmBody prompt={confirmation} />
            ) : (
              <BulkUninstallConfirmBody prompt={confirmation} />
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
                disabled={confirmation.loading}
                onClick={() => void handleUninstallConfirmed()}
              >
                {confirmation.kind === 'single'
                  ? 'Uninstall'
                  : 'Uninstall all listed'}
              </button>
            </SettingsActionBar>
          </div>
        </div>
      ) : null}

      <ToastContainer toasts={toasts} />
    </>
  );
}

function SingleUninstallConfirmBody({ prompt }: { prompt: SinglePrompt }) {
  return (
    <>
      <h3>Uninstall {prompt.helper.label}?</h3>
      <p>
        This will remove user-owned files for <strong>{prompt.helper.label}</strong>.
        Auth files, API keys, and external configuration are left in place.
        Active sessions using this provider may fail until another provider is configured.
      </p>
      <p className="settingsRuntimeNote">
        Helper: <code>{prompt.helper.id}</code>
        <br />
        Script: <code>{prompt.helper.packagedRelativePath}</code>
      </p>
      <RemovalPreview preview={prompt.preview} loading={prompt.loading} />
    </>
  );
}

function BulkUninstallConfirmBody({ prompt }: { prompt: BulkPrompt }) {
  return (
    <>
      <h3>
        Uninstall {prompt.helpers.length} provider{prompt.helpers.length === 1 ? '' : 's'}?
      </h3>
      <p>
        This will run uninstall on every provider helper listed below.
        Auth files, API keys, and external configuration are left in place.
      </p>
      {prompt.loading ? (
        <p className="settingsRuntimeNote">Computing planned removals…</p>
      ) : (
        <ul className="settingsRuntimeList">
          {prompt.helpers.map((helper) => {
            const preview = prompt.previews.get(helper.id);
            return (
              <li key={helper.id}>
                <strong>{helper.label}</strong>
                <span>
                  <code>{helper.id}</code>
                </span>
                <RemovalPreview preview={preview ?? null} loading={false} compact />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function RemovalPreview({
  preview,
  loading,
  compact = false,
}: {
  preview: RuntimeUninstallPreview | null;
  loading: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return <p className="settingsRuntimeNote">Computing planned removals…</p>;
  }
  if (!preview || !preview.available) {
    return (
      <p className="settingsRuntimeNote">
        {preview?.message ?? 'Preview unavailable; the uninstall will still report planned actions.'}
      </p>
    );
  }
  if (preview.status === 'not_installed') {
    return (
      <p className="settingsRuntimeNote">
        Nothing to remove — the helper reports this provider is not installed.
        {preview.systemInstallPath ? (
          <>
            <br />
            Note: a system install was detected at <code>{preview.systemInstallPath}</code> but it cannot be removed by this helper.
          </>
        ) : null}
      </p>
    );
  }
  return (
    <div className={compact ? 'settingsRuntimePreviewCompact' : 'settingsRuntimePreview'}>
      <p className="settingsRuntimeNote">
        Will remove {preview.plannedActions.length} item{preview.plannedActions.length === 1 ? '' : 's'}:
      </p>
      <ul className="settingsRuntimePreviewList">
        {preview.plannedActions.map((entry) => (
          <li key={entry}>
            <code>{entry}</code>
          </li>
        ))}
      </ul>
      {preview.systemInstallPath ? (
        <p className="settingsRuntimeNote">
          Note: a system install at <code>{preview.systemInstallPath}</code> cannot be removed by this helper.
        </p>
      ) : null}
      {preview.manualSteps.length > 0 ? (
        <ul className="settingsRuntimePreviewList settingsRuntimePreviewManual">
          {preview.manualSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
