import { useEffect, useState } from 'react';
import type { PluginInventory } from '../../../shared/managedPlugins.js';
import { pluginRequest } from './PlatformSettingsPlugins.js';
import { useI18n } from '../i18n/index.js';

export function PluginSkillOptions({ value, provider, disabled, onChange }: { value?: string | null; provider: string; disabled: boolean; onChange: (id: string) => void }) {
  const { t } = useI18n();
  const [inventory, setInventory] = useState<PluginInventory>();
  useEffect(() => {
    let active = true;
    const refresh = () => { void pluginRequest<PluginInventory>().then(data => { if (active) setInventory(data); }).catch(() => { if (active) setInventory(undefined); }); };
    refresh(); const timer = setInterval(refresh, 5000); return () => { active = false; clearInterval(timer); };
  }, []);
  if (!inventory?.installed) return null;
  if (!['codex', 'claude'].includes(provider)) return <p>{t('pluginsSupportedProviders')}</p>;
  const skills = inventory.availableSkills;
  return <div>
    <div className="skillPills">
    {skills.map(skill => <button type="button" key={skill.id} aria-pressed={value === skill.id} className={value === skill.id ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'} disabled={disabled} onClick={() => onChange(value === skill.id ? 'chat-default' : skill.id)}>{skill.title}</button>)}
    </div>
    {value?.startsWith('plugin:') && !skills.some(skill => skill.id === value) && <p>{t('pluginsUnavailable')}</p>}
    {(skills.length > 0 || value?.startsWith('plugin:')) && <p>{t('pluginsNewConversation')}</p>}
  </div>;
}
