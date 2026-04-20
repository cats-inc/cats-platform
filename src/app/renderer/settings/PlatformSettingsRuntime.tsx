import { resolveRuntimeConnectionChip } from '../../../design/components/runtimeChips.js';
import {
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
  type SettingsStatusChipTone,
} from '../../../design/components/settings/index.js';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { PLATFORM_RUNTIME_SETUP_PATH } from '../../../shared/runtimeIngressPaths.js';
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

function resolveRuntimeSetupChip(
  runtimeSetup: RuntimeSetupSummary,
): { tone: SettingsStatusChipTone; label: string } {
  switch (runtimeSetup.status) {
    case 'ready':
      return { tone: 'ready', label: 'Runtime ready' };
    case 'ready_to_apply':
      return { tone: 'warm', label: 'Ready to apply' };
    case 'attention_required':
      return { tone: 'warm', label: 'Needs remediation' };
    case 'scan_required':
      return { tone: 'warm', label: 'Scan required' };
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
  const runtimeChip = resolveRuntimeConnectionChip(payload.runtime);
  const runtimeSetupChip = resolveRuntimeSetupChip(payload.runtimeSetup);

  return (
    <PlatformSettingsShell
      section="runtime"
      title="Runtime"
      products={payload.products}
    >
      <SettingsSection
        header={
          <SettingsSectionHeader
            title="Runtime status"
            description={payload.runtimeSetup.summary}
          />
        }
      >
        <div className="settingsChipRow">
          <SettingsStatusChip tone={runtimeChip.tone}>
            {runtimeChip.label}
          </SettingsStatusChip>
          <SettingsStatusChip tone={runtimeSetupChip.tone}>
            {runtimeSetupChip.label}
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
    </PlatformSettingsShell>
  );
}
