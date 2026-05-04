import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsActionBar,
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
} from '../../../design/components/settings/index.js';
import type {
  CatsAppManifestV1,
  CatsAppInstallState,
  PlatformInstalledAppDescriptor,
} from '../../../shared/catsAppManifest.js';
import type { CatsAppManifestValidationIssue } from '../../../shared/catsAppValidation.js';
import { type MessageKey } from '../../../shared/i18n/index.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';
import { useI18n } from '../i18n/index.js';
import {
  formatSettingsAppsMutationError,
  localizeSettingsAppsValidationIssue,
} from './settingsAppsErrorLabels.js';

type AppPackageMutation = 'enable' | 'disable' | 'uninstall';

interface AppPackageMutationResult {
  app?: PlatformInstalledAppDescriptor;
  appId?: string;
}

interface AppPackageValidationResult {
  ok: boolean;
  packagePath?: string;
  manifestPath?: string;
  manifest?: CatsAppManifestV1;
  issues?: CatsAppManifestValidationIssue[];
}

interface LocalInstallReview {
  packagePath: string;
  manifestPath: string | null;
  manifest: CatsAppManifestV1;
}

const APP_CATEGORY_LABEL_BY_CATEGORY: Record<
  PlatformInstalledAppDescriptor['category'],
  MessageKey
> = {
  'capability-connector': 'settingsAppsCategoryConnector',
  'product-module': 'settingsAppsCategoryProductModule',
  'user-app': 'settingsAppsCategoryUserApp',
};

const APP_INSTALL_STATE_LABEL_BY_STATE: Record<CatsAppInstallState, MessageKey> = {
  enabled: 'settingsAppsInstallStateEnabled',
  installed: 'settingsAppsInstallStateInstalled',
  disabled: 'settingsAppsInstallStateDisabled',
  error: 'settingsAppsInstallStateError',
  'upgrade-pending': 'settingsAppsInstallStateUpgradePending',
  uninstalled: 'settingsAppsInstallStateUninstalled',
};

const APP_TRUST_TIER_LABEL_BY_TIER: Record<
  PlatformInstalledAppDescriptor['trustTier'],
  MessageKey
> = {
  'local-user': 'settingsAppsTrustTierLocalUser',
  system: 'settingsAppsTrustTierSystem',
  'third-party': 'settingsAppsTrustTierThirdParty',
};

const APP_MUTATION_TITLE_BY_ACTION: Record<AppPackageMutation, MessageKey> = {
  uninstall: 'settingsAppsUninstallTitle',
  enable: 'settingsAppsEnableTitle',
  disable: 'settingsAppsDisableTitle',
};

const APP_MUTATION_MESSAGE_BY_ACTION: Record<AppPackageMutation, MessageKey> = {
  uninstall: 'settingsAppsUninstallMessage',
  enable: 'settingsAppsEnableMessage',
  disable: 'settingsAppsDisableMessage',
};

function pluralSuffix(count: number): string {
  return count === 1 ? '' : 's';
}

function formatPermissionCount(
  count: number,
  t: (key: MessageKey, values?: Record<string, unknown>) => string,
): string {
  return t('settingsAppsPermissionCount', {
    count,
    pluralSuffix: pluralSuffix(count),
  });
}

function formatToolCount(
  count: number,
  t: (key: MessageKey, values?: Record<string, unknown>) => string,
): string {
  return t('settingsAppsToolCount', {
    count,
    pluralSuffix: pluralSuffix(count),
  });
}

function formatConnectorCapabilities(
  app: PlatformInstalledAppDescriptor,
  t: (key: MessageKey, values?: Record<string, unknown>) => string,
): string | null {
  if (app.connectors.length === 0) {
    return null;
  }

  const capabilityCount = app.connectors.reduce(
    (total, connector) => total + connector.capabilities.length,
    0,
  );
  const capabilityLabel = t(
    capabilityCount === 1
      ? 'settingsAppsCapabilitySingular'
      : 'settingsAppsCapabilityPlural',
  );
  if (app.connectors.length === 1) {
    return t('settingsAppsConnectorCountSingle', {
      connector: app.connectors[0].service,
      count: capabilityCount,
      capabilityLabel,
    });
  }
  return t('settingsAppsConnectorCountMany', {
    connectorCount: app.connectors.length,
    count: capabilityCount,
    capabilityLabel,
  });
}

