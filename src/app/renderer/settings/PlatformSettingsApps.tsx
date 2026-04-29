import { useState } from 'react';

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
  CatsAppInstallState,
  PlatformInstalledAppDescriptor,
} from '../../../shared/catsAppManifest.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';

export interface PlatformSettingsAppsProps {
  installedApps: readonly PlatformInstalledAppDescriptor[];
  onInstalledAppsUpdate?: (installedApps: PlatformInstalledAppDescriptor[]) => void;
}

type AppPackageMutation = 'enable' | 'disable' | 'uninstall';

interface AppPackageMutationResult {
  app?: PlatformInstalledAppDescriptor;
  appId?: string;
}

function formatCategory(category: PlatformInstalledAppDescriptor['category']): string {
  switch (category) {
    case 'capability-connector':
      return 'Connector';
    case 'product-module':
      return 'Product module';
    case 'user-app':
      return 'User app';
  }
}

function formatInstallState(state: CatsAppInstallState): string {
  switch (state) {
    case 'enabled':
      return 'Enabled';
    case 'installed':
      return 'Installed';
    case 'disabled':
      return 'Disabled';
    case 'error':
      return 'Error';
    case 'upgrade-pending':
      return 'Upgrade pending';
    case 'uninstalled':
      return 'Uninstalled';
  }
}

function formatTrustTier(trustTier: PlatformInstalledAppDescriptor['trustTier']): string {
  switch (trustTier) {
    case 'local-user':
      return 'Local user';
    case 'system':
      return 'System';
    case 'third-party':
      return 'Third party';
  }
}

function formatPermissionCount(count: number): string {
  return `${count} permission${count === 1 ? '' : 's'}`;
}

function formatToolCount(count: number): string {
  return `${count} tool${count === 1 ? '' : 's'}`;
}

function formatConnectorCapabilities(app: PlatformInstalledAppDescriptor): string | null {
  if (app.connectors.length === 0) {
    return null;
  }
  const capabilityCount = app.connectors
    .reduce((total, connector) => total + connector.capabilities.length, 0);
  const capabilityLabel = `capabilit${capabilityCount === 1 ? 'y' : 'ies'}`;
  if (app.connectors.length === 1) {
    return `${app.connectors[0].service}: ${capabilityCount} ${capabilityLabel}`;
  }
  return `${app.connectors.length} connectors, ${capabilityCount} ${capabilityLabel}`;
}

function formatConnectorAuth(app: PlatformInstalledAppDescriptor): string | null {
  const authKinds = Array.from(new Set(
    app.connectors
      .map((connector) => connector.auth?.kind ?? 'none')
      .filter((kind) => kind !== 'none'),
  ));
  return authKinds.length > 0 ? `Auth: ${authKinds.join(', ')}` : null;
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

async function readMutationError(response: Response, fallback: string): Promise<string> {
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

export function PlatformSettingsApps({
  installedApps,
  onInstalledAppsUpdate,
}: PlatformSettingsAppsProps) {
  const connectorCount = installedApps
    .filter((app) => app.category === 'capability-connector')
    .length;
  const { toasts, showToast } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function mutateApp(app: PlatformInstalledAppDescriptor, mutation: AppPackageMutation) {
    const confirmation = await confirm({
      title: mutation === 'uninstall'
        ? 'Uninstall app'
        : mutation === 'enable'
          ? 'Enable app'
          : 'Disable app',
      message: mutation === 'uninstall'
        ? `Uninstall "${app.displayName}"? It will be removed from Cats without deleting package files.`
        : mutation === 'enable'
          ? `Enable "${app.displayName}"? It can appear in Cats wherever its permissions allow.`
          : `Disable "${app.displayName}"? It will stop appearing in Lobby and scoped app routes.`,
      confirmLabel: mutation === 'uninstall'
        ? 'Uninstall'
        : mutation === 'enable'
          ? 'Enable'
          : 'Disable',
      defaultAction: 'cancel',
    });
    if (!confirmation) return;

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
          `${mutation} failed (${response.status})`,
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
      showToast(error instanceof Error ? error.message : `${mutation} failed.`);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <SettingsSection
        header={
          <SettingsSectionHeader
            title="Apps"
            description="Installed Cats apps, connector packages, and system modules."
          />
        }
      >
        <div className="settings-sub-card settingsAppsList">
          <SettingsOptionRow
            label="Installed packages"
            description={`${connectorCount} connector package${connectorCount === 1 ? '' : 's'}`}
            control={(
              <SettingsStatusChip tone={installedApps.length > 0 ? 'ready' : 'muted'}>
                {installedApps.length}
              </SettingsStatusChip>
            )}
          />
          {installedApps.length > 0 ? installedApps.map((app) => {
            const primaryRoute = app.enabled ? app.lobbyEntries[0]?.routePath : undefined;
            const canEnable = app.installState === 'installed' || app.installState === 'disabled';
            const canDisable = app.installState === 'enabled';
            const actionBusy = busyAction?.startsWith(`${app.id}:`) ?? false;
            const connectorCapabilities = formatConnectorCapabilities(app);
            const connectorAuth = formatConnectorAuth(app);
            return (
              <SettingsOptionRow
                key={app.id}
                label={app.displayName}
                description={(
                  <span className="settingsAppsMeta">
                    <span>{formatCategory(app.category)}</span>
                    <span>{formatTrustTier(app.trustTier)}</span>
                    <span>{app.version}</span>
                    <span>{app.publisher}</span>
                    <span>{formatPermissionCount(app.permissions.length)}</span>
                    {connectorCapabilities ? (
                      <span>{connectorCapabilities}</span>
                    ) : null}
                    {connectorAuth ? (
                      <span>{connectorAuth}</span>
                    ) : null}
                    {app.tools.length > 0 ? (
                      <span>{formatToolCount(app.tools.length)}</span>
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
                        Open
                      </a>
                    ) : null}
                    {canEnable ? (
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={actionBusy}
                        onClick={() => void mutateApp(app, 'enable')}
                      >
                        Enable
                      </button>
                    ) : null}
                    {canDisable ? (
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={actionBusy}
                        onClick={() => void mutateApp(app, 'disable')}
                      >
                        Disable
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="dangerButton"
                      disabled={actionBusy}
                      onClick={() => void mutateApp(app, 'uninstall')}
                    >
                      Uninstall
                    </button>
                    <SettingsStatusChip tone={statusTone(app.installState)}>
                      {formatInstallState(app.installState)}
                    </SettingsStatusChip>
                  </SettingsActionBar>
                )}
              />
            );
          }) : (
            <SettingsOptionRow
              label="Installed apps"
              description="No installed apps are registered yet."
              control={<SettingsStatusChip tone="muted">Empty</SettingsStatusChip>}
            />
          )}
          <SettingsOptionRow
            label="Local install"
            description="Install review is pending."
            control={<SettingsStatusChip tone="warm">Planned</SettingsStatusChip>}
          />
        </div>
      </SettingsSection>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
    </>
  );
}
