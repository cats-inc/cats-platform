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

function resolveMobilePairingStatus(
  mobilePairing: AppShellPayload['desktop']['mobilePairing'],
): { tone: SettingsStatusChipTone; label: string } {
  if (!mobilePairing.enabled) {
    return { tone: 'muted', label: 'Disabled' };
  }
  if (mobilePairing.noLanCandidateReason === 'loopback_bound') {
    return { tone: 'warm', label: 'Loopback only' };
  }
  if (
    mobilePairing.noLanCandidateReason === 'no_lan_candidate'
    || mobilePairing.noLanCandidateReason === 'bind_host_not_lan_candidate'
  ) {
    return { tone: 'warm', label: 'No LAN address' };
  }
  if (mobilePairing.pairingUrlStatus === 'ready' && mobilePairing.pairingUrl) {
    return { tone: 'ready', label: 'Ready' };
  }
  return { tone: 'warm', label: 'Manifest validation pending' };
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
  url,
}: {
  url: string;
}) {
  const qr = createQrCodeMatrix(url);
  if (!qr) {
    return <span>URL too long</span>;
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
      aria-label="Mobile pairing QR code"
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
  const [savingDesktopPrefs, setSavingDesktopPrefs] = useState(false);
  const [applyingMobilePairingEnv, setApplyingMobilePairingEnv] = useState(false);
  const desktopPrefs = payload.desktop ?? resolveDefaultDesktopPreferences();
  const mobilePairing = desktopPrefs.mobilePairing ?? DEFAULT_MOBILE_PAIRING;
  const mobilePairingStatus = resolveMobilePairingStatus(mobilePairing);
  const { toasts, showToast } = useToast();

  async function copyToClipboard(value: string, successMessage: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch {
      showToast('Failed to copy to clipboard.');
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
      await copyToClipboard(envText, 'Copied mobile pairing env values.');
      return;
    }

    setApplyingMobilePairingEnv(true);
    try {
      const result = await desktopHost.enableMobilePairing();
      showToast(`Updated ${result.envPath}. Restart Cats Desktop to apply.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update desktop env.');
    } finally {
      setApplyingMobilePairingEnv(false);
    }
  }

  async function updateDesktopPreferences(
    nextDesktopPrefs: AppShellPayload['desktop'],
    errorMessage: string,
  ): Promise<void> {
    const previousDesktopPrefs = payload.desktop ?? resolveDefaultDesktopPreferences();
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
          throw new Error(errorMessage);
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
      showToast(error instanceof Error ? error.message : errorMessage);
    } finally {
      setSavingDesktopPrefs(false);
    }
  }

  return (
    <>
      <SettingsSection
        className="settingsMobilePairing"
        header={
          <SettingsSectionHeader
            title="Mobile pairing"
            description="LAN readiness for the bundled Expo Go mobile shell."
            status={(
              <SettingsStatusChip tone={mobilePairingStatus.tone}>
                {mobilePairingStatus.label}
              </SettingsStatusChip>
            )}
          />
        }
      >
        <div className="settingsMobilePairingGrid">
          <div className="settingsMobilePairingDetails">
            {!mobilePairing.enabled ? (
              <SettingsOptionRow
                label="Enable mobile pairing"
                description="Writes the desktop .env values needed for LAN access. Restart Cats Desktop after applying."
                control={(
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={applyingMobilePairingEnv}
                    onClick={() => void enableMobilePairingEnv()}
                  >
                    {applyingMobilePairingEnv ? 'Applying...' : 'Enable'}
                  </button>
                )}
              />
            ) : (
              <>
                <dl className="settingsMobilePairingFacts">
                  <div>
                    <dt>Bind</dt>
                    <dd>{mobilePairing.bindHost}:{mobilePairing.bindPort}</dd>
                  </div>
                  <div>
                    <dt>Reachability</dt>
                    <dd>{mobilePairing.bindReachability.replace('_', ' ')}</dd>
                  </div>
                  <div>
                    <dt>LAN address</dt>
                    <dd>{mobilePairing.selectedLanIp ?? 'None'}</dd>
                  </div>
                </dl>

                {mobilePairing.noLanCandidateReason === 'loopback_bound'
                  && mobilePairing.bindOverrideEnv ? (
                  <SettingsOptionRow
                    label="Allow LAN access"
                    description={(
                      <>
                        Cats is bound to loopback. Restart with{' '}
                        <code>{mobilePairing.bindOverrideEnv}</code>
                        {' '}before scanning from a phone.
                      </>
                    )}
                    control={(
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={applyingMobilePairingEnv}
                        onClick={() => void enableMobilePairingEnv()}
                      >
                        {applyingMobilePairingEnv ? 'Applying...' : 'Apply and restart'}
                      </button>
                    )}
                  />
                  ) : null}

                {mobilePairing.noLanCandidateReason === 'no_lan_candidate' ? (
                <p className="settingsMobilePairingNote">
                  No non-loopback LAN IPv4 address was detected.
                </p>
                ) : null}

                {mobilePairing.noLanCandidateReason === 'bind_host_not_lan_candidate' ? (
                <p className="settingsMobilePairingNote">
                  The current bind host does not match a LAN IPv4 address.
                </p>
                ) : null}

                {mobilePairing.diagnosticManifestUrl ? (
                <SettingsOptionRow
                  label="Diagnostic manifest"
                  description={mobilePairing.diagnosticManifestUrl}
                  control={(
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => void copyToClipboard(
                        mobilePairing.diagnosticManifestUrl ?? '',
                        'Copied diagnostic manifest URL.',
                      )}
                    >
                      Copy URL
                    </button>
                  )}
                  layout="stack"
                />
                ) : null}

                {mobilePairing.pairingUrlStatus === 'ready' && mobilePairing.pairingUrl ? (
                <SettingsOptionRow
                  label="Pairing URL"
                  description={mobilePairing.pairingUrl}
                  control={(
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => void copyToClipboard(
                        mobilePairing.pairingUrl ?? '',
                        'Copied pairing URL.',
                      )}
                    >
                      Copy URL
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
              <MobilePairingQrCode url={mobilePairing.pairingUrl} />
            ) : (
              <span>QR pending</span>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        header={
          <SettingsSectionHeader
            title="Startup behavior"
            description="Control whether Cats Desktop starts when you sign in, whether it opens the main window automatically after sign-in startup, and whether closing the window keeps Cats available in the system tray."
          />
        }
      >
        <SettingsOptionRow
          asChoice
          label="Start Cats Desktop when you sign in to your computer"
          description="Keep Cats Desktop ready in the background as soon as you sign in."
          control={
            <input
              type="checkbox"
              checked={desktopPrefs.startAtLogin}
              disabled={savingDesktopPrefs}
              onChange={() => {
                void updateDesktopPreferences(
                  {
                    ...desktopPrefs,
                    startAtLogin: !desktopPrefs.startAtLogin,
                  },
                  'Failed to update desktop startup preference',
                );
              }}
            />
          }
        />
        <SettingsOptionRow
          asChoice
          label="Keep Cats in the system tray when you close the window"
          description="When enabled, closing the window hides Cats and keeps it running. When disabled, closing the window quits Cats."
          control={
            <input
              type="checkbox"
              checked={desktopPrefs.systemTrayEnabled}
              disabled={savingDesktopPrefs}
              onChange={() => {
                void updateDesktopPreferences(
                  {
                    ...desktopPrefs,
                    systemTrayEnabled: !desktopPrefs.systemTrayEnabled,
                  },
                  'Failed to update system tray preference',
                );
              }}
            />
          }
        />
        <SettingsOptionRow
          asChoice
          label="Open Cats after sign-in startup"
          description="When disabled, Cats can start in the background after you sign in without opening the main window automatically. Opening Cats yourself still shows the app."
          control={
            <input
              type="checkbox"
              checked={desktopPrefs.openWindowOnStartup}
              disabled={savingDesktopPrefs}
              onChange={() => {
                void updateDesktopPreferences(
                  {
                    ...desktopPrefs,
                    openWindowOnStartup: !desktopPrefs.openWindowOnStartup,
                  },
                  'Failed to update startup window preference',
                );
              }}
            />
          }
        />
      </SettingsSection>

      <ToastContainer toasts={toasts} />
    </>
  );
}
