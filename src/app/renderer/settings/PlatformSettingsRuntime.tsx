import { useEffect, useSyncExternalStore } from 'react';

import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
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
import { PLATFORM_RUNTIME_SETUP_PATH } from '../../../shared/runtimeIngressPaths.js';
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import { resolveRuntimePresentationStatus } from '../../../shared/runtimeStatusPresentation.js';

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
      <ToastContainer toasts={toasts} />
    </>
  );
}
