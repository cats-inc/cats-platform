import { startTransition } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  updateAdvancedDraftControlsPreference,
} from '../../../products/shared/renderer/api/index.js';
import {
  isAdvancedDraftControlsEnabled,
  normalizeAdvancedDraftControlsPreferences,
} from '../../../products/shared/advancedDraftControls.js';
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

  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    payload.chat.advancedDraftControls,
    'chat',
  );

  return (
    <>
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
