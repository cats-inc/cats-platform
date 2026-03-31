import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../api/contracts.js';
import { updateVerbosePreference } from '../api/index.js';
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

  return (
    <SettingsShell section="general" title="Chat">
      <div className="contentCard">
        <h2>Conversation preferences</h2>
        <p className="heroNote">
          Product-specific chat behavior stays under the Chat route tree.
        </p>
        <button
          type="button"
          className="toggleRow"
          onClick={async () => {
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
          }}
        >
          <span className={payload.chat.showVerboseMessages ? 'toggleDot toggleDotOn' : 'toggleDot'} />
          <span>Show verbose messages</span>
        </button>
      </div>

      <div className="contentCard">
        <h2>Suite-wide settings</h2>
        <p className="heroNote">
          Owner profile, runtime status, and reset controls now live at the suite host level.
        </p>
        <button
          type="button"
          className="secondaryButton"
          onClick={() => navigate('/settings/general')}
        >
          Open suite settings
        </button>
      </div>

      {feedback ? <p className="feedbackText">{feedback}</p> : null}
    </SettingsShell>
  );
}
