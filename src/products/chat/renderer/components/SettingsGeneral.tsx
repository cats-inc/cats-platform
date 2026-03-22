import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../../../shared/app-shell';
import { updateVerbosePreference } from '../api';

export interface SettingsGeneralProps {
  payload: AppShellPayload;
  feedback: string;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
}

export function SettingsGeneral({
  payload,
  feedback,
  onPayloadUpdate,
  onFeedback,
}: SettingsGeneralProps) {
  const navigate = useNavigate();

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <button className="settingsTab settingsTabActive" type="button" onClick={() => navigate('/settings/general')}>General</button>
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/cats')}>Cats</button>
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/data')}>Data</button>
      </nav>
      <div className="settingsContent">
        <h1>General</h1>
        {feedback ? <p className="feedbackText">{feedback}</p> : null}
        <div className="contentCard">
          <label className="fieldLabel">
            <span>Display name</span>
            <input className="textInput" value={payload.ownerDisplayName} readOnly />
          </label>
          <div style={{ marginTop: 16 }}>
            <p className="sectionLabel">Runtime</p>
            <span className={payload.runtime.reachable ? 'statusChip statusChipReady' : 'statusChip statusChipWarm'}>
              {payload.runtime.reachable ? 'Cats Runtime connected' : 'Cats Runtime not detected'}
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            <p className="sectionLabel">Chat</p>
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
                } catch (err) {
                  onPayloadUpdate({
                    ...payload,
                    chat: { ...payload.chat, showVerboseMessages: !show },
                  });
                  onFeedback(err instanceof Error ? err.message : 'Failed to update preference');
                }
              }}
            >
              <span className={payload.chat.showVerboseMessages ? 'toggleDot toggleDotOn' : 'toggleDot'} />
              <span>Show verbose messages</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
