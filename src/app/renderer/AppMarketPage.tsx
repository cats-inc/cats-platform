import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog, useConfirmDialog } from '../../design/components/ConfirmDialog.js';
import { ToastContainer, useToast } from '../../design/components/Toast.js';
import type { AppMarketEntry, AppMarketSnapshot } from '../../shared/appMarket.js';
import { isDesktopEnvironment } from '../../shared/desktopRecoveryBridge.js';
import type { MessageInterpolationValues, MessageKey } from '../../shared/i18n/index.js';
import { LOBBY_PATH } from '../../shared/platformRoutePaths.js';
import { appHostRequest } from './appHostRequest.js';
import { useI18n } from './i18n/index.js';
import { dispatchPlatformEnvelopeRefresh } from './platformEnvelopeEvents.js';

export const APP_MARKET_PATH = `${LOBBY_PATH}/market`;

type Translate = (key: MessageKey, values?: MessageInterpolationValues) => string;

const PERMISSION_LABELS: Record<string, MessageKey> = {
  'ui.route': 'appPermissionUiRoute',
  'ui.lobby': 'appPermissionUiLobby',
  'runtime.telemetry.read': 'appPermissionTelemetryRead',
  'runtime.telemetry.refresh': 'appPermissionTelemetryRefresh',
  'media.images': 'appPermissionMediaImages',
  'storage.appData': 'appPermissionStorageAppData',
  'clipboard.write': 'appPermissionClipboardWrite',
};

const NETWORK_ERRORS = new Set(['catalog_unavailable', 'download_failed']);
const UNVERIFIED_ERRORS = new Set(['catalog_untrusted', 'catalog_invalid', 'catalog_unsupported', 'catalog_rollback', 'catalog_mismatch', 'download_rejected']);

export function describeAppPermissions(permissions: readonly string[], t: Translate): string {
  return permissions.map((permission) => (PERMISSION_LABELS[permission] ? t(PERMISSION_LABELS[permission]) : permission)).join(', ');
}

export function describeAppMarketError(error: { code?: string; message?: string } | undefined, t: Translate): string {
  if (error?.code && NETWORK_ERRORS.has(error.code)) return t('appMarketErrorNetwork');
  if (error?.code && UNVERIFIED_ERRORS.has(error.code)) return t('appMarketErrorUnverified');
  if (error?.code === 'app_managed_by_desktop') return t('appMarketManagedByDesktop');
  if (error?.code === 'app_incompatible') return t('appMarketIncompatible');
  if (error?.code === 'catalog_expired') return t('appMarketExpiredNotice');
  if (error?.code === 'catalog_changed') return t('appMarketCatalogChanged');
  return error?.message ?? t('appMarketUnavailable');
}

function actionButton(entry: AppMarketEntry, busy: boolean, canInstall: boolean, t: Translate, onInstall: (entry: AppMarketEntry) => void) {
  if (entry.action === 'install' || entry.action === 'update') {
    return (
      <button type="button" className="primaryButton" disabled={busy || !canInstall} onClick={() => onInstall(entry)}>
        {entry.action === 'install' ? t('appMarketInstall') : t('appMarketUpdate', { version: entry.version })}
      </button>
    );
  }
  const label: Record<typeof entry.action, MessageKey> = {
    installed: 'appMarketInstalled',
    'managed-by-desktop': 'appMarketManagedByDesktop',
    incompatible: 'appMarketIncompatible',
  };
  return <span className="appMarketCardState">{t(label[entry.action])}</span>;
}

export interface AppMarketListProps {
  snapshot: AppMarketSnapshot | null;
  loading: boolean;
  busyAppId: string | null;
  locale: string;
  t: Translate;
  onInstall: (entry: AppMarketEntry) => void;
}

