import { useCallback, useEffect, useState } from 'react';

import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStatusChip,
} from '../../../design/components/settings/index.js';
import {
  resolveDesktopHostBridge,
  type DesktopUpdateSnapshot,
} from '../../../shared/desktopRecoveryBridge.js';
import { useI18n } from '../i18n/index.js';
import {
  formatDesktopUpdateProgressPercent,
  isDesktopPreviewBuild,
  resolveDesktopUpdateErrorMessageKey,
  resolveDesktopUpdatePrimaryAction,
  resolveDesktopUpdateStatusMessageKey,
  resolveDesktopUpdateStatusTone,
  resolveDesktopUpdateInstallNoticeKey,
} from './settingsDesktopUpdateLabels.js';

export interface PlatformSettingsDesktopUpdatesProps {
  /** Injected in tests; defaults to the real preload bridge. */
  showToast: (message: string) => void;
  platform?: string;
}

/**
 * `App updates` section for `Settings > Desktop`.
 *
 * The host owns the update lifecycle; this surface renders a snapshot and
 * requests bounded actions. It never chooses a feed, a URL, or an installer
 * argument.
 *
 * The installed version is shown for every desktop build, because Cats has no
 * About surface and this is the only place a user can read it. Update controls
 * remain capability-gated, so a development or unofficial build sees its
 * version and an explanation rather than an action it cannot perform.
 */
export function PlatformSettingsDesktopUpdates({
  showToast,
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
}: PlatformSettingsDesktopUpdatesProps) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<DesktopUpdateSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = resolveDesktopHostBridge();
    if (!bridge?.getUpdateSnapshot) {
      return undefined;
    }

    let active = true;
    void bridge.getUpdateSnapshot().then((next) => {
      if (active) {
        setSnapshot(next);
      }
    }).catch(() => {
      // A bridge failure leaves the section hidden rather than asserting a
      // state the host never reported.
    });

    const unsubscribe = bridge.onUpdateSnapshot?.((next) => {
      if (active) {
        setSnapshot(next);
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const runAction = useCallback(async (
    action: 'check' | 'download' | 'restart_install',
  ) => {
    const bridge = resolveDesktopHostBridge();
    if (!bridge) {
      return;
    }

    setBusy(true);
    try {
      if (action === 'restart_install') {
        await bridge.restartAndInstall?.();
        return;
      }

      const next = action === 'check'
        ? await bridge.checkForUpdates?.()
        : await bridge.downloadUpdate?.();

      if (!next) {
        return;
      }
      setSnapshot(next);

      // Settings feedback goes through the shared toast system; a manual
      // up-to-date result is otherwise invisible because nothing changes.
      if (action === 'check' && next.status === 'up_to_date') {
        showToast(t('settingsDesktopUpdatesToastUpToDate'));
      }
      if (next.error) {
        showToast(t(resolveDesktopUpdateErrorMessageKey(next.error.code)));
      }
    } finally {
      setBusy(false);
    }
  }, [showToast, t]);

  if (snapshot === null) {
    return null;
  }

  const { capability } = snapshot;
  const primaryAction = resolveDesktopUpdatePrimaryAction(snapshot);
  const installNoticeKey = resolveDesktopUpdateInstallNoticeKey(snapshot, platform);
  const progressPercent = formatDesktopUpdateProgressPercent(snapshot);

  return (
    <SettingsSection
      className="settingsDesktopUpdates"
      header={(
        <SettingsSectionHeader
          title={t('settingsDesktopUpdatesTitle')}
          description={t('settingsDesktopUpdatesDescription')}
          status={capability.canCheck ? (
            <SettingsStatusChip tone={resolveDesktopUpdateStatusTone(snapshot.status)}>
              {t(resolveDesktopUpdateStatusMessageKey(snapshot.status))}
            </SettingsStatusChip>
          ) : undefined}
        />
      )}
    >
      <SettingsOptionRow
        label={t('settingsDesktopUpdatesCurrentVersionLabel')}
        control={<span className="settingsFactValue">{snapshot.currentVersion}</span>}
      />
      <SettingsOptionRow
        label={t('settingsDesktopUpdatesChannelLabel')}
        control={<span className="settingsFactValue">{capability.channel}</span>}
      />

      {isDesktopPreviewBuild(snapshot) && (
        <SettingsOptionRow
          layout="stack"
          label={t('settingsDesktopUpdatesPreviewNotice')}
          control={null}
        />
      )}

      {capability.canCheck && (
        <>
          <SettingsOptionRow
            label={t('settingsDesktopUpdatesLastCheckedLabel')}
            control={(
              <span className="settingsFactValue">
                {snapshot.lastCheckedAt
                  ? new Date(snapshot.lastCheckedAt).toLocaleString()
                  : t('settingsDesktopUpdatesLastCheckedNever')}
              </span>
            )}
          />

          {snapshot.availableVersion !== null && (
            <SettingsOptionRow
              label={t('settingsDesktopUpdatesAvailableVersionLabel')}
              description={snapshot.releaseSummary ?? undefined}
              control={<span className="settingsFactValue">{snapshot.availableVersion}</span>}
            />
          )}

          {progressPercent !== null && (
            <SettingsOptionRow
              label={t('settingsDesktopUpdatesStatusDownloading')}
              control={(
                <progress
                  className="settingsUpdateProgress"
                  max={100}
                  value={progressPercent}
                >
                  {progressPercent}
                  %
                </progress>
              )}
            />
          )}

          {installNoticeKey !== null && (
            <SettingsOptionRow
              layout="stack"
              label={t(installNoticeKey)}
              control={null}
            />
          )}

          {primaryAction !== null && (
            <SettingsOptionRow
              label=""
              control={(
                <button
                  type="button"
                  className="settingsPrimaryAction"
                  disabled={primaryAction.disabled || busy}
                  onClick={() => {
                    if (primaryAction.action !== 'none') {
                      void runAction(primaryAction.action);
                    }
                  }}
                >
                  {t(primaryAction.messageKey)}
                </button>
              )}
            />
          )}
        </>
      )}
    </SettingsSection>
  );
}
