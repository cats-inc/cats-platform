import { useState } from 'react';
import { Link } from 'react-router-dom';

import type {
  CompanionExpressionMode,
  CompanionOutputMode,
  CompanionResponseProfile,
  UpdateCompanionResponseProfileInput,
} from '../../../companion/contracts.js';
import type { AppShellPayload } from '../../../api/contracts.js';

export interface CompanionSettingsSectionProps {
  catId: string;
  responseProfile: CompanionResponseProfile | null;
  payload: AppShellPayload;
  loading: boolean;
  onUpdateResponseProfile: (input: UpdateCompanionResponseProfileInput) => Promise<void>;
  /**
   * When true, render the PLAN-077 Phase 1 Telegram binding view: read-only
   * with a real deep link to canonical `/settings/cats` (the "My Cats"
   * page). Defaults to `false` so callers that have not plumbed the flag
   * through keep the legacy plaintext "Settings > Cats" hint.
   */
  companionProfileIaEnabled?: boolean;
}

const EXPRESSION_MODES: readonly { value: CompanionExpressionMode; label: string }[] = [
  { value: 'animalistic', label: 'Animalistic' },
  { value: 'anthropomorphic', label: 'Anthropomorphic' },
  { value: 'mixed', label: 'Mixed' },
];

const OUTPUT_MODES: readonly { value: CompanionOutputMode; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'audio_clip', label: 'Audio Clip' },
  { value: 'tts', label: 'TTS' },
  { value: 'mixed', label: 'Mixed' },
];

export function CompanionSettingsSection({
  catId,
  responseProfile,
  payload,
  loading,
  onUpdateResponseProfile,
  companionProfileIaEnabled = false,
}: CompanionSettingsSectionProps) {
  const [notes, setNotes] = useState(responseProfile?.notes ?? '');
  const [saving, setSaving] = useState(false);

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
    return <div className="companionSection companionLoading">Loading...</div>;
  }

  return (
    <div className="companionSection companionSettings">
      <div className="companionCard">
        <div className="companionCardHeader">Response Profile</div>

        <div className="companionFormRow">
          <label className="companionLabel">Expression Mode</label>
          <div className="companionPillGroup">
            {EXPRESSION_MODES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`companionPill ${responseProfile?.expressionMode === value ? 'isActive' : ''}`}
                onClick={() => handleExpressionMode(value)}
                disabled={saving}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="companionFormRow">
          <label className="companionLabel">Output Mode</label>
          <div className="companionPillGroup">
            {OUTPUT_MODES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`companionPill ${responseProfile?.outputMode === value ? 'isActive' : ''}`}
                onClick={() => handleOutputMode(value)}
                disabled={saving}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="companionFormRow">
          <label className="companionLabel">Response Notes</label>
          <textarea
            className="companionTextarea"
            placeholder="Custom instructions for how your companion should respond..."
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
            {saving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      </div>

      <div className="companionCard">
        <div className="companionCardHeader">Telegram Binding</div>
        {binding ? (
          <div className="companionTelegramInfo">
            <p>
              <strong>Bot:</strong> {binding.botName ?? 'Connected'}
            </p>
            <p>
              <strong>Mode:</strong> {binding.inboundMode ?? 'default'}
            </p>
            <p className="companionMuted">
              {companionProfileIaEnabled ? (
                <>
                  Manage Telegram binding in{' '}
                  <Link to="/settings/cats">Settings &gt; My Cats</Link>.
                </>
              ) : (
                'Manage Telegram binding in Settings > Cats.'
              )}
            </p>
          </div>
        ) : (
          <p className="companionEmpty">
            {companionProfileIaEnabled ? (
              <>
                No Telegram binding. Configure one in{' '}
                <Link to="/settings/cats">Settings &gt; My Cats</Link>.
              </>
            ) : (
              'No Telegram binding. Configure one in Settings > Cats.'
            )}
          </p>
        )}
      </div>
    </div>
  );
}
