import type { ChatCat } from '../../../api/workspaceContracts.js';
import { catInitials } from '../../workspaceChatUtils.js';

export interface ChatViewTopBarProps {
  topBarCats: ChatCat[];
  bossCatId: string | null;
  defaultRecipientId: string | null;
  activeTopBarCatIdSet: Set<string>;
  showRosterAvatars: boolean;
  isDirectLane: boolean;
  topBarTitle: string;
  canResumeChannel: boolean;
  resumeBusy: boolean;
  sidePanelOpen: boolean;
  approvalCount: number;
  onResumeChannel?: () => void;
  onToggleSidePanel: () => void;
}

export function ChatViewTopBar({
  topBarCats,
  bossCatId,
  defaultRecipientId,
  activeTopBarCatIdSet,
  showRosterAvatars,
  isDirectLane,
  topBarTitle,
  canResumeChannel,
  resumeBusy,
  sidePanelOpen,
  approvalCount,
  onResumeChannel,
  onToggleSidePanel,
}: ChatViewTopBarProps) {
  return (
    <header className="channelTopBar">
      <div className="channelTopBarStart">
        {showRosterAvatars ? (
          <div className="rosterAvatars rosterAvatarsExpanded">
            {topBarCats.map((cat) => {
              const isBoss = cat.id === bossCatId;
              const isLead = cat.id === defaultRecipientId;
              return (
                <div
                  key={cat.id}
                  className={[
                    isBoss ? 'catAvatar catAvatarBoss' : 'catAvatar',
                    activeTopBarCatIdSet.has(cat.id) ? 'catAvatarPulsing' : '',
                  ].filter(Boolean).join(' ')}
                  data-tooltip={cat.name}
                  style={cat.avatarUrl
                    ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : cat.avatarColor ? { background: cat.avatarColor } : undefined}
                >
                  {cat.avatarUrl ? null : catInitials(cat.name)}
                  {isLead ? <span className="catAvatarLeadBadge">&#x2605;</span> : null}
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
        {onResumeChannel ? (
          <button
            className="channelActionIconButton"
            type="button"
            disabled={!canResumeChannel}
            onClick={() => void onResumeChannel()}
            aria-label={resumeBusy ? 'Resuming chat session' : 'Resume chat session'}
            data-tooltip={resumeBusy ? 'Resuming chat session' : 'Resume chat session'}
            aria-busy={resumeBusy}
          >
            <svg
              className={resumeBusy
                ? 'channelActionIconGlyph channelActionIconGlyphSpinning'
                : 'channelActionIconGlyph'}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M13 4v4H9" />
              <path d="M12.35 8A5.35 5.35 0 1 1 10.7 4.15" />
            </svg>
          </button>
        ) : null}
        <button
          className="sidePanelToggle"
          type="button"
          onClick={onToggleSidePanel}
          aria-label="Toggle inspector panel"
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
