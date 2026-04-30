import type { ReactNode } from 'react';

import { catInitials } from '../../workspaceChatUtils.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

export interface ChatViewTopBarAvatar {
  key: string;
  label: string;
  executionLabel?: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  isBoss?: boolean;
  useNeutralAvatar?: boolean;
  showLeadBadge?: boolean;
  pulsing?: boolean;
}

export interface ChatViewTopBarProps {
  avatars: ChatViewTopBarAvatar[];
  showRosterAvatars: boolean;
  isDirectLane: boolean;
  topBarTitle: string;
  sidePanelOpen: boolean;
  approvalCount: number;
  extraActions?: ReactNode;
  onToggleSidePanel: () => void;
}

export function ChatViewTopBar({
  avatars,
  showRosterAvatars,
  isDirectLane,
  topBarTitle,
  sidePanelOpen,
  approvalCount,
  extraActions,
  onToggleSidePanel,
}: ChatViewTopBarProps) {
  const { t } = useI18n();
  return (
    <header className="channelTopBar">
      <div className="channelTopBarStart">
        {showRosterAvatars ? (
          <div className="rosterAvatars rosterAvatarsExpanded">
            {avatars.map((avatar) => {
              return (
                <div
                  key={avatar.key}
                  className={[
                    avatar.isBoss ? 'catAvatar catAvatarBoss' : 'catAvatar',
                    avatar.useNeutralAvatar ? 'channelParticipantAvatar' : '',
                    avatar.pulsing ? 'catAvatarPulsing' : '',
                  ].filter(Boolean).join(' ')}
                  data-tooltip={avatar.useNeutralAvatar
                    ? (avatar.executionLabel || avatar.label)
                    : (avatar.executionLabel ? `${avatar.label} · ${avatar.executionLabel}` : avatar.label)}
                  style={avatar.avatarUrl
                    ? { backgroundImage: `url(${avatar.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : !avatar.useNeutralAvatar && avatar.avatarColor
                      ? { background: avatar.avatarColor }
                      : undefined}
                >
                  {avatar.avatarUrl ? null : catInitials(avatar.label)}
                  {avatar.showLeadBadge ? <span className="catAvatarLeadBadge">&#x2605;</span> : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="channelTopBarCenter">
        <span className={isDirectLane
          ? 'channelTopBarTitle channelTopBarTitleDirectLane'
          : 'channelTopBarTitle'}
        >
          {topBarTitle}
        </span>
      </div>
      <div className="channelTopBarEnd">
        {extraActions}
        <button
          className="sidePanelToggle"
          type="button"
          onClick={onToggleSidePanel}
          aria-label={t(messageKeys.chatTopBarToggleSidePanelAriaLabel)}
          aria-pressed={sidePanelOpen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2v12" />
            <rect x="2" y="2" width="12" height="12" rx="2" />
          </svg>
          {approvalCount > 0 ? (
            <span className="sidePanelBadge">{approvalCount}</span>
          ) : null}
        </button>
      </div>
    </header>
  );
}
