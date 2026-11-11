import { startTransition } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import { updateBossCatJoinPolicyPreference } from '../../../products/shared/renderer/api/index.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { formatSettingsPreferenceMutationError } from './settingsPreferenceErrorLabels.js';
import { useI18n } from '../i18n/index.js';

type BossCatJoinPolicy = 'never' | 'ask' | 'allow';

const POLICY_OPTIONS: Array<{ value: BossCatJoinPolicy; label: typeof messageKeys[keyof typeof messageKeys] }> = [
  { value: 'never', label: messageKeys.settingsBossCatJoinNever },
  { value: 'ask', label: messageKeys.settingsBossCatJoinAsk },
  { value: 'allow', label: messageKeys.settingsBossCatJoinAllow },
];

export interface SettingsBossCatProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

/**
 * SPEC-139 FR-8: Settings › 主控貓. One app-level policy for every Boss Cat; each Cat's own
 * status switch lives on its settings in Cats Directory (ADR-150).
 */
export function SettingsBossCat({ payload, onPayloadUpdate }: SettingsBossCatProps) {
  const { toasts, showToast } = useToast();
  const { t } = useI18n();
  const policy: BossCatJoinPolicy = payload.chat.bossCatJoinPolicy ?? 'ask';

  async function updatePolicy(next: BossCatJoinPolicy): Promise<void> {
    if (next === policy) return;
    onPayloadUpdate({ ...payload, chat: { ...payload.chat, bossCatJoinPolicy: next } });
    try {
      const updated = await updateBossCatJoinPolicyPreference(next);
      startTransition(() => onPayloadUpdate(updated));
    } catch (error) {
      onPayloadUpdate(payload);
      showToast(formatSettingsPreferenceMutationError(error, t(messageKeys.settingsBossCatJoinFailure), t));
    }
  }

  return (
    <>
      <SettingsSection
        header={(
          <SettingsSectionHeader
            title={t(messageKeys.settingsBossCatJoinTitle)}
            description={t(messageKeys.settingsBossCatJoinDescription)}
          />
        )}
      >
        <SettingsOptionRow
          label={t(messageKeys.settingsBossCatJoinTitle)}
          description={t(messageKeys.settingsBossCatJoinHint)}
          layout="stack"
          control={(
            <select
              className="textInput"
              aria-label={t(messageKeys.settingsBossCatJoinTitle)}
              value={policy}
              onChange={(event) => { void updatePolicy(event.target.value as BossCatJoinPolicy); }}
            >
              {POLICY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(option.label)}</option>
              ))}
            </select>
          )}
        />
      </SettingsSection>
      <ToastContainer toasts={toasts} />
    </>
  );
}
