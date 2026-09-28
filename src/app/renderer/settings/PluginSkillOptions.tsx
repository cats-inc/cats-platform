import { useEffect, useState } from 'react';
import type { PluginInventory } from '../../../shared/managedPlugins.js';
import { pluginRequest } from './PlatformSettingsPlugins.js';
import { useI18n } from '../i18n/index.js';

export function PluginSkillOptions({ value, disabled, onChange }: { value?: string | null; disabled: boolean; onChange: (id: string) => void }) {
  const { t } = useI18n();
  const [skills, setSkills] = useState<PluginInventory['availableSkills']>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void pluginRequest<PluginInventory>().then(data => { if (active) setSkills(data.availableSkills); }).catch(() => { if (active) setSkills([]); }); };
    refresh(); const timer = setInterval(refresh, 5000); return () => { active = false; clearInterval(timer); };
  }, []);
  if (!skills.length && !value?.startsWith('plugin:')) return null;
  return <div>
    <div className="skillPills">
    {skills.map(skill => <button type="button" key={skill.id} className={value === skill.id ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'} disabled={disabled} onClick={() => onChange(skill.id)}>{skill.title}</button>)}
    </div>
    {value?.startsWith('plugin:') && !skills.some(skill => skill.id === value) && <p>{t('pluginsUnavailable')}</p>}
    {(skills.length > 0 || value?.startsWith('plugin:')) && <p>{t('pluginsNewConversation')}</p>}
  </div>;
}
