import { useState } from 'react';

import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
  type SettingsStatusChipTone,
} from '../../../design/components/settings/index.js';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import type { DesktopMobilePairingEnvUpdateResult } from '../../../shared/desktopRecoveryBridge.js';
import { type MessageKey } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';
import { createQrCodeMatrix } from './qrCode.js';
import { formatSettingsDesktopMutationError } from './settingsDesktopErrorLabels.js';
import {
  DEFAULT_MOBILE_PAIRING,
  resolveDefaultDesktopPreferences,
} from './settingsDesktopPreferences.js';

export interface PlatformSettingsDesktopMobilePairingProps {
  payload: AppShellPayload;
  showToast: (message: string) => void;
}

function resolveDesktopPairingReachabilityLabel(
  mobilePairing: AppShellPayload['desktop']['mobilePairing'],
  t: (key: MessageKey) => string,
): string {
  if (mobilePairing.noLanCandidateReason === 'loopback_bound') {
    return t('settingsDesktopMobilePairingReachabilityLoopback');
  }
  if (mobilePairing.noLanCandidateReason === 'no_lan_candidate') {
    return t('settingsDesktopMobilePairingReachabilityLan');
  }
  if (
    mobilePairing.noLanCandidateReason === 'bind_host_not_lan_candidate'
  ) {
    return t('settingsDesktopMobilePairingReachabilityOtherInterface');
  }
  return t('settingsDesktopMobilePairingReachabilityAllInterfaces');
}

function resolveMobilePairingStatus(
  mobilePairing: AppShellPayload['desktop']['mobilePairing'],
  t: (key: MessageKey) => string,
): { tone: SettingsStatusChipTone; label: string } {
  if (!mobilePairing.enabled) {
    return { tone: 'muted', label: t('settingsDesktopMobilePairingStatusDisabled') };
  }
  if (mobilePairing.noLanCandidateReason === 'loopback_bound') {
    return { tone: 'warm', label: t('settingsDesktopMobilePairingStatusLoopbackOnly') };
  }
  if (
    mobilePairing.noLanCandidateReason === 'no_lan_candidate'
    || mobilePairing.noLanCandidateReason === 'bind_host_not_lan_candidate'
  ) {
    return { tone: 'warm', label: t('settingsDesktopMobilePairingStatusNoLanAddress') };
  }
  if (mobilePairing.pairingUrlStatus === 'ready') {
    return { tone: 'ready', label: t('settingsDesktopMobilePairingStatusReady') };
  }
  return { tone: 'warm', label: t('settingsDesktopMobilePairingStatusValidationPending') };
}

