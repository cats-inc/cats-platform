import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { nameInitials } from '../../../../shared/nameInitials.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { useDismissablePopover } from './ParticipantTargetPopover.js';

export interface ParticipantAddMenuCat {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  added: boolean;
}

export interface ParticipantAddMenuPreset {
  id: string;
  name: string;
  executionLabel: string;
  added: boolean;
  /** Its capabilities need an activation review before it can join. */
  reviewReasons: string[] | null;
}

export interface ParticipantAddMenuProps {
  buttonClassName: string;
  ariaLabel: string;
  disabled: boolean;
  icon: ReactNode;
  onAddTemporaryParticipant: () => void;
  cats: ParticipantAddMenuCat[];
  onAddCat: (catId: string) => void;
  presets: ParticipantAddMenuPreset[];
  onAddPreset: (presetId: string) => void;
  /** The conversation is full, so only removing someone makes room. */
  atLimit: boolean;
}

/**
 * The composer's add button. It adds a temporary participant right away
 * unless an existing cat or assistant could join instead, in which case it
 * opens a menu of the three. Removing stays on each avatar's ×.
 */
export function ParticipantAddMenu({
  buttonClassName,
  ariaLabel,
  disabled,
  icon,
  onAddTemporaryParticipant,
  cats,
  onAddCat,
  presets,
  onAddPreset,
  atLimit,
}: ParticipantAddMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const anchorRef = useDismissablePopover(open, close);
  // A menu left open while sending does not reappear once the button returns.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const hasMenu = cats.some((cat) => !cat.added)
    || presets.some((preset) => !preset.added && !preset.reviewReasons);

  const choose = (add: () => void) => {
    close();
    add();
  };

  return (
    <div className="composerAddMenuAnchor" ref={anchorRef}>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup={hasMenu ? 'menu' : undefined}
        aria-expanded={hasMenu ? open : undefined}
        onClick={() => {
          if (hasMenu) {
            setOpen(!open);
          } else {
            onAddTemporaryParticipant();
          }
        }}
      >
        {icon}
      </button>
      {open && hasMenu && !disabled ? (
        <div className="audiencePopover audiencePopoverStart composerAddMenu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="composerAddMenuItem"
            onClick={() => choose(onAddTemporaryParticipant)}
          >
            <span className="composerAddMenuIcon" aria-hidden="true">{icon}</span>
            <span className="audiencePopoverName">
              {t(messageKeys.chatNewChatDraftTemporaryParticipantOpenForm)}
            </span>
          </button>
          {cats.length > 0 ? (
            <div className="audiencePopoverHeader">
              {t(messageKeys.sharedAudienceAddMenuCatsHeader)}
            </div>
          ) : null}
          {cats.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="menuitem"
              className="composerAddMenuItem"
              disabled={cat.added || atLimit}
              onClick={() => choose(() => onAddCat(cat.id))}
            >
              <span
                className="audiencePopoverAvatar"
                style={cat.avatarUrl
                  ? {
                      backgroundImage: `url(${cat.avatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : { background: cat.avatarColor ?? '#8B7E74' }}
              >
                {cat.avatarUrl ? null : nameInitials(cat.name)}
              </span>
              <span className="audiencePopoverName">{cat.name}</span>
              {cat.added ? (
                <span className="composerAddMenuStatus">
                  {t(messageKeys.chatNewChatDraftAssistantPresetAdded)}
                </span>
              ) : null}
            </button>
          ))}
          {presets.length > 0 ? (
            <div className="audiencePopoverHeader">
              {t(messageKeys.sharedAudienceAddMenuAssistantsHeader)}
            </div>
          ) : null}
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="menuitem"
              className="composerAddMenuItem"
              data-tooltip={preset.reviewReasons?.length
                ? preset.reviewReasons.join(', ')
                : preset.executionLabel}
              disabled={preset.added || Boolean(preset.reviewReasons) || atLimit}
              onClick={() => choose(() => onAddPreset(preset.id))}
            >
              <span className="audiencePopoverName">{preset.name}</span>
              {preset.added || preset.reviewReasons ? (
                <span className="composerAddMenuStatus">
                  {preset.added
                    ? t(messageKeys.chatNewChatDraftAssistantPresetAdded)
                    : t(messageKeys.chatNewChatDraftAssistantPresetReview)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
