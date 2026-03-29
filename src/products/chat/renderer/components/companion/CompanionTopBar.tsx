import type { ChatCat } from '../../../api/contracts.js';
import type { CompanionPresenceInfo } from '../../hooks/useCompanionPresence.js';
import { catInitials } from '../../chatUtils.js';

export interface CompanionTopBarProps {
  cat: ChatCat;
  presence: CompanionPresenceInfo;
  onBackToChat: () => void;
}

export function CompanionTopBar({
  cat,
  presence,
  onBackToChat,
}: CompanionTopBarProps) {
  const initials = catInitials(cat.name);
  const avatarStyle = cat.avatarColor
    ? { backgroundColor: cat.avatarColor }
    : undefined;

  return (
    <div className="companionTopBar">
      <div className="companionTopBarLeft">
        <button
          type="button"
          className="companionBackButton"
          onClick={onBackToChat}
          title="Back to chat"
        >
          &larr;
        </button>
        <div
          className="companionAvatar"
          style={avatarStyle}
        >
          {initials}
        </div>
        <div className="companionTopBarMeta">
          <span className="companionCatName">{cat.name}</span>
          <span className={`companionPresenceBadge ${presence.className}`}>
            <span className="companionPresenceDot" />
            {presence.label}
          </span>
        </div>
      </div>
      <div className="companionTopBarRight">
        <span className="companionModeLabel">Companion</span>
      </div>
    </div>
  );
}