function formatConnectorAuth(
  app: PlatformInstalledAppDescriptor,
  t: (key: MessageKey) => string,
): string | null {
  const authKinds = Array.from(
    new Set(
      app.connectors
        .map((connector) => connector.auth?.kind ?? 'none')
        .filter((kind) => kind !== 'none'),
    ),
  );
  return authKinds.length > 0 ? `${t('settingsAppsAuthLabel')}: ${authKinds.join(', ')}` : null;
}

function statusTone(state: CatsAppInstallState) {
  if (state === 'enabled') {
    return 'ready';
  }
  if (state === 'error' || state === 'upgrade-pending') {
    return 'warm';
  }
  return 'muted';
}

function summarizeValidationIssues(
  issues: readonly CatsAppManifestValidationIssue[] = [],
  t: (key: MessageKey, values?: Record<string, unknown>) => string,
): string {
  return localizeSettingsAppsValidationIssue(issues[0], t);
}

async function readMutationError(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string };
  } | null;
  return payload?.error?.message ?? fallback;
}

function upsertInstalledApp(
  installedApps: readonly PlatformInstalledAppDescriptor[],
  app: PlatformInstalledAppDescriptor,
): PlatformInstalledAppDescriptor[] {
  const existingIndex = installedApps.findIndex((entry) => entry.id === app.id);
  if (existingIndex < 0) {
    return [...installedApps, app];
  }
  return installedApps.map((entry) => (entry.id === app.id ? app : entry));
}

function removeInstalledApp(
  installedApps: readonly PlatformInstalledAppDescriptor[],
  appId: string,
): PlatformInstalledAppDescriptor[] {
  return installedApps.filter((entry) => entry.id !== appId);
}

export function resolveInstalledAppLaunchPath(
  app: PlatformInstalledAppDescriptor,
): `/apps/${string}` | null {
  if (!app.enabled || app.installState !== 'enabled') {
    return null;
  }
  return app.lobbyEntries[0]?.routePath ?? null;
}

export function resolveInstalledAppSettingsPath(
  app: PlatformInstalledAppDescriptor,
): `/settings/${string}` | null {
  return app.connectors.find((connector) => connector.setupPath)?.setupPath
    ?? app.settings?.[0]?.path
    ?? null;
}

export interface PlatformSettingsAppsProps {
  installedApps: readonly PlatformInstalledAppDescriptor[];
  onInstalledAppsUpdate?: (installedApps: PlatformInstalledAppDescriptor[]) => void;
}

