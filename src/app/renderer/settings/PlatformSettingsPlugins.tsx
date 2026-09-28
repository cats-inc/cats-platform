import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog.js';
import { SettingsActionBar, SettingsSection, SettingsSectionHeader } from '../../../design/components/settings/index.js';
import { AGENCY_PLUGIN, type PluginInventory } from '../../../shared/managedPlugins.js';
import { useI18n } from '../i18n/index.js';

export async function pluginRequest<T>(action = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/plugins${action ? `/${action}` : ''}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`);
  return result as T;
}
export function PlatformSettingsPlugins() {
  const { t } = useI18n();
  const [inventory, setInventory] = useState<PluginInventory>();
  const [archive, setArchive] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { dialog, confirm, handleClose } = useConfirmDialog();
  const refresh = useCallback(() => pluginRequest<PluginInventory>().then(setInventory).catch(error => setError(String(error))), []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [refresh]);
  async function act(action: 'install' | 'enable' | 'disable' | 'uninstall') {
    if (!inventory) return;
    setBusy(true); setError('');
    try {
      let current = inventory;
      if (action === 'disable' || action === 'uninstall') {
        current = await pluginRequest<PluginInventory>('impact', {}); setInventory(current);
        const sessions = current.observation?.affectedSessions ?? [];
        const detail = sessions.length ? sessions.join('\n') : t('pluginsNoSessions');
        if (!await confirm({ title: t(action === 'uninstall' ? 'pluginsRemove' : 'pluginsDisable'),
          confirmLabel: t(action === 'uninstall' ? 'pluginsRemove' : 'pluginsDisable'),
          message: `${t('pluginsConfirmRemoval')}\n\n${detail}${current.error ? `\n${t('pluginsOffline')}` : ''}`, defaultAction: 'cancel' })) return;
      }
      const next = await pluginRequest<PluginInventory>(action, {
        revision: current.revision, ...(archive ? { archive } : {}),
        confirmedSessions: current.observation?.affectedSessions ?? [], confirmedRuns: current.observation?.pendingRuns.map(run => run.runId) ?? [],
      });
      setInventory(next); if (action === 'install') setArchive(undefined);
    } catch (error) { setError(String(error)); } finally { setBusy(false); }
  }
  return <>
    <SettingsSection header={<SettingsSectionHeader title={t('pluginsTitle')} description={t('pluginsDescription')} />}>
      {!inventory?.policyEnabled && <p>{t('pluginsPolicyDisabled')}</p>}
      <h3>{AGENCY_PLUGIN.name} · {AGENCY_PLUGIN.version}</h3>
      <p><a href={AGENCY_PLUGIN.source} target="_blank" rel="noreferrer">{t('pluginsSource')}</a> · {AGENCY_PLUGIN.license} · {t('pluginsNoPermissions')}</p>
      <ul>{AGENCY_PLUGIN.skills.map(skill => <li key={skill.id}>{skill.title}</li>)}</ul>
      <p aria-live="polite">{t('pluginsStatus')}: {inventory ? t({ absent: 'pluginsAbsent', installed: 'pluginsInstalled', registering: 'pluginsRegistering', enabled: 'pluginsEnabled', fencing: 'pluginsFencing', 'confirmation-required': 'pluginsConfirmation', 'stop-pending': 'pluginsPending', disabled: 'pluginsDisabled' }[inventory.phase] as 'pluginsAbsent') : t('pluginsLoading')}</p>
      {inventory?.phase === 'enabled' && !inventory.availableSkills.length && <p>{t('pluginsUnavailable')}</p>}
      {inventory?.observation?.pendingRuns.length ? <p>{t('pluginsPendingExplanation')}</p> : null}
      <p>{t('pluginsNewConversation')}</p>
      <Link to="/settings/cats">{t('pluginsChooseCat')}</Link>
      {(error || inventory?.error) && <p role="alert">{error || inventory?.error}</p>}
      <SettingsActionBar>
        {!inventory?.installed ? <>
          <label>{t('pluginsChooseFile')}<input type="file" accept=".catsplugin" disabled={busy || !inventory?.policyEnabled} onChange={event => {
            const file = event.target.files?.[0]; setArchive(undefined); if (!file) return;
            if (file.size !== 40832) { setError(t('pluginsInvalidFile')); return; }
            setBusy(true); setError('');
            void file.arrayBuffer().then(async buffer => {
              const encoded = btoa(String.fromCharCode(...new Uint8Array(buffer)));
              await pluginRequest('inspect', { archive: encoded }); setArchive(encoded);
            }).catch(error => setError(String(error))).finally(() => setBusy(false));
          }} /></label>
          <button className="primaryButton" type="button" disabled={busy || !archive} onClick={() => void act('install')}>{t('pluginsInstall')}</button>
        </> : <>
          <button className="secondaryButton" type="button" disabled={busy || !inventory.policyEnabled || inventory.availableSkills.length > 0 || ['fencing', 'confirmation-required', 'stop-pending'].includes(inventory.phase)} onClick={() => void act('enable')}>{t('pluginsEnable')}</button>
          <button className="secondaryButton" type="button" disabled={busy || !inventory.policyEnabled} onClick={() => void act('disable')}>{t('pluginsDisable')}</button>
          <button className="dangerButton" type="button" disabled={busy || !inventory.policyEnabled} onClick={() => void act('uninstall')}>{t('pluginsRemove')}</button>
        </>}
      </SettingsActionBar>
    </SettingsSection>
    <ConfirmDialog dialog={dialog} onClose={handleClose} />
  </>;
}