function MobilePairingQrCode({
  t,
  url,
}: {
  t: (key: MessageKey) => string;
  url: string;
}) {
  const qr = createQrCodeMatrix(url);
  if (!qr) {
    return <span>{t('settingsDesktopMobilePairingQrUrlTooLong')}</span>;
  }

  const modules = [];
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.cells[y]?.[x]) {
        modules.push(<rect key={`${x}:${y}`} x={x} y={y} width="1" height="1" />);
      }
    }
  }

  return (
    <svg
      className="settingsMobilePairingQrCode"
      viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`}
      role="img"
      aria-label={t('settingsDesktopMobilePairingQrCodeLabel')}
      shapeRendering="crispEdges"
    >
      <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} className="qrLight" />
      <g className="qrDark">{modules}</g>
    </svg>
  );
}

/**
 * `Mobile pairing` section for `Settings > Desktop`.
 *
 * It reads the payload but never writes it: enabling pairing is an environment
 * change the host applies and then relaunches for, so there is no preference to
 * update optimistically here.
 */
export function PlatformSettingsDesktopMobilePairing({
  payload,
  showToast,
}: PlatformSettingsDesktopMobilePairingProps) {
  const { t } = useI18n();
  const [applyingMobilePairingEnv, setApplyingMobilePairingEnv] = useState(false);
  const desktopPrefs = payload.desktop ?? resolveDefaultDesktopPreferences();
  const mobilePairing = desktopPrefs.mobilePairing ?? DEFAULT_MOBILE_PAIRING;
  const mobilePairingStatus = resolveMobilePairingStatus(mobilePairing, t);

  async function copyToClipboard(value: string, successMessage: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch {
      showToast(t('settingsConversationPreferenceUpdateFailure'));
    }
  }

  async function enableMobilePairingEnv(): Promise<void> {
    const envText = 'CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true\nCATS_DESKTOP_APP_HOST=0.0.0.0';
    const desktopHost = (
      window as Window & {
        catsDesktopHost?: {
          enableMobilePairing?: () => Promise<DesktopMobilePairingEnvUpdateResult>;
          relaunch?: () => Promise<void>;
        };
      }
    ).catsDesktopHost;

    if (!desktopHost?.enableMobilePairing) {
      await copyToClipboard(
        envText,
        t('settingsDesktopMobilePairingCopyEnvValuesSuccess'),
      );
      return;
    }

    const confirmed = window.confirm(t('settingsDesktopMobilePairingConfirmRestart'));
    if (!confirmed) {
      return;
    }

    setApplyingMobilePairingEnv(true);
    try {
      const result = await desktopHost.enableMobilePairing();
      showToast(t('settingsDesktopMobilePairingDesktopUpdateSuccess', {
        envPath: result.envPath,
      }));
      if (desktopHost.relaunch) {
        await desktopHost.relaunch();
      }
    } catch (error) {
      showToast(formatSettingsDesktopMutationError(
        error,
        t('settingsDesktopMobilePairingDesktopUpdateFailure'),
        t,
      ));
      setApplyingMobilePairingEnv(false);
    }
  }

  return (
    <SettingsSection
      className="settingsMobilePairing"
      header={(
        <SettingsSectionHeader
          title={t('settingsDesktopMobilePairingTitle')}
          description={t('settingsDesktopMobilePairingDescription')}
          status={(
            <SettingsStatusChip tone={mobilePairingStatus.tone}>
              {mobilePairingStatus.label}
            </SettingsStatusChip>
          )}
        />
      )}
    >
      {mobilePairing.enabled ? (
        <div className="settingsMobilePairingGrid">
          <div className="settingsMobilePairingDetails">
            <dl className="settingsMobilePairingFacts">
              <div>
                <dt>{t('settingsDesktopMobilePairingBindLabel')}</dt>
                <dd>{mobilePairing.bindHost}:{mobilePairing.bindPort}</dd>
              </div>
              <div>
                <dt>{t('settingsDesktopMobilePairingReachabilityLabel')}</dt>
                <dd>{resolveDesktopPairingReachabilityLabel(mobilePairing, t)}</dd>
              </div>
              <div>
                <dt>{t('settingsDesktopMobilePairingLanAddressLabel')}</dt>
                <dd>{mobilePairing.selectedLanIp ?? t('settingsDesktopMobilePairingNoneLabel')}</dd>
              </div>
            </dl>

            {mobilePairing.noLanCandidateReason === 'loopback_bound'
              && mobilePairing.bindOverrideEnv ? (
              <SettingsOptionRow
                label={t('settingsDesktopMobilePairingAllowLanLabel')}
                description={t('settingsDesktopMobilePairingAllowLanDescription', {
                  bindOverrideEnv: mobilePairing.bindOverrideEnv,
                })}
                control={(
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={applyingMobilePairingEnv}
                    onClick={() => void enableMobilePairingEnv()}
                  >
                    {applyingMobilePairingEnv
                      ? t('settingsDesktopMobilePairingApplyingButton')
                      : t('settingsDesktopMobilePairingApplyAndRestartButton')}
                  </button>
                )}
              />
            ) : null}

            {mobilePairing.noLanCandidateReason === 'no_lan_candidate' ? (
              <p className="settingsMobilePairingNote">
                {t('settingsDesktopMobilePairingNoLanAddressNote')}
              </p>
            ) : null}

            {mobilePairing.noLanCandidateReason === 'bind_host_not_lan_candidate' ? (
              <p className="settingsMobilePairingNote">
                {t('settingsDesktopMobilePairingHostMismatchNote')}
              </p>
            ) : null}

            {mobilePairing.diagnosticManifestUrl ? (
              <SettingsOptionRow
                label={t('settingsDesktopMobilePairingDiagnosticLabel')}
                description={mobilePairing.diagnosticManifestUrl}
                control={(
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => void copyToClipboard(
                      mobilePairing.diagnosticManifestUrl ?? '',
                      t('settingsDesktopMobilePairingDiagnosticCopiedMessage'),
                    )}
                  >
                    {t('settingsDesktopMobilePairingDiagnosticCopyButton')}
                  </button>
                )}
                layout="stack"
              />
            ) : null}

            {mobilePairing.pairingUrlStatus === 'ready' && mobilePairing.pairingUrl ? (
              <SettingsOptionRow
                label={t('settingsDesktopMobilePairingExpoUrlLabel')}
                description={mobilePairing.pairingUrl}
                control={(
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => void copyToClipboard(
                      mobilePairing.pairingUrl ?? '',
                      t('settingsDesktopMobilePairingExpoUrlCopiedMessage'),
                    )}
                  >
                    {t('settingsDesktopMobilePairingCopyUrlButton')}
                  </button>
                )}
                layout="stack"
              />
            ) : null}
          </div>

          <div className="settingsMobilePairingQr" data-state={mobilePairing.pairingUrlStatus}>
            {mobilePairing.pairingUrlStatus === 'ready' && mobilePairing.pairingUrl ? (
              <div className="settingsMobilePairingQrContent">
                <MobilePairingQrCode t={t} url={mobilePairing.pairingUrl} />
                <code className="settingsMobilePairingQrUrl">{mobilePairing.pairingUrl}</code>
              </div>
            ) : (
              <span>{t('settingsDesktopMobilePairingNoPairingUrlStatus')}</span>
            )}
          </div>
        </div>
      ) : (
        <SettingsOptionRow
          label={t('settingsDesktopMobilePairingEnableLabel')}
          description={t('settingsDesktopMobilePairingEnableDescription')}
          control={(
            <button
              type="button"
              className="secondaryButton"
              disabled={applyingMobilePairingEnv}
              onClick={() => void enableMobilePairingEnv()}
            >
              {applyingMobilePairingEnv
                ? t('settingsDesktopMobilePairingApplyingButton')
                : t('settingsDesktopMobilePairingEnableButton')}
            </button>
          )}
          layout="stack"
        />
      )}
    </SettingsSection>
  );
}
