import { startTransition } from 'react';

import type {
  AppShellPayload,
  ConcurrentChatPresentationMode,
} from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  SettingsOptionRow,
  SettingsSection,
  SettingsSectionHeader,
} from '../../../design/components/settings/index.js';
import {
  updateAdvancedDraftControlsPreference,
  updateConcurrentPresentationModePreference,
  updateLiveProgressDetailsPreference,
  updateVerbosePreference,
} from '../../../products/shared/renderer/api/index.js';
import {
  isAdvancedDraftControlsEnabled,
  normalizeAdvancedDraftControlsPreferences,
} from '../../../products/shared/advancedDraftControls.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';
import { ProductAdvancedDraftControlsSection } from './ProductAdvancedDraftControlsSection.js';

export interface PlatformSettingsChatProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

export function PlatformSettingsChat({
  payload,
  onPayloadUpdate,
}: PlatformSettingsChatProps) {
  const { toasts, showToast } = useToast();

  async function toggleVerboseMessages(): Promise<void> {
    const show = !payload.chat.showVerboseMessages;
    onPayloadUpdate({
      ...payload,
      chat: { ...payload.chat, showVerboseMessages: show },
    });
    try {
      const next = await updateVerbosePreference(show);
      startTransition(() => onPayloadUpdate(next));
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        chat: { ...payload.chat, showVerboseMessages: !show },
      });
      showToast(error instanceof Error ? error.message : 'Failed to update preference');
    }
  }

  async function toggleLiveProgressDetails(): Promise<void> {
    const show = payload.chat.showLiveProgressDetails !== true;
    onPayloadUpdate({
      ...payload,
      chat: { ...payload.chat, showLiveProgressDetails: show },
    });
    try {
      const next = await updateLiveProgressDetailsPreference(show);
      startTransition(() => onPayloadUpdate(next));
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        chat: { ...payload.chat, showLiveProgressDetails: !show },
      });
      showToast(error instanceof Error ? error.message : 'Failed to update preference');
    }
  }

  async function updatePresentationMode(mode: ConcurrentChatPresentationMode): Promise<void> {
    const previous = payload.chat.concurrentPresentationMode ?? 'inline_stack';
    onPayloadUpdate({
      ...payload,
      chat: { ...payload.chat, concurrentPresentationMode: mode },
    });
    try {
      const next = await updateConcurrentPresentationModePreference(mode);
      startTransition(() => onPayloadUpdate(next));
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        chat: { ...payload.chat, concurrentPresentationMode: previous },
      });
      showToast(error instanceof Error ? error.message : 'Failed to update preference');
    }
  }

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
      showToast(error instanceof Error ? error.message : 'Failed to update preference');
    }
  }

  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    payload.chat.advancedDraftControls,
    'chat',
  );

  return (
    <PlatformSettingsShell section="chat" title="Chat" products={payload.products}>
      <SettingsSection
        header={
          <SettingsSectionHeader
            title="Conversation behavior"
            description="These settings affect Cats Chat only."
          />
        }
      >
        <SettingsOptionRow
          label="Show verbose messages"
          description="Keep system-level room and orchestration messages visible in chat."
          control={(
            <input
              type="checkbox"
              checked={payload.chat.showVerboseMessages}
              onChange={() => {
                void toggleVerboseMessages();
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
              checked={payload.chat.showLiveProgressDetails === true}
              onChange={() => {
                void toggleLiveProgressDetails();
              }}
            />
          )}
        />
        <SettingsOptionRow
          label="Concurrent response layout"
          description="Choose how multi-model replies are arranged in Cats Chat."
          layout="stack"
          control={(
            <select
              className="textInput"
              value={payload.chat.concurrentPresentationMode ?? 'inline_stack'}
              onChange={(event) => void updatePresentationMode(
                event.target.value as ConcurrentChatPresentationMode,
              )}
            >
              <option value="inline_stack">Inline stack</option>
              <option value="compare_cards">Compare cards</option>
              <option value="focus_rail">Focus rail</option>
              <option value="adaptive">Adaptive</option>
            </select>
          )}
        />
      </SettingsSection>

      <ProductAdvancedDraftControlsSection
        surface="chat"
        enabled={advancedDraftControlsEnabled}
        onToggle={(enabled) => {
          void updateAdvancedDraftControls(enabled);
        }}
      />

      <ToastContainer toasts={toasts} />
    </PlatformSettingsShell>
  );
}
