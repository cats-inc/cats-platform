import { startTransition } from 'react';

import type {
  AppShellPayload,
  ConcurrentChatPresentationMode,
} from '../../../products/shared/api/workspaceContracts.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  updateConcurrentPresentationModePreference,
  updateLiveProgressDetailsPreference,
  updateVerbosePreference,
} from '../../../products/shared/renderer/api/index.js';
import { PlatformSettingsShell } from './PlatformSettingsShell.js';

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

  return (
    <PlatformSettingsShell section="chat" title="Chat" products={payload.products}>
      <div className="contentCard">
        <h2>Conversation preferences</h2>
        <p className="heroNote">
          These settings affect Cats Chat only.
        </p>
        <button
          type="button"
          className="toggleRow"
          onClick={() => void toggleVerboseMessages()}
        >
          <span className={payload.chat.showVerboseMessages ? 'toggleDot toggleDotOn' : 'toggleDot'} />
          <span>Show verbose messages</span>
        </button>
        <button
          type="button"
          className="toggleRow"
          onClick={() => void toggleLiveProgressDetails()}
        >
          <span className={payload.chat.showLiveProgressDetails === true ? 'toggleDot toggleDotOn' : 'toggleDot'} />
          <span>Show live progress details</span>
        </button>
        <label className="fieldLabel">
          <span>Concurrent response layout</span>
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
        </label>
      </div>

      <div className="contentCard">
        <h2>Product scope</h2>
        <p className="heroNote">
          Chat-specific settings stay under the unified Settings area, but remain product-owned.
        </p>
      </div>

      <ToastContainer toasts={toasts} />
    </PlatformSettingsShell>
  );
}
