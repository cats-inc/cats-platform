import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
} from '../../../design/components/settings/index.js';

export function PlatformSettingsApps() {
  return (
    <SettingsSection
      header={
        <SettingsSectionHeader
          title="Apps"
          description="Installed Cats apps, connector packages, and system modules."
        />
      }
    >
      <div className="settings-sub-card">
        <SettingsOptionRow
          label="Installed apps"
          description="No installed apps are registered yet."
          control={<SettingsStatusChip tone="muted">Empty</SettingsStatusChip>}
        />
        <SettingsOptionRow
          label="Connectors"
          description="External agent capabilities will appear here after app package registry support lands."
          control={<SettingsStatusChip tone="warm">Planned</SettingsStatusChip>}
        />
        <SettingsOptionRow
          label="Local install"
          description="Cats Code exports will install through this Settings surface once the local app installer is available."
          control={<SettingsStatusChip tone="warm">Planned</SettingsStatusChip>}
        />
      </div>
    </SettingsSection>
  );
}
