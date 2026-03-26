import { startTransition, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../api/contracts';
import { AvatarCropDialog } from '../../../../design/components/AvatarCropDialog';
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
  const [cropOpen, setCropOpen] = useState(false);

  async function handleAvatarSave(dataUrl: string): Promise<void> {
    setCropOpen(false);
    try {
      const response = await fetch('/api/core/owner-profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      if (!response.ok) throw new Error('Failed to save avatar');
      onPayloadUpdate({ ...payload, ownerAvatarUrl: dataUrl });
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'Failed to save avatar');
    }
  }

  const avatarUrl = payload.ownerAvatarUrl;
  const initials = payload.ownerDisplayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase() || '?';

  return (
    <div className="settingsShell">
      <nav className="settingsSidebar">
        <p style={{ padding: '0 12px', marginBottom: 12, fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>Settings</p>
        <button className="settingsTab settingsTabActive" type="button" onClick={() => navigate('/settings/general')}>General</button>
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/cats')}>Cats</button>
        <button className="settingsTab" type="button" onClick={() => navigate('/settings/data')}>Data</button>
      </nav>
      <div className="settingsContent">
        <h1>General</h1>
        <div className="contentCard">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div
              className="settingsOwnerAvatar"
              style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
              onClick={() => setCropOpen(true)}
              role="button"
              tabIndex={0}
              data-tooltip="Change avatar"
            >
              {!avatarUrl ? initials : null}
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>{payload.ownerDisplayName}</p>
              <button
                type="button"
                style={{ padding: 0, border: 0, background: 'none', color: 'var(--accent)', fontSize: '0.8rem', cursor: 'pointer' }}
                onClick={() => setCropOpen(true)}
              >
                {avatarUrl ? 'Change avatar' : 'Upload avatar'}
              </button>
            </div>
          </div>
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
      {cropOpen ? (
        <AvatarCropDialog
          onSave={(dataUrl) => void handleAvatarSave(dataUrl)}
          onClose={() => setCropOpen(false)}
        />
      ) : null}
    </div>
  );
}
