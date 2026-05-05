import { useState } from 'react';
import { Link } from 'react-router-dom';

import type {
  CompanionExpressionMode,
  CompanionOutputMode,
  CompanionResponseProfile,
  UpdateCompanionResponseProfileInput,
} from '../../../../products/chat/companion/contracts.js';
import type { AppShellPayload } from '../../../../products/chat/api/contracts.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../i18n/useI18n.js';

export interface CompanionSettingsSectionProps {
  catId: string;
  responseProfile: CompanionResponseProfile | null;
  payload: AppShellPayload;
  loading: boolean;
  onUpdateResponseProfile: (input: UpdateCompanionResponseProfileInput) => Promise<void>;
}

const EXPRESSION_MODES: readonly { value: CompanionExpressionMode; label: string }[] = [
  { value: 'animalistic', label: 'animalistic' },
  { value: 'anthropomorphic', label: 'anthropomorphic' },
  { value: 'mixed', label: 'mixed' },
];

const OUTPUT_MODES: readonly { value: CompanionOutputMode; label: string }[] = [
  { value: 'text', label: 'text' },
  { value: 'audio_clip', label: 'audio_clip' },
  { value: 'tts', label: 'tts' },
  { value: 'mixed', label: 'mixed' },
];

export function CompanionSettingsSection({
  catId,
  responseProfile,
  payload,
  loading,
  onUpdateResponseProfile,
}: CompanionSettingsSectionProps) {
  const [notes, setNotes] = useState(responseProfile?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const expressionModeLabelMap: Record<string, string> = {
    animalistic: t(messageKeys.chatCompanionSettingsExpressionModeAnimalistic),
    anthropomorphic: t(messageKeys.chatCompanionSettingsExpressionModeAnthropomorphic),
    mixed: t(messageKeys.chatCompanionSettingsExpressionModeMixed),
  };
  const outputModeLabelMap: Record<string, string> = {
    text: t(messageKeys.chatCompanionSettingsOutputModeText),
    audio_clip: t(messageKeys.chatCompanionSettingsOutputModeAudioClip),
    tts: t(messageKeys.chatCompanionSettingsOutputModeTts),
    mixed: t(messageKeys.chatCompanionSettingsOutputModeMixed),
  };
  const telegramInboundModeLabelMap: Record<string, string> = {
    polling: t(messageKeys.sharedSettingsCatsBindingPollingMode),
    webhook: t(messageKeys.sharedSettingsCatsBindingWebhookMode),
  };
  const telegramInboundModeFallback = t(messageKeys.chatCompanionSettingsTelegramBindingDefaultMode);

  const binding = payload.chat.botBindings?.find(
    (b) => b.catId === catId,
  );

  async function handleExpressionMode(mode: CompanionExpressionMode) {
    setSaving(true);
    try {
      await onUpdateResponseProfile({ expressionMode: mode });
    } finally {
      setSaving(false);
    }
  }

  async function handleOutputMode(mode: CompanionOutputMode) {
    setSaving(true);
    try {
      await onUpdateResponseProfile({ outputMode: mode });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    setSaving(true);
    try {
      await onUpdateResponseProfile({ notes: notes.trim() || null });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !responseProfile) {
    return (
      <div className="companionSection companionLoading">
        {t(messageKeys.chatCompanionSettingsLoadingState)}
      </div>
    );
  }

  return (
    <div className="companionSection companionSettings">
      <div className="companionCard">
        <div className="companionCardHeader">{t(messageKeys.chatCompanionSettingsResponseProfileTitle)}</div>

        <div className="companionFormRow">
          <label className="companionLabel">
            {t(messageKeys.chatCompanionSettingsExpressionModeLabel)}
          </label>
          <div className="companionPillGroup">
            {EXPRESSION_MODES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`companionPill ${responseProfile?.expressionMode === value ? 'isActive' : ''}`}
                onClick={() => handleExpressionMode(value)}
                disabled={saving}
              >
                {expressionModeLabelMap[label]}
              </button>
            ))}
          </div>
        </div>

        <div className="companionFormRow">
          <label className="companionLabel">
            {t(messageKeys.chatCompanionSettingsOutputModeLabel)}
          </label>
          <div className="companionPillGroup">
            {OUTPUT_MODES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`companionPill ${responseProfile?.outputMode === value ? 'isActive' : ''}`}
                onClick={() => handleOutputMode(value)}
                disabled={saving}
              >
                {outputModeLabelMap[label]}
              </button>
            ))}
          </div>
        </div>

        <div className="companionFormRow">
          <label className="companionLabel">
            {t(messageKeys.chatCompanionSettingsResponseNotesLabel)}
          </label>
          <textarea
            className="companionTextarea"
            placeholder={t(messageKeys.chatCompanionSettingsResponseNotesPlaceholder)}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            className="companionActionButton"
            onClick={handleSaveNotes}
            disabled={saving || notes === (responseProfile?.notes ?? '')}
          >
            {saving
              ? t(messageKeys.chatCompanionSettingsResponseNotesSaving)
              : t(messageKeys.chatCompanionSettingsResponseNotesSave)}
          </button>
        </div>
      </div>

      <div className="companionCard">
        <div className="companionCardHeader">
          {t(messageKeys.chatCompanionSettingsTelegramBindingTitle)}
        </div>
        {binding ? (
          <div className="companionTelegramInfo">
            <p>
              <strong>{t(messageKeys.chatCompanionSettingsTelegramBindingBotLabel)} </strong>
              {binding.botName ?? t(messageKeys.chatCompanionSettingsTelegramBindingConnected)}
            </p>
            <p>
              <strong>{t(messageKeys.chatCompanionSettingsTelegramBindingModeLabel)} </strong>
              {binding.inboundMode
                ? telegramInboundModeLabelMap[binding.inboundMode] ?? binding.inboundMode
                : telegramInboundModeFallback}
            </p>
            <p className="companionMuted">
              {t(messageKeys.chatCompanionSettingsTelegramBindingManageHint)}
              <Link to="/settings/cats">
                {t(messageKeys.chatCompanionSettingsTelegramBindingSettingsLabel)}
              </Link>
              {t(messageKeys.chatCompanionSettingsTelegramBindingSuffix)}
            </p>
          </div>
        ) : (
          <p className="companionEmpty">
            {t(messageKeys.chatCompanionSettingsNoTelegramBindingState)}
            <Link to="/settings/cats">
              {t(messageKeys.chatCompanionSettingsTelegramBindingSettingsLabel)}
            </Link>
            {t(messageKeys.chatCompanionSettingsTelegramBindingSuffix)}
          </p>
        )}
      </div>
    </div>
  );
}