// Presentation only: the container owns requests, confirmation and refresh.
export function AppMarketList({ snapshot, loading, busyAppId, locale, t, onInstall }: AppMarketListProps) {
  if (!snapshot) {
    return <p className="appMarketNotice">{loading ? t('appMarketLoading') : t('appMarketUnavailable')}</p>;
  }
  const canInstall = snapshot.status === 'fresh' || snapshot.status === 'cached';
  const fetchedAt = snapshot.fetchedAt ? new Date(snapshot.fetchedAt).toLocaleString(locale) : '';
  return (
    <>
      {snapshot.status === 'unavailable' ? (
        <p className="appMarketNotice" role="status">{describeAppMarketError(snapshot.error, t)}</p>
      ) : null}
      {snapshot.status === 'cached' ? <p className="appMarketNotice" role="status">{t('appMarketCachedNotice', { time: fetchedAt })}</p> : null}
      {snapshot.status === 'expired' ? <p className="appMarketNotice" role="status">{t('appMarketExpiredNotice')}</p> : null}
      {snapshot.status !== 'unavailable' && snapshot.apps.length === 0 ? <p className="appMarketNotice">{t('appMarketEmpty')}</p> : null}
      <div className="appMarketList">
        {snapshot.apps.map((entry) => (
          <article key={entry.id} className="contentCard appMarketCard" aria-label={entry.displayName}>
            <div className="appMarketCardHeader">
              <div className="appMarketCardTitle">
                <h2>{entry.displayName}</h2>
                <span className="appMarketCardMeta">
                  {t('appMarketVersion', { version: entry.version })}
                  {entry.installedVersion && entry.installedVersion !== entry.version
                    ? ` · ${t('appMarketInstalledVersion', { version: entry.installedVersion })}` : ''}
                  {` · ${t('appMarketPublisher', { publisher: entry.publisher.name })}`}
                </span>
              </div>
              {actionButton(entry, busyAppId !== null, canInstall, t, onInstall)}
            </div>
            {entry.description ? <p className="appMarketCardDescription">{entry.description}</p> : null}
            {entry.notes ? <p className="appMarketCardNotes">{entry.notes}</p> : null}
            <p className="appMarketCardPermissions">{t('appMarketPermissions', { permissions: describeAppPermissions(entry.permissions, t) })}</p>
            {entry.installedWithdrawnReason ? (
              <p className="appMarketNotice" role="status">{t('appMarketInstalledWithdrawn', { reason: entry.installedWithdrawnReason })}</p>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}

export function AppMarketPage({ desktop = isDesktopEnvironment() }: { desktop?: boolean }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { toasts, showToast } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();
  const [snapshot, setSnapshot] = useState<AppMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(desktop);
  const [busyAppId, setBusyAppId] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      const response = await appHostRequest(`/api/apps/_market${refresh ? '?refresh=1' : ''}`, { headers: { Accept: 'application/json' } });
      setSnapshot(response.ok ? await response.json() as AppMarketSnapshot : null);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (desktop) void load(false);
  }, [desktop, load]);

  async function install(entry: AppMarketEntry) {
    const permissions = describeAppPermissions(entry.permissions, t);
    const message = t('appMarketConfirmMessage', { appDisplayName: entry.displayName, version: entry.version, publisher: entry.publisher.name, permissions });
    const confirmed = await confirm({
      title: t(entry.action === 'update' ? 'appMarketConfirmUpdateTitle' : 'appMarketConfirmInstallTitle', { appDisplayName: entry.displayName }),
      // Replacing a sideloaded or development copy is a source change the user must see.
      message: entry.installedSource === 'other'
        ? `${message} ${t('appMarketReplaceLocal', { appDisplayName: entry.displayName, version: entry.installedVersion ?? '' })}`
        : message,
      confirmLabel: entry.action === 'update' ? t('appMarketUpdate', { version: entry.version }) : t('appMarketInstall'),
      defaultAction: 'cancel',
    });
    if (!confirmed) return;
    setBusyAppId(entry.id);
    try {
      const response = await appHostRequest('/api/apps/_market/install', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        // The server installs only if the catalog still offers exactly what was reviewed.
        body: JSON.stringify({ id: entry.id, version: entry.version, permissions: entry.permissions }),
      });
      const result = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      if (!response.ok) {
        showToast(t('appMarketInstallFailed', { appDisplayName: entry.displayName, reason: describeAppMarketError(result?.error, t) }));
      } else {
        showToast(t('appMarketInstallSucceeded', { appDisplayName: entry.displayName, version: entry.version }));
        dispatchPlatformEnvelopeRefresh();
      }
    } catch (error) {
      showToast(t('appMarketInstallFailed', { appDisplayName: entry.displayName, reason: error instanceof Error ? error.message : t('appMarketUnavailable') }));
    } finally {
      setBusyAppId(null);
      await load(false);
    }
  }

  return (
    <div className="screen lobbyScreen">
      <div className="platformLobby appMarket">
        <div className="lobbyTopBar">
          <button type="button" className="secondaryButton" onClick={() => navigate(LOBBY_PATH)}>{t('appMarketBackToHome')}</button>
          {desktop ? (
            <button type="button" className="secondaryButton" disabled={loading || busyAppId !== null} onClick={() => void load(true)}>
              {t('appMarketRefresh')}
            </button>
          ) : null}
        </div>
        <h1 className="appMarketTitle">{t('appMarketTitle')}</h1>
        {desktop
          ? <AppMarketList snapshot={snapshot} loading={loading} busyAppId={busyAppId} locale={locale} t={t} onInstall={(entry) => void install(entry)} />
          : <p className="appMarketNotice">{t('appMarketDesktopOnly')}</p>}
      </div>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
    </div>
  );
}
