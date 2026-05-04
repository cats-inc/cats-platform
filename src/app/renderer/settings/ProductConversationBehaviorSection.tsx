import { startTransition } from 'react';

import type {
  AppShellPayload,
  ConcurrentChatPresentationMode,
} from '../../../products/shared/api/workspaceContracts.js';
import {
  applyConversationBehaviorPatch,
  resolveConversationBehaviorPreferences,
  type ConversationBehaviorSurface,
  type SurfaceConversationBehaviorPatch,
} from '../../../products/shared/conversationBehavior.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { useI18n } from '../i18n/index.js';
import { updateProductConversationBehaviorPreference } from './productConversationBehaviorApi.js';
import { formatSettingsPreferenceMutationError } from './settingsPreferenceErrorLabels.js';

const PRODUCT_LABEL_BY_SURFACE: Record<ConversationBehaviorSurface, string> = {
  chat: 'settingsConversationProductLabelChat',
  code: 'settingsConversationProductLabelCode',
  work: 'settingsConversationProductLabelWork',
};

function applyConversationBehaviorPatchToPayload(
  payload: AppShellPayload,
  surface: ConversationBehaviorSurface,
  patch: SurfaceConversationBehaviorPatch,
): AppShellPayload {
  return {
    ...payload,
    chat: {
      ...payload.chat,
      conversationBehavior: applyConversationBehaviorPatch(
        payload.chat.conversationBehavior,
        {
          [surface]: patch,
        },
      ),
    },
  };
}

export interface ProductConversationBehaviorSectionProps {
  surface: ConversationBehaviorSurface;
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onError: (message: string) => void;
}

export function ProductConversationBehaviorSection({
  surface,
  payload,
  onPayloadUpdate,
  onError,
}: ProductConversationBehaviorSectionProps) {
  const { t } = useI18n();
  const productLabel = t(
    PRODUCT_LABEL_BY_SURFACE[surface] as
      | 'settingsConversationProductLabelChat'
      | 'settingsConversationProductLabelCode'
      | 'settingsConversationProductLabelWork',
  );
  const behavior = resolveConversationBehaviorPreferences(
    payload.chat.conversationBehavior,
    surface,
  );

  async function updateBehaviorPreference(
    patch: SurfaceConversationBehaviorPatch,
    errorFallback: string,
  ): Promise<void> {
    onPayloadUpdate(applyConversationBehaviorPatchToPayload(payload, surface, patch));
    try {
      const next = await updateProductConversationBehaviorPreference(surface, patch);
      startTransition(() => onPayloadUpdate(next));
    } catch (error) {
      onPayloadUpdate(payload);
      onError(formatSettingsPreferenceMutationError(error, errorFallback, t));
    }
  }

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title={t('settingsConversationBehaviorTitle')}
          description={t('settingsConversationBehaviorDescription', { product: productLabel })}
        />
      )}
    >
      <SettingsOptionRow
        label={t('settingsConversationShowVerboseLabel')}
        description={t('settingsConversationShowVerboseDescription')}
        control={(
          <input
            type="checkbox"
            checked={behavior.showVerboseMessages}
            onChange={() => {
              void updateBehaviorPreference(
                { showVerboseMessages: !behavior.showVerboseMessages },
                t('settingsConversationUpdateFailure'),
              );
            }}
          />
        )}
      />
      <SettingsOptionRow
        label={t('settingsConversationShowLiveProgressLabel')}
        description={t('settingsConversationShowLiveProgressDescription')}
        control={(
          <input
            type="checkbox"
            checked={behavior.showLiveProgressDetails}
            onChange={() => {
              void updateBehaviorPreference(
                { showLiveProgressDetails: !behavior.showLiveProgressDetails },
                t('settingsConversationUpdateFailure'),
              );
            }}
          />
        )}
      />
      <SettingsOptionRow
        label={t('settingsConversationConcurrentLayoutLabel')}
        description={t('settingsConversationConcurrentLayoutDescription', { product: productLabel })}
        layout="stack"
        control={(
          <select
            className="textInput"
            value={behavior.concurrentPresentationMode}
            onChange={(event) => {
              void updateBehaviorPreference(
                {
                  concurrentPresentationMode:
                    event.target.value as ConcurrentChatPresentationMode,
                },
                t('settingsConversationUpdateFailure'),
              );
            }}
          >
            <option value="inline_stack">{t('settingsConversationLayoutInlineStack')}</option>
            <option value="compare_cards">{t('settingsConversationLayoutCompareCards')}</option>
            <option value="focus_rail">{t('settingsConversationLayoutFocusRail')}</option>
            <option value="adaptive">{t('settingsConversationLayoutAdaptive')}</option>
          </select>
        )}
      />
    </SettingsSection>
  );
}
