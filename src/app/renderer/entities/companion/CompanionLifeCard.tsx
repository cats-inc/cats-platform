import { useEffect, useState } from 'react';

import type {
  CompanionLifeProfile,
  UpdateCompanionLifeProfileInput,
} from '../../../../products/chat/companion/contracts.js';
import { CompanionLifeUpdateError } from '../../../../products/chat/renderer/api/companion.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../i18n/useI18n.js';

export interface CompanionLifeCardProps {
  catName: string;
  life: CompanionLifeProfile;
  onSave: (input: UpdateCompanionLifeProfileInput) => Promise<void>;
}

interface LifeDraft {
  enabled: boolean;
  bedtime: string;
  wakeWindowStart: string;
  wakeWindowEnd: string;
  photoFolder: string;
}

function toDraft(life: CompanionLifeProfile): LifeDraft {
  return {
    enabled: life.enabled,
    bedtime: life.bedtime,
    wakeWindowStart: life.wakeWindowStart,
    wakeWindowEnd: life.wakeWindowEnd,
    photoFolder: life.photoFolder ?? '',
  };
}

/** SPEC-124: the rhythm the life loop follows and the folder heartbeats pick photos from. */
export function CompanionLifeCard({ catName, life, onSave }: CompanionLifeCardProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<LifeDraft>(() => toDraft(life));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(life));
  }, [life]);

  const saved = toDraft(life);
  const dirty = (Object.keys(draft) as Array<keyof LifeDraft>).some((key) => draft[key] !== saved[key]);
  const update = <K extends keyof LifeDraft>(key: K, value: LifeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        enabled: draft.enabled,
        bedtime: draft.bedtime,
        wakeWindowStart: draft.wakeWindowStart,
        wakeWindowEnd: draft.wakeWindowEnd,
        photoFolder: draft.photoFolder.trim() || null,
      });
    } catch (saveError) {
      const code = saveError instanceof CompanionLifeUpdateError ? saveError.code : null;
      if (code === 'companion_photo_folder_not_found' || code === 'invalid_companion_photo_folder') {
        setError(t(messageKeys.chatCompanionLifeFolderNotFound));
      } else if (code?.startsWith('invalid_companion_life')) {
        setError(t(messageKeys.chatCompanionLifeInvalid));
      } else {
        setError(t(messageKeys.chatCompanionLifeSaveError, {
          error: saveError instanceof Error ? saveError.message : String(saveError),
        }));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="companionCard">
      <div className="companionCardHeader">{t(messageKeys.chatCompanionLifeTitle)}</div>

      <div className="companionFormRow">
        <label className="companionLabel">{t(messageKeys.chatCompanionLifeEnabledLabel)}</label>
        <div className="companionPillGroup">
          <button
            type="button"
            className={`companionPill ${draft.enabled ? 'isActive' : ''}`}
            aria-pressed={draft.enabled}
            onClick={() => update('enabled', true)}
            disabled={saving}
          >
            {t(messageKeys.chatCompanionLifeEnabledOn)}
          </button>
          <button
            type="button"
            className={`companionPill ${draft.enabled ? '' : 'isActive'}`}
            aria-pressed={!draft.enabled}
            onClick={() => update('enabled', false)}
            disabled={saving}
          >
            {t(messageKeys.chatCompanionLifeEnabledOff)}
          </button>
        </div>
      </div>

      <div className="companionFormRow">
        <label className="companionLabel" htmlFor="companion-life-bedtime">
          {t(messageKeys.chatCompanionLifeBedtimeLabel)}
        </label>
        <input
          id="companion-life-bedtime"
          type="time"
          className="companionInput"
          value={draft.bedtime}
          onChange={(event) => update('bedtime', event.target.value)}
          disabled={saving}
        />
      </div>

      <div className="companionFormRow">
        <label className="companionLabel" htmlFor="companion-life-wake-start">
          {t(messageKeys.chatCompanionLifeWakeWindowLabel)}
        </label>
        <div className="companionTimeRange">
          <input
            id="companion-life-wake-start"
            type="time"
            className="companionInput"
            value={draft.wakeWindowStart}
            onChange={(event) => update('wakeWindowStart', event.target.value)}
            disabled={saving}
          />
          <span className="companionMuted">{t(messageKeys.chatCompanionLifeWakeWindowSeparator)}</span>
          <input
            aria-label={t(messageKeys.chatCompanionLifeWakeWindowLabel)}
            type="time"
            className="companionInput"
            value={draft.wakeWindowEnd}
            onChange={(event) => update('wakeWindowEnd', event.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <div className="companionFormRow">
        <label className="companionLabel" htmlFor="companion-life-photo-folder">
          {t(messageKeys.chatCompanionLifePhotoFolderLabel)}
        </label>
        <input
          id="companion-life-photo-folder"
          type="text"
          className="companionInput"
          placeholder={t(messageKeys.chatCompanionLifePhotoFolderPlaceholder)}
          value={draft.photoFolder}
          onChange={(event) => update('photoFolder', event.target.value)}
          disabled={saving}
        />
        <span className="companionMuted">
          {t(messageKeys.chatCompanionLifePhotoFolderHint, { name: catName })}
        </span>
      </div>

      {error ? <div className="companionError" role="alert">{error}</div> : null}

      <button
        type="button"
        className="companionActionButton"
        onClick={handleSave}
        disabled={saving || !dirty}
      >
        {saving ? t(messageKeys.chatCompanionLifeSaving) : t(messageKeys.chatCompanionLifeSave)}
      </button>
    </div>
  );
}
