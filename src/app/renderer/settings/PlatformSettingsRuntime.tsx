import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsActionBar,
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
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import { resolveRuntimeSetupExternalHref } from '../../../shared/runtimeExternalLinks.js';
import { resolveRuntimePresentationStatus } from '../../../shared/runtimeStatusPresentation.js';
import {
  deriveHelperActions,
  fetchRuntimeLifecycleHelpers,
  previewRuntimeLifecycleUninstall,
  runRuntimeLifecycleAction,
  selectLifecycleHelpers,
  type RuntimeLifecycleAction,
  type RuntimeUninstallPreview,
} from './runtimeLifecycleHelpers.js';
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
    case 'ready_to_apply':
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

interface UninstallPrompt {
  helper: RuntimeLifecycleHelperSummary;
  preview: RuntimeUninstallPreview | null;
  loading: boolean;
}

function uninstallPromptIsActionable(prompt: UninstallPrompt): boolean {
  if (prompt.loading) return false;
  if (!prompt.preview || !prompt.preview.available) return false;
  return prompt.preview.plannedActions.length > 0;
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
  const [helpers, setHelpers] = useState<RuntimeLifecycleHelperSummary[]>([]);
  const [helpersLoading, setHelpersLoading] = useState(false);
  const [runningHelperId, setRunningHelperId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<UninstallPrompt | null>(null);
  const runtimeChip = resolveRuntimeStatusChip(payload.runtime, payload.runtimeSetup, t);
  const runtimeSetupHref = resolveRuntimeSetupExternalHref(payload.runtime);

  const actionLabel = (action: RuntimeLifecycleAction): string => {
    switch (action) {
      case 'check':
        return t('settingsRuntimeActionCheckLabel');
      case 'install':
        return t('settingsRuntimeActionInstallLabel');
      case 'upgrade':
        return t('settingsRuntimeActionUpgradeLabel');
      case 'repair':
        return t('settingsRuntimeActionRepairLabel');
      case 'uninstall':
        return t('settingsRuntimeActionUninstallLabel');
    }
  };

  const pluralSuffix = (count: number): string => (count === 1 ? '' : 's');

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

  useEffect(() => {
    subscribeProviderCatalogRefreshResult((result) => {
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
        showToast(
          result.error instanceof Error
            ? result.error.message
            : t('settingsRuntimeRefreshFailure'),
        );
      }
    });
  }, [showToast, t]);

  const handleRefresh = () => {
    void triggerProviderCatalogRefresh().catch(() => undefined);
  };

  const lifecycleHelpers = useMemo(() => selectLifecycleHelpers(helpers), [helpers]);

  const runAction = useCallback(async (
    helper: RuntimeLifecycleHelperSummary,
    action: RuntimeLifecycleAction,
  ) => {
    setRunningHelperId(helper.id);
    try {
      const outcome = await runRuntimeLifecycleAction(helper, action, t);
      showToast(outcome.message);
      if (outcome.kind !== 'failure') {
        await refreshHelpers();
      }
      return outcome;
    } finally {
      setRunningHelperId(null);
    }
  }, [refreshHelpers, showToast, t]);

  const openUninstallPrompt = useCallback(async (helper: RuntimeLifecycleHelperSummary) => {
    setConfirmation({ helper, preview: null, loading: true });
    const preview = await previewRuntimeLifecycleUninstall(helper, t);
    setConfirmation((prev) => {
      if (!prev || prev.helper.id !== helper.id) {
        return prev;
      }
      return { helper, preview, loading: false };
    });
  }, [t]);

  const handleUninstallConfirmed = useCallback(async () => {
    if (!confirmation || confirmation.loading) return;
    const helper = confirmation.helper;
    setConfirmation(null);
    await runAction(helper, 'uninstall');
  }, [confirmation, runAction]);

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
        <SettingsSection
          header={
            <SettingsSectionHeader
              title={t('settingsRuntimeProviderHelpersTitle')}
              description={t('settingsRuntimeProviderHelpersDescription')}
            />
          }
        >
          {helpersLoading && lifecycleHelpers.length === 0 ? (
            <p className="settingsRuntimeNote">{t('settingsRuntimeLoadingHelpers')}</p>
          ) : lifecycleHelpers.length === 0 ? (
            <p className="settingsRuntimeNote">
              {t('settingsRuntimeNoProviderHelpers')}
            </p>
          ) : (
            <ul className="settingsRuntimeList settingsRuntimeHelperList">
              {lifecycleHelpers.map((helper) => {
                const actions = deriveHelperActions(helper, t);
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
                            disabled={isThisHelperRunning}
                            onClick={() => void runAction(helper, entry.action)}
                          >
                            {isThisHelperRunning
                              ? t('settingsRuntimeWorkingState')
                              : actionLabel(entry.action)}
                          </button>
                        ))}
                      {helper.supportsUninstall ? (
                        <button
                          type="button"
                          className="dangerButton"
                          disabled={isThisHelperRunning}
                          onClick={() => void openUninstallPrompt(helper)}
                        >
                          {t('settingsRuntimeUninstallButtonLabel')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SettingsSection>
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
        <a
          className="secondaryButton settingsInlineLink"
          href={runtimeSetupHref}
          target="_blank"
          rel="noreferrer"
        >
          {t('settingsRuntimeOpenStandaloneSetup')}
        </a>
      </SettingsSection>

      {confirmation ? (() => {
        const canConfirm = uninstallPromptIsActionable(confirmation);
        const showCloseAction = !canConfirm && !confirmation.loading;
        return (
          <div className="settingsRuntimeConfirmOverlay" role="dialog" aria-modal="true">
            <div className="settingsRuntimeConfirmCard">
              <UninstallConfirmBody prompt={confirmation} t={t} />
              <SettingsActionBar>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setConfirmation(null)}
                >
                  {t(
                    showCloseAction
                      ? 'settingsRuntimeCancelActionFallbackLabel'
                      : 'settingsRuntimeCancelActionLabel',
                  )}
                </button>
                <button
                  type="button"
                  className="dangerButton"
                  disabled={!canConfirm}
                  onClick={() => void handleUninstallConfirmed()}
                >
                  {t('settingsRuntimeUninstallButtonLabel')}
                </button>
              </SettingsActionBar>
            </div>
          </div>
        );
      })() : null}

      <ToastContainer toasts={toasts} />
    </>
  );
}

function UninstallConfirmBody({
  prompt,
  t,
}: {
  prompt: UninstallPrompt;
  t: (key: MessageKey, values?: MessageInterpolationValues) => string;
}) {
  return (
    <>
      <h3>{t('settingsRuntimeUninstallTitle', { label: prompt.helper.label })}?</h3>
      <p>
        {t('settingsRuntimeUninstallDescriptionPrefix')}
        <strong> {prompt.helper.label}</strong>.
        {' '}
        {t('settingsRuntimeUninstallDescriptionSuffix')}
      </p>
      <p className="settingsRuntimeNote">
        {t('settingsRuntimeUninstallHelperLabel', { helperId: prompt.helper.id })}
        <br />
        {t('settingsRuntimeUninstallScriptLabel', { scriptPath: prompt.helper.packagedRelativePath })}
      </p>
      <RemovalPreview preview={prompt.preview} loading={prompt.loading} t={t} />
    </>
  );
}

function RemovalPreview({
  preview,
  loading,
  t,
}: {
  preview: RuntimeUninstallPreview | null;
  loading: boolean;
  t: (key: MessageKey, values?: MessageInterpolationValues) => string;
}) {
  if (loading) {
    return <p className="settingsRuntimeNote">{t('settingsRuntimeComputingPlannedRemovals')}</p>;
  }
  if (!preview || !preview.available) {
    return (
      <p className="settingsRuntimeNote">
        {preview?.message ?? t('settingsRuntimePreviewUnavailable')}
      </p>
    );
  }
  if (preview.status === 'not_installed') {
    return (
      <p className="settingsRuntimeNote">
        {t('settingsRuntimeNothingToRemove')}
        {preview.systemInstallPath ? (
          <>
            <br />
            {t('settingsRuntimeSystemInstallDetected', {
              installPath: preview.systemInstallPath,
            })}
          </>
        ) : null}
      </p>
    );
  }
  return (
    <div className="settingsRuntimePreview">
      <p className="settingsRuntimeNote">
        {t('settingsRuntimeWillRemoveItems', {
          itemCount: preview.plannedActions.length,
          pluralSuffix: preview.plannedActions.length === 1 ? '' : 's',
        })}
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
          {t('settingsRuntimeSystemInstallCannotRemove', {
            installPath: preview.systemInstallPath,
          })}
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
