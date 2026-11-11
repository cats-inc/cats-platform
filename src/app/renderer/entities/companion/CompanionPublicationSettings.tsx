import { useEffect, useState } from 'react';
import type { CompanionMediaSettings } from '../../../../products/chat/companion/contracts.js';
import { companionPublicationRequest } from '../../../../products/chat/renderer/api/companion.js';
import { useI18n } from '../../i18n/useI18n.js';
import { messageKeys as keys } from '../../../../shared/i18n/index.js';

export function CompanionPublicationSettings({ catId }: { catId: string }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<CompanionMediaSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSettings(null);
    void companionPublicationRequest<{ settings: CompanionMediaSettings }>(catId, 'media-settings')
      .then(result => { if (active) setSettings(result.settings); }).catch(() => { if (active) setNotice(t(keys.postActionFailed)); });
    return () => { active = false; };
  }, [catId, t]);
  async function save() {
    if (!settings) return;
    setSaving(true); setNotice(null);
    try {
      const { catId: _catId, updatedAt: _updatedAt, ...patch } = settings;
      const result = await companionPublicationRequest<{ settings: CompanionMediaSettings }>(catId, 'media-settings', 'PATCH', patch);
      setSettings(result.settings); setNotice(t(keys.postSettingsSaved));
    } catch { setNotice(t(keys.postActionFailed)); }
    finally { setSaving(false); }
  }
  return <section className="companionCard companionPublicationSettings">
    <h3 className="companionCardHeader">{t(keys.postSettingsTitle)}</h3>
    {settings && <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
      <label><input type="checkbox" checked={settings.useProfileImages} onChange={event => setSettings({ ...settings, useProfileImages: event.target.checked })} />{t(keys.postUseProfileImages)}</label>
      <label><input type="checkbox" checked={settings.autoPost} onChange={event => setSettings({ ...settings, autoPost: event.target.checked })} />{t(keys.postAutomatic)}</label>
      <p className="companionHint">{t(keys.postAutomaticHint)}</p>
      <label><input type="checkbox" checked={settings.autoShare} onChange={event => setSettings({ ...settings, autoShare: event.target.checked })} />{t(keys.postAutomaticShare)}</label>
      <p className="companionHint">{t(keys.postShareHint)}</p>
      {(['dm', 'telegram'] as const).map(destination => <label key={destination}>
        <input type="checkbox" checked={settings.notify.includes(destination)} onChange={event => setSettings({ ...settings,
          notify: event.target.checked ? [...settings.notify, destination] : settings.notify.filter(row => row !== destination) })} />
        {t(destination === 'dm' ? keys.postNotifyDm : keys.postNotifyTelegram)}
      </label>)}
      <label>{t(keys.postDailyLimit)}<input type="number" min={1} max={20} value={settings.dailyLimit} onChange={event => setSettings({ ...settings, dailyLimit: Number(event.target.value) })} /></label>
      <label>{t(keys.postInterval)}<input type="number" min={1} max={10080} value={settings.intervalMinutes} onChange={event => setSettings({ ...settings, intervalMinutes: Number(event.target.value) })} /></label>
      <button type="button" className="companionActionButton companionActionButtonPrimary" onClick={() => void save()}>{t(keys.postSave)}</button>
    </fieldset>}
    {notice && <p role="status" className="companionHint">{notice}</p>}
  </section>;
}
