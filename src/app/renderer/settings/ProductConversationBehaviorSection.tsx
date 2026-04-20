import { startTransition } from 'react';

import type {
  AppShellPayload,
  ConcurrentChatPresentationMode,
} from '../../../products/shared/api/workspaceContracts.js';
import {
  cloneConversationBehaviorPreferences,
  resolveConversationBehaviorPreferences,
  type ConversationBehaviorSurface,
  type SurfaceConversationBehaviorPatch,
} from '../../../products/shared/conversationBehavior.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import { updateConversationBehaviorPreference } from '../../../products/shared/renderer/api/index.js';

const PRODUCT_LABEL_BY_SURFACE: Record<ConversationBehaviorSurface, string> = {
  chat: 'Cats Chat',
  code: 'Cats Code',
  work: 'Cats Work',
};

function applyConversationBehaviorPatchToPayload(
  payload: AppShellPayload,
  surface: ConversationBehaviorSurface,
  patch: SurfaceConversationBehaviorPatch,
): AppShellPayload {
  const conversationBehavior = cloneConversationBehaviorPreferences(
    payload.chat.conversationBehavior,
  );
  const nextSurfaceBehavior = conversationBehavior[surface];

  if (typeof patch.showVerboseMessages === 'boolean') {
    nextSurfaceBehavior.showVerboseMessages = patch.showVerboseMessages;
  }
  if (typeof patch.showLiveProgressDetails === 'boolean') {
    nextSurfaceBehavior.showLiveProgressDetails = patch.showLiveProgressDetails;
  }
  if (patch.concurrentPresentationMode) {
    nextSurfaceBehavior.concurrentPresentationMode = patch.concurrentPresentationMode;
  }

  return {
    ...payload,
    chat: {
      ...payload.chat,
      conversationBehavior,
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
  const productLabel = PRODUCT_LABEL_BY_SURFACE[surface];
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
      const next = await updateConversationBehaviorPreference(surface, patch);
      startTransition(() => onPayloadUpdate(next));
    } catch (error) {
      onPayloadUpdate(payload);
      onError(error instanceof Error ? error.message : errorFallback);
    }
  }

  return (
    <SettingsSection
      header={(
        <SettingsSectionHeader
          title="Conversation behavior"
          description={`These settings affect ${productLabel} only.`}
        />
      )}
    >
      <SettingsOptionRow
        label="Show verbose messages"
        description="Keep system-level room and orchestration messages visible in chat."
        control={(
          <input
            type="checkbox"
            checked={behavior.showVerboseMessages}
            onChange={() => {
              void updateBehaviorPreference(
                { showVerboseMessages: !behavior.showVerboseMessages },
                'Failed to update conversation behavior',
              );
            }}
          />
        )}
      />
      <SettingsOptionRow
        label="Show live progress details"
        description="Show more granular progress updates while a response is still running."
        control={(
          <input
            type="checkbox"
            checked={behavior.showLiveProgressDetails}
            onChange={() => {
              void updateBehaviorPreference(
                { showLiveProgressDetails: !behavior.showLiveProgressDetails },
                'Failed to update conversation behavior',
              );
            }}
          />
        )}
      />
      <SettingsOptionRow
        label="Concurrent response layout"
        description={`Choose how multi-model replies are arranged in ${productLabel}.`}
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
                'Failed to update conversation behavior',
              );
            }}
          >
            <option value="inline_stack">Inline stack</option>
            <option value="compare_cards">Compare cards</option>
            <option value="focus_rail">Focus rail</option>
            <option value="adaptive">Adaptive</option>
          </select>
        )}
      />
    </SettingsSection>
  );
}
