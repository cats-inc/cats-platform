import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
} from '../../../design/components/settings/index.js';
import type {
  CatsAppInstallState,
  PlatformInstalledAppDescriptor,
} from '../../../shared/catsAppManifest.js';

export interface PlatformSettingsAppsProps {
  installedApps: readonly PlatformInstalledAppDescriptor[];
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

function statusTone(state: CatsAppInstallState) {
  if (state === 'enabled') {
    return 'ready';
  }
  if (state === 'error' || state === 'upgrade-pending') {
    return 'warm';
  }
  return 'muted';
}

export function PlatformSettingsApps({
  installedApps,
}: PlatformSettingsAppsProps) {
  const connectorCount = installedApps
    .filter((app) => app.category === 'capability-connector')
    .length;

  return (
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
        {installedApps.length > 0 ? installedApps.map((app) => (
          <SettingsOptionRow
            key={app.id}
            label={app.displayName}
            description={(
              <span className="settingsAppsMeta">
                <span>{formatCategory(app.category)}</span>
                <span>{app.version}</span>
                <span>{app.publisher}</span>
              </span>
            )}
            control={(
              <SettingsStatusChip tone={statusTone(app.installState)}>
                {formatInstallState(app.installState)}
              </SettingsStatusChip>
            )}
          />
        )) : (
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
  );
}
