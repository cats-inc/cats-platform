import { startTransition } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  updateAdvancedDraftControlsPreference,
  updateChatOrchestrator,
} from '../../../products/shared/renderer/api/index.js';
import {
  isAdvancedDraftControlsEnabled,
  normalizeAdvancedDraftControlsPreferences,
} from '../../../products/shared/advancedDraftControls.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import {
  MCP_PROFILES,
} from '../../../products/shared/renderer/components/catRegistryViewSupport.js';
import { CHAT_MCP_PROFILE_ID } from '../../../shared/catMcpProfiles.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { ProductAdvancedDraftControlsSection } from './ProductAdvancedDraftControlsSection.js';
import { ProductConversationBehaviorSection } from './ProductConversationBehaviorSection.js';
import { formatSettingsPreferenceMutationError } from './settingsPreferenceErrorLabels.js';
import { useI18n } from '../i18n/index.js';

export interface PlatformSettingsChatProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

export function PlatformSettingsChat({
  payload,
  onPayloadUpdate,
}: PlatformSettingsChatProps) {
  const { toasts, showToast } = useToast();
  const { t } = useI18n();

  async function updateAdvancedDraftControls(enabled: boolean): Promise<void> {
    const previous = payload.chat.advancedDraftControls;
    const nextControls = normalizeAdvancedDraftControlsPreferences(previous);
    nextControls.chat = enabled;
    onPayloadUpdate({
      ...payload,
      chat: {
        ...payload.chat,
        advancedDraftControls: nextControls,
      },
    });
    try {
      const next = await updateAdvancedDraftControlsPreference({ chat: enabled });
      startTransition(() => onPayloadUpdate(next));
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        chat: {
          ...payload.chat,
          advancedDraftControls: previous,
        },
      });
      showToast(formatSettingsPreferenceMutationError(
        error,
        t('settingsChatAdvancedControlsFailure'),
        t,
      ));
    }
  }

  async function updateBossToolProfile(nextMcpProfile: string): Promise<void> {
    const previous = payload;
    const currentOrchestrator = payload.chat.globalOrchestrator;
    onPayloadUpdate({
      ...payload,
      chat: {
        ...payload.chat,
        globalOrchestrator: {
          ...currentOrchestrator,
          mcpProfile: nextMcpProfile,
        },
      },
    });
    try {
      const next = await updateChatOrchestrator({ mcpProfile: nextMcpProfile });
      startTransition(() => onPayloadUpdate(next));
    } catch (error) {
      onPayloadUpdate(previous);
      showToast(formatSettingsPreferenceMutationError(
        error,
        t(messageKeys.settingsChatBossToolProfileUpdateFailure),
        t,
      ));
    }
  }

  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    payload.chat.advancedDraftControls,
    'chat',
  );
  const activeBossToolProfile =
    payload.chat.globalOrchestrator.mcpProfile ?? CHAT_MCP_PROFILE_ID;

  return (
    <>
      <SettingsSection
        header={(
          <SettingsSectionHeader title={t(messageKeys.settingsChatBossToolProfileTitle)} />
        )}
      >
        <SettingsOptionRow
          label={t(messageKeys.sharedSettingsCatsMcpProfileLabel)}
          layout="stack"
          control={(
            <div
              className="settingsSegmentedControl"
              role="radiogroup"
              aria-label={t(messageKeys.sharedSettingsCatsMcpProfileLabel)}
            >
              {MCP_PROFILES.map((profile) => (
                <button
                  key={profile.value}
                  type="button"
                  role="radio"
                  aria-checked={activeBossToolProfile === profile.value}
                  className="settingsSegmentedOption"
                  data-active={activeBossToolProfile === profile.value ? 'true' : 'false'}
                  onClick={() => {
                    if (activeBossToolProfile !== profile.value) {
                      void updateBossToolProfile(profile.value);
                    }
                  }}
                >
                  {t(profile.label)}
                </button>
              ))}
            </div>
          )}
        />
      </SettingsSection>

      <ProductConversationBehaviorSection
        surface="chat"
        payload={payload}
        onPayloadUpdate={onPayloadUpdate}
        onError={showToast}
      />

      <ProductAdvancedDraftControlsSection
        surface="chat"
        enabled={advancedDraftControlsEnabled}
        onToggle={(enabled) => {
          void updateAdvancedDraftControls(enabled);
        }}
      />

      <ToastContainer toasts={toasts} />
    </>
  );
}
