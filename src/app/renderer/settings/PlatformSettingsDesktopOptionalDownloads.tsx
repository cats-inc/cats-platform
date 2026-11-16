import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  SettingsActionBar,
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import type { ShowToast } from '../../../design/components/Toast.js';
import { resolveDesktopHostBridge } from '../../../shared/desktopRecoveryBridge.js';
import type {
  FeaturePackBridge,
  FeaturePackSnapshot,
  FeaturePackStatus,
} from '../../../shared/featurePackBridge.js';
import {
  featurePackPercent,
  formatFeaturePackSize,
  LINUX_STT_PACK_ID,
  OPTIONAL_DOWNLOADS_SECTION_ID,
  resolveFeaturePackFailureMessage,
} from '../../../shared/featurePackLabels.js';
import type { MessageKey } from '../../../shared/i18n/index.js';
import { useI18n } from '../i18n/index.js';

type PackAction =
  | 'download'
  | 'update'
  | 'resume'
  | 'pause'
  | 'cancel'
  | 'discard'
  | 'check'
  | 'remove';

/** SPEC-145 FR-C2's actions by status; the first is the primary one where it starts a transfer. */
export const OPTIONAL_DOWNLOAD_ACTIONS: Record<FeaturePackStatus, PackAction[]> = {
  not_installed: ['download'],
  downloading: ['pause', 'cancel'],
  verifying: ['pause', 'cancel'],
  paused: ['resume', 'discard'],
  installed: ['check', 'remove'],
  update_available: ['update', 'check', 'remove'],
  update_required: ['download', 'remove'],
  damaged: ['download', 'remove'],
  unsupported: [],
};

const PRIMARY_ACTIONS = new Set<PackAction>(['download', 'update', 'resume']);

const ACTION_LABELS: Record<PackAction, MessageKey> = {
  download: 'settingsDesktopOptionalDownloadsActionDownload',
  update: 'settingsDesktopOptionalDownloadsActionUpdate',
  resume: 'settingsDesktopOptionalDownloadsActionResume',
  pause: 'settingsDesktopOptionalDownloadsActionPause',
  cancel: 'settingsDesktopOptionalDownloadsActionCancel',
  discard: 'settingsDesktopOptionalDownloadsActionDiscard',
  check: 'settingsDesktopOptionalDownloadsActionCheck',
  remove: 'settingsDesktopOptionalDownloadsActionRemove',
};

const PAUSE_REASON_LABELS: Record<NonNullable<FeaturePackSnapshot['pauseReason']>, MessageKey> = {
  owner: 'settingsDesktopOptionalDownloadsPausedOwner',
  network: 'settingsDesktopOptionalDownloadsPausedNetwork',
  quit: 'settingsDesktopOptionalDownloadsPausedQuit',
};

const PROGRESS_STATUSES = new Set<FeaturePackStatus>(['downloading', 'verifying', 'paused']);

type Translate = ReturnType<typeof useI18n>['t'];

function runAction(packs: FeaturePackBridge, action: PackAction, id: string): Promise<unknown> {
  switch (action) {
    case 'download':
    case 'update':
      return packs.download(id);
    case 'resume':
      return packs.resume(id);
    case 'pause':
      return packs.pause(id);
    case 'cancel':
    case 'discard':
      return packs.cancel(id);
    case 'check':
      return packs.check(id);
    case 'remove':
      return packs.remove(id);
  }
}

function statusText(snapshot: FeaturePackSnapshot, t: Translate): string {
  const received = formatFeaturePackSize(snapshot.receivedBytes ?? 0);
  const total = formatFeaturePackSize(snapshot.downloadSize);
  switch (snapshot.status) {
    case 'not_installed':
      return t('settingsDesktopOptionalDownloadsStatusNotInstalled');
    case 'downloading':
      return t('settingsDesktopOptionalDownloadsStatusDownloading', { received, total });
    case 'verifying':
      return t('settingsDesktopOptionalDownloadsStatusVerifying');
    case 'paused':
      return t('settingsDesktopOptionalDownloadsStatusPaused', { received, total });
    case 'installed':
      return t('settingsDesktopOptionalDownloadsStatusInstalled', {
        version: snapshot.activeVersion ?? snapshot.version,
        size: formatFeaturePackSize(snapshot.installedSize ?? 0),
      });
    case 'update_available':
      return t('settingsDesktopOptionalDownloadsStatusUpdateAvailable', {
        version: snapshot.activeVersion ?? '',
        next: snapshot.version,
      });
    case 'update_required':
      return t('settingsDesktopOptionalDownloadsStatusUpdateRequired');
    case 'damaged':
      return t('settingsDesktopOptionalDownloadsStatusDamaged');
    case 'unsupported':
      return snapshot.unsupported?.reason === 'prerequisite'
        ? t('settingsDesktopOptionalDownloadsStatusNeedsLibrary', {
          library: snapshot.unsupported.detail,
        })
        : t('settingsDesktopOptionalDownloadsStatusNeedsGlibc', {
          version: snapshot.unsupported?.detail ?? '',
        });
  }
}

/**
 * What the live region says. Progress is announced in 10 % steps; the visible
 * text keeps its full rate, but a screen reader is not read 200 updates.
 */
function announcement(snapshot: FeaturePackSnapshot, t: Translate): string {
  if (snapshot.status === 'downloading') {
    const percent = Math.floor(featurePackPercent(snapshot) / 10) * 10;
    return t('settingsDesktopOptionalDownloadsAnnounceDownloading', { percent });
  }
  return statusText(snapshot, t);
}

function packTitle(id: string, t: Translate): string {
  return id === LINUX_STT_PACK_ID ? t('settingsDesktopOptionalDownloadsSpeechTitle') : id;
}

