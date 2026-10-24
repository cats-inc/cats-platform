import { useEffect, useRef, useState } from 'react';
import { appHostRequest } from '../appHostRequest.js';
import { isDesktopEnvironment } from '../../../shared/desktopRecoveryBridge.js';
import { useI18n } from '../i18n/index.js';
import { SettingsSection, SettingsSectionHeader } from '../../../design/components/settings/index.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';

interface RemoteAccessStatus {
  provider: 'ngrok' | 'external'; state: string; configured: boolean; enabled: boolean;
  url: string | null; configuredOrigin: string; target?: string | null; listenPort: number; legacySources?: string[];
  autoConnect?: boolean; errorCode?: string | null;
  publicVerification?: { state: 'unknown' | 'passed' | 'failed'; observedAt: string | null };
}

export function PlatformSettingsRemoteAccess() {
  const { t } = useI18n();
  const { toasts, showToast } = useToast();
  const [status, setStatus] = useState<RemoteAccessStatus | null>(null);
  const [provider, setProvider] = useState<'ngrok' | 'external'>('ngrok');
  const [origin, setOrigin] = useState('');
  const [port, setPort] = useState('0');
  const [token, setToken] = useState('');
  const [source, setSource] = useState('');
  const [autoConnect, setAutoConnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(0);
  const [error, setError] = useState(false);
  const desktop = isDesktopEnvironment();
  useEffect(() => {
    let disposed = false;
    void appHostRequest('/api/platform/ingress').then(async response => {
      if (!response.ok) throw new Error('Unavailable');
      const result = await response.json();
      if (!disposed) {
        if (!result.remoteAccess) throw new Error('Unavailable');
        const value = result.remoteAccess as RemoteAccessStatus;
        setStatus(value); setProvider(value.provider); setOrigin(value.configuredOrigin); setPort(String(value.listenPort));
        setAutoConnect(value.autoConnect ?? false);
      }
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    let disposed = false;
    const timer = setInterval(() => {
      if (busy || document.hidden) return;
      void appHostRequest('/api/platform/ingress').then(async response => {
        if (!response.ok) return;
        const result = await response.json();
        if (!disposed && result.remoteAccess) setStatus(result.remoteAccess);
      }).catch(() => {});
    }, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, [busy]);
  const save = async (enabled: boolean) => {
    if ((busy && enabled) || !desktop) return;
    const attempt = ++mutation.current;
    setBusy(true); setError(false);
    try {
      const response = await appHostRequest('/api/platform/ingress', { method: 'POST', body: JSON.stringify(enabled ? {
        enabled, autoConnect, provider, ...(!source || origin.trim() ? { publicOrigin: origin.trim() } : {}),
        listenPort: provider === 'ngrok' ? 0 : Number(port),
        ...(token.trim() ? { authtoken: token.trim() } : {}), ...(source ? { migrationSource: source } : {}),
      } : { enabled: false }) });
      if (!response.ok) throw new Error('Unavailable');
      const result = await response.json();
      if (attempt !== mutation.current) return;
      setStatus(result.remoteAccess);
      setOrigin(result.remoteAccess.configuredOrigin);
      if (result.remoteAccess.errorCode) showToast(t(result.remoteAccess.errorCode === 'secure_storage_unavailable'
        ? 'remoteAccessSecureStorage' : 'remoteAccessError'));
      if (status?.configuredOrigin && result.remoteAccess.configuredOrigin !== status.configuredOrigin) showToast(t('remoteAccessOriginChanged'));
    } catch { if (attempt === mutation.current) showToast(t('remoteAccessError')); }
    finally { if (attempt === mutation.current) { setToken(''); setBusy(false); } }
  };
  const stateText = status?.state === 'connected' ? t('remoteAccessConnected')
    : status?.state === 'configured' ? t('remoteAccessConfigured')
      : status?.state === 'migration_required' ? t('remoteAccessMigration')
        : status?.state === 'connecting' ? t('remoteAccessConnecting')
          : status?.state === 'retrying' ? t('remoteAccessRetrying')
            : status?.state === 'cleanup_pending' ? t('remoteAccessCleanupPending')
              : status?.state === 'needs_action' ? t(status.errorCode === 'secure_storage_unavailable'
                ? 'remoteAccessSecureStorage' : 'remoteAccessNeedsAction') : t('remoteAccessDisconnected');
  return <SettingsSection header={<SettingsSectionHeader title={t('remoteAccessTitle')} description={t('remoteAccessDescription')} />}>
    <ToastContainer toasts={toasts} />
    {error ? <p role="alert">{t('remoteAccessError')}</p> : null}
    {!desktop ? <p>{t('remoteAccessDesktopOnly')}</p> : null}
    <p role="status">{busy ? t('remoteAccessConnecting') : stateText}</p>
    {status?.url && status.publicVerification?.state !== 'passed' ? <p>{t('remoteAccessPublicUnknown')}</p> : null}
    {status?.url ? <p><strong>{t('remoteAccessPublicUrl')}</strong><br /><code>{status.url}</code></p> : null}
    {status?.target && provider === 'external' ? <p>{t('remoteAccessTarget')}<br /><code>{status.target}</code></p> : null}
    <fieldset disabled={!desktop || busy} style={{ border: 0, padding: 0, display: 'grid', gap: 16, maxWidth: 600 }}>
      {status?.legacySources?.length ? <label>{t('remoteAccessMigration')}
        <select value={source} onChange={event => setSource(event.target.value)}>
          <option value="">{t('remoteAccessSelect')}</option>
          {status.legacySources.map(appId => <option key={appId} value={appId}>{appId}</option>)}
        </select>
      </label> : null}
      <label>{t('remoteAccessProvider')}
        <select value={provider} onChange={event => setProvider(event.target.value as 'ngrok' | 'external')}>
          <option value="ngrok">ngrok</option><option value="external">{t('remoteAccessExternal')}</option>
        </select>
      </label>
      {provider === 'ngrok' ? <label>{t('remoteAccessToken')}
        <input type="password" autoComplete="off" value={token} maxLength={512} onChange={event => setToken(event.target.value)}
          placeholder={status?.provider === 'ngrok' && status.configured ? t('remoteAccessTokenSaved') : 'ngrok authtoken'} />
      </label> : <label>{t('remoteAccessPort')}
        <input type="number" min={1} max={65535} value={port} onChange={event => setPort(event.target.value)} />
      </label>}
      <label><input type="checkbox" checked={autoConnect} onChange={event => setAutoConnect(event.target.checked)} /> {t('remoteAccessAutoConnect')}</label>
      <details><summary>{t('remoteAccessAdvanced')}</summary>
      <label>{t(provider === 'ngrok' ? 'remoteAccessOptionalOrigin' : 'remoteAccessPublicUrl')}
        <input type="url" value={origin} maxLength={2048} placeholder="https://cats.example" onChange={event => setOrigin(event.target.value)} />
      </label>
      </details>
      <p>{t(provider === 'ngrok' ? 'remoteAccessTokenNote' : 'remoteAccessExternalNote')}</p>
    </fieldset>
    <div className="settingsActionBar">
      <button type="button" className="primaryButton" onClick={() => void save(true)} disabled={!desktop || busy}>{t(status?.enabled ? 'remoteAccessReconnect' : 'remoteAccessEnable')}</button>
      <button type="button" className="secondaryButton" onClick={() => void save(false)} disabled={!desktop || (!status?.enabled && !busy && status?.state !== 'cleanup_pending')}>{t('remoteAccessDisable')}</button>
    </div>
  </SettingsSection>;
}
