import { useState } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
  type SettingsStatusChipTone,
} from '../../../design/components/settings/index.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';
import type { DesktopMobilePairingEnvUpdateResult } from '../../../shared/desktopRecoveryBridge.js';
import { type MessageKey } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';
import { createQrCodeMatrix } from './qrCode.js';

export interface PlatformSettingsDesktopStartupProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

const DEFAULT_MOBILE_PAIRING: AppShellPayload['desktop']['mobilePairing'] = {
  enabled: false,
  bindHost: '127.0.0.1',
  bindPort: 0,
  bindReachability: 'loopback',
  canReachFromLan: false,
  selectedLanIp: null,
  selectedLanUrl: null,
  diagnosticManifestUrl: null,
  noLanCandidateReason: 'feature_disabled',
  bindOverrideEnv: 'CATS_DESKTOP_APP_HOST=0.0.0.0',
  pairingUrlStatus: 'phase1_pending',
  pairingUrl: null,
};

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
  if (mobilePairing.pairingUrlStatus === 'ready' && mobilePairing.pairingUrl) {
    return { tone: 'ready', label: t('settingsDesktopMobilePairingStatusReady') };
  }
  return { tone: 'warm', label: t('settingsDesktopMobilePairingStatusValidationPending') };
}

function resolveDefaultDesktopPreferences(): AppShellPayload['desktop'] {
  return {
    startAtLogin: true,
    openWindowOnStartup: false,
    systemTrayEnabled: true,
    mobilePairing: DEFAULT_MOBILE_PAIRING,
  };
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

export function PlatformSettingsDesktopStartup({
  payload,
  onPayloadUpdate,
}: PlatformSettingsDesktopStartupProps) {
  const { t } = useI18n();
  const [savingDesktopPrefs, setSavingDesktopPrefs] = useState(false);
  const [applyingMobilePairingEnv, setApplyingMobilePairingEnv] = useState(false);
  const desktopPrefs = payload.desktop ?? resolveDefaultDesktopPreferences();
  const mobilePairing = desktopPrefs.mobilePairing ?? DEFAULT_MOBILE_PAIRING;
  const mobilePairingStatus = resolveMobilePairingStatus(mobilePairing, t);
  const { toasts, showToast } = useToast();

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

    setApplyingMobilePairingEnv(true);
    try {
      const result = await desktopHost.enableMobilePairing();
      showToast(t('settingsDesktopMobilePairingDesktopUpdateSuccess', {
        envPath: result.envPath,
      }));
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t('settingsDesktopMobilePairingDesktopUpdateFailure'),
      );
    } finally {
      setApplyingMobilePairingEnv(false);
    }
  }

  async function updateDesktopPreferences(
    nextDesktopPrefs: AppShellPayload['desktop'],
  ): Promise<void> {
    const previousDesktopPrefs = payload.desktop ?? resolveDefaultDesktopPreferences();
    const failureMessage = t('settingsConversationPreferenceUpdateFailure');
    onPayloadUpdate({
      ...payload,
      desktop: nextDesktopPrefs,
    });
    setSavingDesktopPrefs(true);
    try {
      const desktopHost = (
        window as Window & {
          catsDesktopHost?: {
            updateDesktopPreferences?: (
              prefs: AppShellPayload['desktop'],
            ) => Promise<AppShellPayload['desktop']>;
          };
        }
      ).catsDesktopHost;

      let persistedPrefs = nextDesktopPrefs;
      if (desktopHost?.updateDesktopPreferences) {
        persistedPrefs = await desktopHost.updateDesktopPreferences(nextDesktopPrefs);
      } else {
        const response = await fetch('/api/platform/preferences', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nextDesktopPrefs),
        });
        if (!response.ok) {
          throw new Error(failureMessage);
        }
        const body = await response.json() as Partial<AppShellPayload['desktop']>;
        persistedPrefs = {
          ...desktopPrefs,
          startAtLogin: body.startAtLogin !== false,
          openWindowOnStartup: body.openWindowOnStartup === true,
          systemTrayEnabled: body.systemTrayEnabled !== false,
        };
      }

      onPayloadUpdate({
        ...payload,
        desktop: persistedPrefs,
      });
      dispatchPlatformEnvelopeRefresh();
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        desktop: previousDesktopPrefs,
      });
      showToast(error instanceof Error ? error.message : failureMessage);
    } finally {
      setSavingDesktopPrefs(false);
    }
  }

  return (
    <>
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
        <div className="settingsMobilePairingGrid">
          <div className="settingsMobilePairingDetails">
            {!mobilePairing.enabled ? (
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
              />
            ) : (
              <>
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
              </>
            )}
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
      </SettingsSection>

      <SettingsSection
        header={(
          <SettingsSectionHeader
            title={t('settingsDesktopStartupTitle')}
            description={t('settingsDesktopStartupDescription')}
          />
        )}
      >
        <SettingsOptionRow
          asChoice
          label={t('settingsDesktopStartupSignInLabel')}
          description={t('settingsDesktopStartupSignInDescription')}
          control={(
            <input
              type="checkbox"
              checked={desktopPrefs.startAtLogin}
              disabled={savingDesktopPrefs}
              onChange={() => {
                void updateDesktopPreferences({
                  ...desktopPrefs,
                  startAtLogin: !desktopPrefs.startAtLogin,
                });
              }}
            />
          )}
        />
        <SettingsOptionRow
          asChoice
          label={t('settingsDesktopStartupTrayLabel')}
          description={t('settingsDesktopStartupTrayDescription')}
          control={(
            <input
              type="checkbox"
              checked={desktopPrefs.systemTrayEnabled}
              disabled={savingDesktopPrefs}
              onChange={() => {
                void updateDesktopPreferences({
                  ...desktopPrefs,
                  systemTrayEnabled: !desktopPrefs.systemTrayEnabled,
                });
              }}
            />
          )}
        />
        <SettingsOptionRow
          asChoice
          label={t('settingsDesktopStartupOpenWindowLabel')}
          description={t('settingsDesktopStartupOpenWindowDescription')}
          control={(
            <input
              type="checkbox"
              checked={desktopPrefs.openWindowOnStartup}
              disabled={savingDesktopPrefs}
              onChange={() => {
                void updateDesktopPreferences({
                  ...desktopPrefs,
                  openWindowOnStartup: !desktopPrefs.openWindowOnStartup,
                });
              }}
            />
          )}
        />
      </SettingsSection>

      <ToastContainer toasts={toasts} />
    </>
  );
}
