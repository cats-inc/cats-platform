import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload, ConcurrentChatPresentationMode } from '../../api/contracts.js';
import {
  updateConcurrentPresentationModePreference,
  updateLiveProgressDetailsPreference,
  updateVerbosePreference,
} from '../api/index.js';
import { SettingsShell } from './SettingsShell.js';

export interface ChatSettingsGeneralProps {
  payload: AppShellPayload;
  feedback: string;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
}

export function ChatSettingsGeneral({
  payload,
  feedback,
  onPayloadUpdate,
  onFeedback,
}: ChatSettingsGeneralProps) {
  const navigate = useNavigate();

  async function toggleVerboseMessages(): Promise<void> {
    const show = !payload.chat.showVerboseMessages;
    onPayloadUpdate({
      ...payload,
      chat: { ...payload.chat, showVerboseMessages: show },
    });
    try {
      const next = await updateVerbosePreference(show);
      startTransition(() => onPayloadUpdate(next));
      onFeedback('');
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        chat: { ...payload.chat, showVerboseMessages: !show },
      });
      onFeedback(error instanceof Error ? error.message : 'Failed to update preference');
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
      onFeedback('');
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        chat: { ...payload.chat, concurrentPresentationMode: previous },
      });
      onFeedback(error instanceof Error ? error.message : 'Failed to update preference');
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
      onFeedback('');
    } catch (error) {
      onPayloadUpdate({
        ...payload,
        chat: { ...payload.chat, showLiveProgressDetails: !show },
      });
      onFeedback(error instanceof Error ? error.message : 'Failed to update preference');
    }
  }

  return (
    <SettingsShell section="chat" title="Chat">
      <div className="contentCard">
        <h2>Conversation preferences</h2>
        <p className="heroNote">
          Product-specific chat behavior stays under the Chat route tree.
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
        <h2>Platform-wide settings</h2>
        <p className="heroNote">
          Owner profile, runtime status, and reset controls now live at the platform host level.
        </p>
        <button
          type="button"
          className="secondaryButton"
          onClick={() => navigate('/settings/general')}
        >
          Open platform settings
        </button>
      </div>

      {feedback ? <p className="feedbackText">{feedback}</p> : null}
    </SettingsShell>
  );
}
