import { useEffect, useRef } from 'react';

import { catInitials } from '../workspaceChatUtils.js';
import { buildExecutionTargetSummary } from './ExecutionTarget.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import {
  getCatMcpProfileLabel,
  getCatSkillProfileLabel,
} from './settings-cats/viewSupport.js';

export interface CatInspectTarget {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarUrl?: string | null;
  provider: string;
  instance: string | null;
  model: string | null;
  skillProfile: string | null;
  mcpProfile?: string | null;
  isBoss: boolean;
}

export interface CatInspectPanelProps {
  cat: CatInspectTarget;
  onClose: () => void;
}

export function CatInspectPanel({ cat, onClose }: CatInspectPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    function onClickOutside(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  const executionSummary = buildExecutionTargetSummary({
    provider: cat.provider,
    instance: cat.instance,
    model: cat.model,
    modelSelection: null,
  });
  const skillProfileLabel = cat.skillProfile
    ? getCatSkillProfileLabel(cat.skillProfile)
    : null;
  const mcpProfileLabel = getCatMcpProfileLabel(cat.mcpProfile);

  return (
    <div className="catInspectPanel" ref={panelRef}>
      <div className="catInspectPanelHeader">
        <strong>{t('sharedCatInspectTitle')}</strong>
        <button
          type="button"
          className="chromeButton"
          onClick={onClose}
          aria-label={t('sharedCatInspectClose')}
        >
          &times;
        </button>
      </div>
      <div className="catInspectPanelBody">
        <div className="catInspectIdentity">
          <div
            className={cat.isBoss ? 'catAvatar catAvatarBoss catInspectAvatar' : 'catAvatar catInspectAvatar'}
            style={cat.avatarUrl
              ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : cat.avatarColor ? { background: cat.avatarColor } : undefined}
          >
            {cat.avatarUrl ? null : catInitials(cat.name)}
          </div>
          <div>
            <strong>{cat.name}</strong>
            {cat.isBoss ? <span className="catInspectBadge">{t('sharedCatInspectBossLabel')}</span> : null}
          </div>
        </div>

        <div className="catInspectField">
          <span className="catInspectFieldLabel">{t('sharedCatInspectProviderLabel')}</span>
          <span>{executionSummary.providerLabel}</span>
        </div>

        {executionSummary.instanceLabel ? (
          <div className="catInspectField">
            <span className="catInspectFieldLabel">{t('sharedCatInspectInstanceLabel')}</span>
            <span>{executionSummary.instanceLabel}</span>
          </div>
        ) : null}

        <div className="catInspectField">
          <span className="catInspectFieldLabel">{t('sharedCatInspectModelLabel')}</span>
          <span>{executionSummary.modelLabel}</span>
        </div>

        {cat.skillProfile ? (
          <div className="catInspectField">
            <span className="catInspectFieldLabel">{t('sharedCatInspectSkillProfileLabel')}</span>
            <span>
              {skillProfileLabel ? t(skillProfileLabel) : cat.skillProfile}
            </span>
          </div>
        ) : null}

        <div className="catInspectField">
          <span className="catInspectFieldLabel">{t(messageKeys.sharedSettingsCatsMcpProfileLabel)}</span>
          <span>{mcpProfileLabel ? t(mcpProfileLabel) : cat.mcpProfile}</span>
        </div>

        <p className="catInspectNote">
          {t('sharedCatInspectSharedPresetDescription')}
        </p>
      </div>
    </div>
  );
}
