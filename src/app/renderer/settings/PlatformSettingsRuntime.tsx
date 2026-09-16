import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
  type SettingsStatusChipTone,
} from '../../../design/components/settings/index.js';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { AuthenticatedBrowserLink } from '../auth/AuthenticatedBrowserLink.js';
import {
  getProviderCatalogRefreshSnapshot,
  readProviderCatalogRefreshFailedStatus,
  subscribeProviderCatalogRefresh,
  subscribeProviderCatalogRefreshResult,
  triggerProviderCatalogRefresh,
} from '../../../products/shared/renderer/api/providerCatalogRefreshStore.js';
import {
  isDesktopEnvironment,
  resolveDesktopHostBridge,
} from '../../../shared/desktopRecoveryBridge.js';
import { PLATFORM_RUNTIME_SETUP_PATH } from '../../../shared/runtimeIngressPaths.js';
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import { resolveRuntimePresentationStatus } from '../../../shared/runtimeStatusPresentation.js';
import { mountProviderManager, type ProviderManagerBridge } from '../../../../packages/provider-setup/manager.js';
import {
  useI18n,
} from '../i18n/index.js';
import {
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

function resolveRuntimeStatusChip(
  runtime: AppShellPayload['runtime'],
  runtimeSetup: RuntimeSetupSummary,
  t: (key: MessageKey, values?: MessageInterpolationValues) => string,
): { tone: SettingsStatusChipTone; label: string } {
  const connection = resolveRuntimePresentationStatus(runtime);
  if (connection === 'unavailable' || connection === 'unknown') {
    return { tone: 'warm', label: t('settingsRuntimeStatusChipRuntimeUnavailable') };
  }
  if (connection === 'degraded') {
    return { tone: 'warm', label: t('settingsRuntimeStatusChipRuntimeDegraded') };
  }
  switch (runtimeSetup.status) {
    case 'ready':
      return { tone: 'ready', label: t('settingsRuntimeStatusChipRuntimeReady') };
    case 'selection_required':
      return { tone: 'warm', label: t('settingsRuntimeStatusChipSetupReadyToApply') };
    case 'attention_required':
      return { tone: 'warm', label: t('settingsRuntimeStatusChipSetupNeedsRemediation') };
    case 'scan_required':
      return { tone: 'warm', label: t('settingsRuntimeStatusChipProviderScanRequired') };
    case 'unavailable':
    default:
      return { tone: 'warm', label: t('settingsRuntimeStatusChipSetupUnavailable') };
  }
}

function DesktopProviders({ onFeedback }: { onFeedback: (message: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const { locale } = useI18n();
  useEffect(() => {
    const bridge = resolveDesktopHostBridge();
    if (!root.current || !bridge?.getProviderSetup || !bridge.applyProviderSetup || !bridge.runProviderSetup) return;
    const view = mountProviderManager(root.current, bridge as ProviderManagerBridge, {
      context: 'settings', locale, onFeedback,
    });
    return () => view.destroy();
  }, [locale, onFeedback]);
  return <div ref={root} />;
}

export function PlatformSettingsRuntime({
  payload,
}: {
  payload: AppShellPayload;
}) {
  const { toasts, showToast } = useToast();
  const { t } = useI18n();
  const refreshSnapshot = useSyncExternalStore(
    subscribeProviderCatalogRefresh,
    getProviderCatalogRefreshSnapshot,
    getProviderCatalogRefreshSnapshot,
  );
  const refreshing = refreshSnapshot.inflight;

  const desktopEnvironment = useMemo(() => isDesktopEnvironment(), []);
  const runtimeChip = resolveRuntimeStatusChip(payload.runtime, payload.runtimeSetup, t);

  const pluralSuffix = (count: number): string => (count === 1 ? '' : 's');
  const presentRefreshError = useCallback((error: unknown): string => {
    if (!(error instanceof Error)) {
      return t('settingsRuntimeRefreshFailure');
    }
    const status = readProviderCatalogRefreshFailedStatus(error.message);
    return status === null
      ? error.message
      : t('settingsRuntimeRefreshFailureWithStatus', { status });
  }, [t]);

  useEffect(() => {
    return subscribeProviderCatalogRefreshResult((result) => {
      if (result.type === 'success') {
        const { refreshed, failures } = result.value;
        if (failures.length > 0) {
          showToast(t('settingsRuntimeRefreshSummaryWithFailures', {
            refreshed,
            failed: failures.length,
          }));
        } else {
          showToast(t('settingsRuntimeRefreshSummary', {
            refreshed,
            pluralSuffix: pluralSuffix(refreshed),
          }));
        }
      } else {
        showToast(presentRefreshError(result.error));
      }
    });
  }, [presentRefreshError, showToast, t]);

  const handleRefresh = () => {
    void triggerProviderCatalogRefresh().catch(() => undefined);
  };

  return (
    <>
      <SettingsSection
        header={
          <SettingsSectionHeader
            title={t('settingsRuntimeStatusTitle')}
            description={t('settingsRuntimeStatusDescription')}
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
            <span>{t('settingsRuntimeMetricReadyProviders')}</span>
          </div>
          <div className="settingsRuntimeMetric">
            <strong>{payload.runtimeSetup.providerCount}</strong>
            <span>{t('settingsRuntimeMetricProvidersScanned')}</span>
          </div>
          <div className="settingsRuntimeMetric">
            <strong>{payload.runtimeSetup.providersNeedingAttention.length}</strong>
            <span>{t('settingsRuntimeMetricNeedAttention')}</span>
          </div>
        </div>
      </SettingsSection>

      {payload.runtimeSetup.providersNeedingAttention.length > 0 ? (
        <SettingsSection
          header={
            <SettingsSectionHeader
              title={t('settingsRuntimeNeedAttentionTitle')}
              description={t('settingsRuntimeNeedAttentionDescription')}
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
                    ? ` • ${t('settingsRuntimeFixStepCount', {
                      count: entry.remediationCount,
                      pluralSuffix: entry.remediationCount === 1 ? '' : 's',
                    })}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </SettingsSection>
      ) : null}

      {desktopEnvironment ? (
        <SettingsSection headerless><DesktopProviders onFeedback={showToast} /></SettingsSection>
      ) : null}

      <SettingsSection
        header={
          <SettingsSectionHeader
            title={t('settingsRuntimeModelCatalogsTitle')}
            description={t('settingsRuntimeModelCatalogsDescription')}
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
              <span>{t('settingsRuntimeRefreshingState')}</span>
            </>
          ) : (
            t('settingsRuntimeRefreshCatalogsButton')
          )}
        </button>
      </SettingsSection>

      <SettingsSection
        header={
          <SettingsSectionHeader
            title={t('settingsRuntimeStandaloneSetupTitle')}
            description={t('settingsRuntimeStandaloneSetupDescription')}
          />
        }
      >
        <AuthenticatedBrowserLink
          className="secondaryButton settingsInlineLink"
          href={PLATFORM_RUNTIME_SETUP_PATH}
          target="_blank"
          rel="noreferrer"
          onOpenError={() => showToast(t('settingsRuntimeBrowserHandoffError'))}
        >
          {t('settingsRuntimeOpenStandaloneSetup')}
        </AuthenticatedBrowserLink>
      </SettingsSection>

      <ToastContainer toasts={toasts} />
    </>
  );
}