export interface PlatformSettingsDesktopOptionalDownloadsProps {
  showToast: ShowToast;
}

/**
 * `Optional downloads` for `Settings > Desktop` (SPEC-145 FR-C2). Each row is
 * the consent surface for one pack: what it enables, its size and source, its
 * licenses, and that audio stays on the computer. Every outcome is a toast or
 * the row itself; nothing is written inline (AGENTS.md Settings UI rules).
 */
export function PlatformSettingsDesktopOptionalDownloads({
  showToast,
}: PlatformSettingsDesktopOptionalDownloadsProps) {
  const { t } = useI18n();
  const packs = useMemo(() => resolveDesktopHostBridge()?.featurePacks ?? null, []);
  const [snapshots, setSnapshots] = useState<FeaturePackSnapshot[]>([]);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  // A Check files failure means damaged files, not a rejected download.
  const checkingIds = useRef(new Set<string>());
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!packs) {
      return undefined;
    }
    let active = true;
    const unsubscribe = packs.onChange((change) => {
      if (!active) {
        return;
      }
      setSnapshots((current) => {
        const index = current.findIndex((snapshot) => snapshot.id === change.snapshot.id);
        if (index < 0) {
          return [...current, change.snapshot];
        }
        const next = [...current];
        next[index] = change.snapshot;
        return next;
      });
      if (change.failure) {
        showToast(resolveFeaturePackFailureMessage(change.failure, tRef.current, {
          checking: checkingIds.current.has(change.snapshot.id),
        }));
      }
    });
    packs.list().then((list) => {
      if (active) {
        setSnapshots(list);
      }
    }, () => {
      if (active) {
        showToast(tRef.current('settingsDesktopOptionalDownloadsLoadFailed'));
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [packs, showToast]);

  // `#optional-downloads` from the composer toast (FR-C1). The section renders
  // before the list arrives, so the target exists on the first pass.
  useEffect(() => {
    if (!packs || typeof window === 'undefined') {
      return;
    }
    if (window.location.hash === `#${OPTIONAL_DOWNLOADS_SECTION_ID}`) {
      document.getElementById(OPTIONAL_DOWNLOADS_SECTION_ID)?.scrollIntoView?.({ block: 'start' });
    }
  }, [packs]);

  const perform = useCallback(async (action: PackAction, id: string) => {
    if (!packs) {
      return;
    }
    setBusyIds((current) => new Set(current).add(id));
    if (action === 'check') {
      checkingIds.current.add(id);
    }
    try {
      await runAction(packs, action, id);
    } catch {
      // Host failures with a stage arrive as change events; this is the bridge itself.
      showToast(tRef.current('settingsDesktopOptionalDownloadsFailureGeneric'));
    } finally {
      checkingIds.current.delete(id);
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, [packs, showToast]);

  if (!packs) {
    return null;
  }

  return (
    <SettingsSection
      id={OPTIONAL_DOWNLOADS_SECTION_ID}
      className="settingsOptionalDownloads"
      header={(
        <SettingsSectionHeader
          title={t('settingsDesktopOptionalDownloadsTitle')}
          description={t('settingsDesktopOptionalDownloadsDescription')}
        />
      )}
    >
      {snapshots.map((snapshot) => {
        const actions = OPTIONAL_DOWNLOAD_ACTIONS[snapshot.status];
        const busy = busyIds.has(snapshot.id);
        const percent = featurePackPercent(snapshot);
        const licenses = snapshot.licenses
          .map((license) => `${license.name} (${license.component})`)
          .join(', ');
        return (
          <SettingsOptionRow
            key={snapshot.id}
            layout="stack"
            className="settingsOptionalDownload"
            label={packTitle(snapshot.id, t)}
            description={(
              <>
                {snapshot.id === LINUX_STT_PACK_ID
                  ? (
                    <span className="settingsOptionalDownloadLine">
                      {t('settingsDesktopOptionalDownloadsSpeechDescription')}
                    </span>
                  )
                  : null}
                <span className="settingsOptionalDownloadLine">
                  {t('settingsDesktopOptionalDownloadsSource', {
                    size: formatFeaturePackSize(snapshot.downloadSize),
                    host: snapshot.sourceHost,
                  })}
                </span>
                {licenses
                  ? (
                    <span className="settingsOptionalDownloadLine">
                      {t('settingsDesktopOptionalDownloadsLicenses', { licenses })}
                    </span>
                  )
                  : null}
              </>
            )}
            control={(
              <div className="settingsOptionalDownloadState" data-status={snapshot.status}>
                <span className="settingsFactValue">{statusText(snapshot, t)}</span>
                {snapshot.status === 'paused' && snapshot.pauseReason
                  ? <span className="heroNote">{t(PAUSE_REASON_LABELS[snapshot.pauseReason])}</span>
                  : null}
                {PROGRESS_STATUSES.has(snapshot.status)
                  ? (
                    <progress className="settingsUpdateProgress" max={100} value={percent}>
                      {percent}
                      %
                    </progress>
                  )
                  : null}
                <span className="settingsVisuallyHidden" aria-live="polite">
                  {announcement(snapshot, t)}
                </span>
                {actions.length > 0
                  ? (
                    <SettingsActionBar>
                      {actions.map((action) => (
                        <button
                          key={action}
                          type="button"
                          className={PRIMARY_ACTIONS.has(action)
                            ? 'settingsPrimaryAction'
                            : 'secondaryButton'}
                          disabled={busy}
                          onClick={() => {
                            void perform(action, snapshot.id);
                          }}
                        >
                          {t(ACTION_LABELS[action])}
                        </button>
                      ))}
                    </SettingsActionBar>
                  )
                  : null}
              </div>
            )}
          />
        );
      })}
    </SettingsSection>
  );
}
