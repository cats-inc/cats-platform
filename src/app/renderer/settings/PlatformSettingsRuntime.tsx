import { resolveRuntimeConnectionChip } from '../../../design/components/runtimeChips.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

function resolveRuntimeSetupChip(
  runtimeSetup: RuntimeSetupSummary,
): { className: string; label: string } {
  switch (runtimeSetup.status) {
    case 'ready':
      return {
        className: 'statusChip statusChipReady',
        label: 'Runtime ready',
      };
    case 'ready_to_apply':
      return {
        className: 'statusChip statusChipWarm',
        label: 'Ready to apply',
      };
    case 'attention_required':
      return {
        className: 'statusChip statusChipWarm',
        label: 'Needs remediation',
      };
    case 'scan_required':
      return {
        className: 'statusChip statusChipWarm',
        label: 'Scan required',
      };
    case 'unavailable':
    default:
      return {
        className: 'statusChip statusChipWarm',
        label: 'Setup unavailable',
      };
  }
}

export function PlatformSettingsRuntime({
  envelope,
}: {
  envelope: PlatformHostEnvelope;
}) {
  const runtimeChip = resolveRuntimeConnectionChip(envelope.runtime);
  const runtimeSetupChip = resolveRuntimeSetupChip(envelope.runtimeSetup);

  return (
    <PlatformSettingsShell
      section="runtime"
      title="Runtime"
      products={envelope.products}
    >
      <div className="contentCard">
        <div className="settingsChipRow">
          <span className={runtimeChip.className}>{runtimeChip.label}</span>
          <span className={runtimeSetupChip.className}>{runtimeSetupChip.label}</span>
        </div>
        <p className="heroNote settingsCardNote">
          {envelope.runtimeSetup.summary}
        </p>
        <div className="setupRuntimeMetrics">
          <div className="setupRuntimeMetric">
            <strong>{envelope.runtimeSetup.availableCount}</strong>
            <span>ready providers</span>
          </div>
          <div className="setupRuntimeMetric">
            <strong>{envelope.runtimeSetup.providerCount}</strong>
            <span>providers scanned</span>
          </div>
          <div className="setupRuntimeMetric">
            <strong>{envelope.runtimeSetup.providersNeedingAttention.length}</strong>
            <span>need attention</span>
          </div>
        </div>
      </div>

      {envelope.runtimeSetup.providersReadyToApply.length > 0 ? (
        <div className="contentCard">
          <h2>Ready providers</h2>
          <ul className="setupRuntimeList">
            {envelope.runtimeSetup.providersReadyToApply.map((entry) => (
              <li key={entry.provider}>
                <strong>{entry.provider}</strong>
                <span>{entry.family}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {envelope.runtimeSetup.providersNeedingAttention.length > 0 ? (
        <div className="contentCard">
          <h2>Need attention</h2>
          <ul className="setupRuntimeList">
            {envelope.runtimeSetup.providersNeedingAttention.map((entry) => (
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
        </div>
      ) : null}

      <div className="contentCard">
        <h2>Standalone setup</h2>
        <p className="heroNote">
          Open the standalone runtime setup when you need provider remediation or a deeper scan.
        </p>
        <a
          className="secondaryButton settingsInlineLink"
          href={`${envelope.runtime.baseUrl.replace(/\/$/, '')}/setup`}
          target="_blank"
          rel="noreferrer"
        >
          Open Cats Runtime setup
        </a>
      </div>
    </PlatformSettingsShell>
  );
}
