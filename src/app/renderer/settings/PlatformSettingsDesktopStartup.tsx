import { useState } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

export interface PlatformSettingsDesktopStartupProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

function resolveDefaultDesktopPreferences(): AppShellPayload['desktop'] {
  return {
    startAtLogin: true,
    openWindowOnStartup: false,
    systemTrayEnabled: true,
  };
}

export function PlatformSettingsDesktopStartup({
  payload,
  onPayloadUpdate,
}: PlatformSettingsDesktopStartupProps) {
  const [savingDesktopPrefs, setSavingDesktopPrefs] = useState(false);
  const desktopPrefs = payload.desktop ?? resolveDefaultDesktopPreferences();
  const { toasts, showToast } = useToast();

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
    <PlatformSettingsShell
      section="desktop"
      title="Desktop"
      products={payload.products}
    >
      <div className="contentCard">
        <h2>Startup behavior</h2>
        <p className="heroNote">
          Control whether Cats Desktop starts when you sign in, whether it opens
          the main window automatically after sign-in startup, and whether
          closing the window keeps Cats available in the system tray.
        </p>
        <label className="settingsCheckboxRow">
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
          <span className="settingsCheckboxMeta">
            <span className="settingsCheckboxLabel">
              Start Cats Desktop when you sign in to your computer
            </span>
            <span className="heroNote">
              Keep Cats Desktop ready in the background as soon as you sign in.
            </span>
          </span>
        </label>
        <label className="settingsCheckboxRow">
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
          <span className="settingsCheckboxMeta">
            <span className="settingsCheckboxLabel">
              Keep Cats in the system tray when you close the window
            </span>
            <span className="heroNote">
              When enabled, closing the window hides Cats and keeps it running. When disabled, closing the window quits Cats.
            </span>
          </span>
        </label>
        <label className="settingsCheckboxRow">
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
          <span className="settingsCheckboxMeta">
            <span className="settingsCheckboxLabel">
              Open Cats after sign-in startup
            </span>
            <span className="heroNote">
              When disabled, Cats can start in the background after you sign in
              without opening the main window automatically. Opening Cats
              yourself still shows the app.
            </span>
          </span>
        </label>
      </div>

      <ToastContainer toasts={toasts} />
    </PlatformSettingsShell>
  );
}