export function PlatformSettingsApps({
  installedApps,
  onInstalledAppsUpdate,
}: PlatformSettingsAppsProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const connectorCount = installedApps
    .filter((app) => app.category === 'capability-connector')
    .length;
  const { toasts, showToast } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [localPackagePath, setLocalPackagePath] = useState('');
  const [installReview, setInstallReview] = useState<LocalInstallReview | null>(null);
  const [installBusy, setInstallBusy] = useState(false);

  async function mutateApp(app: PlatformInstalledAppDescriptor, mutation: AppPackageMutation) {
    const confirmation = await confirm({
      title: t(APP_MUTATION_TITLE_BY_ACTION[mutation]),
      message: t(APP_MUTATION_MESSAGE_BY_ACTION[mutation], { appDisplayName: app.displayName }),
      confirmLabel: t(
        mutation === 'uninstall'
          ? 'settingsAppsUninstallAction'
          : mutation === 'enable'
            ? 'settingsAppsEnableAction'
            : 'settingsAppsDisableAction',
      ),
      defaultAction: 'cancel',
    });
    if (!confirmation) {
      return;
    }

    const busyKey = `${app.id}:${mutation}`;
    setBusyAction(busyKey);
    try {
      const response = await fetch(
        mutation === 'uninstall'
          ? `/api/apps/${encodeURIComponent(app.id)}`
          : `/api/apps/${encodeURIComponent(app.id)}/${mutation}`,
        {
          method: mutation === 'uninstall' ? 'DELETE' : 'POST',
          headers: { Accept: 'application/json' },
        },
      );
      if (!response.ok) {
        throw new Error(await readMutationError(
          response,
          t('settingsAppsMutationFailed', {
            action: t(
              mutation === 'uninstall'
                ? 'settingsAppsUninstallAction'
                : mutation === 'enable'
                  ? 'settingsAppsEnableAction'
                  : 'settingsAppsDisableAction',
            ),
            status: response.status,
          }),
        ));
      }

      const result = await response.json() as AppPackageMutationResult;
      if (mutation === 'uninstall') {
        onInstalledAppsUpdate?.(removeInstalledApp(installedApps, result.appId ?? app.id));
      } else if (result.app) {
        onInstalledAppsUpdate?.(upsertInstalledApp(installedApps, result.app));
      }
      dispatchPlatformEnvelopeRefresh();
    } catch (error) {
      showToast(
        formatSettingsAppsMutationError(
          error,
          t('settingsAppsMutationFailedFallback'),
          t,
        ),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function reviewLocalPackage() {
    const packagePath = localPackagePath.trim();
    if (!packagePath) {
      showToast(t('settingsAppsPackagePathRequired'));
      return;
    }

    setInstallBusy(true);
    try {
      const response = await fetch('/api/apps/validate', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ packagePath }),
      });
      const result = await response.json() as AppPackageValidationResult;
      if (!response.ok || !result.ok || !result.manifest) {
        throw new Error(summarizeValidationIssues(result.issues, t));
      }
      setInstallReview({
        packagePath: result.packagePath ?? packagePath,
        manifestPath: result.manifestPath ?? null,
        manifest: result.manifest,
      });
    } catch (error) {
      setInstallReview(null);
      showToast(
        formatSettingsAppsMutationError(
          error,
          t('settingsAppsValidationFailed'),
          t,
        ),
      );
    } finally {
      setInstallBusy(false);
    }
  }

  async function installReviewedPackage() {
    if (!installReview) {
      return;
    }
    const confirmation = await confirm({
      title: t('settingsAppsInstallTitle'),
      message: t('settingsAppsInstallMessage', { appDisplayName: installReview.manifest.displayName }),
      confirmLabel: t('settingsAppsInstallButton'),
      defaultAction: 'cancel',
    });
    if (!confirmation) {
      return;
    }

    setInstallBusy(true);
    try {
      const response = await fetch('/api/apps/install', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          packagePath: installReview.packagePath,
          enable: true,
        }),
      });
      const result = await response.json() as AppPackageMutationResult & {
        ok?: boolean;
        issues?: CatsAppManifestValidationIssue[];
      };
      if (!response.ok || !result.app) {
        throw new Error(
          result.issues
            ? summarizeValidationIssues(result.issues, t)
            : t('settingsAppsMutationFailed', {
              action: t('settingsAppsInstallButton'),
              status: response.status,
            }),
        );
      }
      onInstalledAppsUpdate?.(upsertInstalledApp(installedApps, result.app));
      setLocalPackagePath('');
      setInstallReview(null);
      dispatchPlatformEnvelopeRefresh();
      const launchPath = resolveInstalledAppLaunchPath(result.app);
      if (launchPath) {
        navigate(launchPath);
      }
    } catch (error) {
      showToast(
        formatSettingsAppsMutationError(
          error,
          t('settingsAppsMutationFailed', { action: t('settingsAppsInstallButton') }),
          t,
        ),
      );
    } finally {
      setInstallBusy(false);
    }
  }

  const title = t('settingsAppsSectionTitle');
  const description = t('settingsAppsSectionDescription');
  const installedPackagesDescription = t('settingsAppsInstalledPackagesDescription', {
    count: connectorCount,
    pluralSuffix: pluralSuffix(connectorCount),
  });

  return (
    <>
      <SettingsSection
        header={
          <SettingsSectionHeader
            title={title}
            description={description}
          />
        }
      >
        <div className="settings-sub-card settingsAppsList">
          <SettingsOptionRow
            label={t('settingsAppsInstalledPackagesLabel')}
            description={installedPackagesDescription}
            control={(
              <SettingsStatusChip tone={installedApps.length > 0 ? 'ready' : 'muted'}>
                {installedApps.length}
              </SettingsStatusChip>
            )}
          />
          {installedApps.length > 0 ? installedApps.map((app) => {
            const primaryRoute = resolveInstalledAppLaunchPath(app);
            const canEnable = app.installState === 'installed' || app.installState === 'disabled';
            const canDisable = app.installState === 'enabled';
            const actionBusy = busyAction?.startsWith(`${app.id}:`) ?? false;
            const connectorCapabilities = formatConnectorCapabilities(app, t);
            const connectorAuth = formatConnectorAuth(app, t);
            const settingsPath = resolveInstalledAppSettingsPath(app);
            return (
              <SettingsOptionRow
                key={app.id}
                label={app.displayName}
                description={(
                  <span className="settingsAppsMeta">
                    <span>{t(APP_CATEGORY_LABEL_BY_CATEGORY[app.category], {})}</span>
                    <span>{t(APP_TRUST_TIER_LABEL_BY_TIER[app.trustTier], {})}</span>
                    <span>{app.version}</span>
                    <span>{app.publisher}</span>
                    <span>{formatPermissionCount(app.permissions.length, t)}</span>
                    {connectorCapabilities ? (
                      <span>{connectorCapabilities}</span>
                    ) : null}
                    {connectorAuth ? (
                      <span>{connectorAuth}</span>
                    ) : null}
                    {app.tools.length > 0 ? (
                      <span>{formatToolCount(app.tools.length, t)}</span>
                    ) : null}
                  </span>
                )}
                control={(
                  <SettingsActionBar>
                    {primaryRoute ? (
                      <a
                        className="secondaryButton settingsInlineLink"
                        href={primaryRoute}
                      >
                        {t('settingsAppsOpenAction')}
                      </a>
                    ) : null}
                    {settingsPath ? (
                      <a
                        className="secondaryButton settingsInlineLink"
                        href={settingsPath}
                      >
                        {t('settingsAppsSettingsAction')}
                      </a>
                    ) : null}
                    {canEnable ? (
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={actionBusy}
                        onClick={() => void mutateApp(app, 'enable')}
                      >
                        {t('settingsAppsEnableAction')}
                      </button>
                    ) : null}
                    {canDisable ? (
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={actionBusy}
                        onClick={() => void mutateApp(app, 'disable')}
                      >
                        {t('settingsAppsDisableAction')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="dangerButton"
                      disabled={actionBusy}
                      onClick={() => void mutateApp(app, 'uninstall')}
                    >
                      {t('settingsAppsUninstallAction')}
                    </button>
                    <SettingsStatusChip tone={statusTone(app.installState)}>
                      {t(APP_INSTALL_STATE_LABEL_BY_STATE[app.installState], {})}
                    </SettingsStatusChip>
                  </SettingsActionBar>
                )}
              />
            );
          }) : (
            <SettingsOptionRow
              label={t('settingsAppsNoInstalledAppsLabel')}
              description={t('settingsAppsNoInstalledAppsDescription')}
              control={(
                <SettingsStatusChip tone="muted">
                  {t('settingsAppsEmptyStateChipLabel')}
                </SettingsStatusChip>
              )}
            />
          )}
          <SettingsOptionRow
            label={t('settingsAppsLocalInstallTitle')}
            description={t('settingsAppsLocalInstallDescription')}
            layout="stack"
            control={(
              <div className="settingsAppsInstall">
                <label className="fieldLabel">
                  <span>{t('settingsAppsPackagePathLabel')}</span>
                  <input
                    className="textInput"
                    value={localPackagePath}
                    placeholder={t('settingsAppsPackagePathPlaceholder')}
                    disabled={installBusy}
                    onChange={(event) => {
                      setLocalPackagePath(event.target.value);
                      setInstallReview(null);
                    }}
                  />
                </label>
                <SettingsActionBar>
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={installBusy}
                    onClick={() => void reviewLocalPackage()}
                  >
                    {t('settingsAppsReviewButton')}
                  </button>
                  <SettingsStatusChip tone={installReview ? 'ready' : 'warm'}>
                    {installReview
                      ? t('settingsAppsLocalInstallReady')
                      : t('settingsAppsLocalInstallNeedsReview')
                    }
                  </SettingsStatusChip>
                </SettingsActionBar>
                {installReview ? (
                  <div className="settingsAppsReview">
                    <span>{installReview.manifest.displayName}</span>
                    <span>{installReview.manifest.id}</span>
                    <span>{installReview.manifest.contributions.lobbyApps?.[0]?.routePath ?? t('settingsAppsNoLobbyRoute')}</span>
                    <span>{t(APP_CATEGORY_LABEL_BY_CATEGORY[installReview.manifest.category], {})}</span>
                    <span>{t(APP_TRUST_TIER_LABEL_BY_TIER[installReview.manifest.trustTier], {})}</span>
                    <span>{formatPermissionCount(installReview.manifest.permissions.length, t)}</span>
                    <SettingsActionBar>
                      <button
                        type="button"
                        className="primaryButton"
                        disabled={installBusy}
                        onClick={() => void installReviewedPackage()}
                      >
                        {t('settingsAppsInstallButton')}
                      </button>
                    </SettingsActionBar>
                  </div>
                ) : null}
              </div>
            )}
          />
        </div>
      </SettingsSection>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
    </>
  );
}
