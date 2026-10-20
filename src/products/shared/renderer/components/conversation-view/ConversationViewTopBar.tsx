import { type KeyboardEvent, type ReactNode, useCallback, useState } from 'react';

import { catInitials } from '../../workspaceChatUtils.js';
import type { AudienceTargetEditor } from '../AudienceChip.js';
import { CollaborateIcon } from '../DraftBuilderIcons.js';
import type { DraftComposerStackParticipant } from '../newConversationDraftSupport.js';
import { ParticipantTargetPopover, useDismissablePopover } from '../ParticipantTargetPopover.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { CatAvatarSelectionAttention } from '../../../../../app/renderer/SavedSelectionAvatarAttention.js';
import type { SavedSelectionTarget } from '../../../../../app/renderer/savedSelectionAttention.js';

export interface ConversationViewTopBarAvatar {
  key: string;
  label: string;
  executionLabel?: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  isBoss?: boolean;
  useNeutralAvatar?: boolean;
  pulsing?: boolean;
  /** A cat participant and the model copy this chat runs for it. */
  catId?: string | null;
  selectionTarget?: SavedSelectionTarget | null;
  /** The model this conversation runs for the participant; its avatar opens the picker. */
  editor?: AudienceTargetEditor | null;
}

function toPopoverParticipant(avatar: ConversationViewTopBarAvatar): DraftComposerStackParticipant {
  return {
    key: avatar.key,
    name: avatar.label,
    executionLabel: avatar.executionLabel ?? null,
    avatarColor: avatar.avatarColor,
    avatarUrl: avatar.avatarUrl,
    isCat: !avatar.useNeutralAvatar,
    catId: avatar.catId ?? null,
    participantId: null,
  };
}

export interface ConversationViewTopBarProps {
  avatars: ConversationViewTopBarAvatar[];
  showRosterAvatars: boolean;
  isDirectLane: boolean;
  topBarTitle: string;
  sidePanelOpen: boolean;
  approvalCount: number;
  extraActions?: ReactNode;
  onToggleSidePanel: () => void;
  /** Adds an existing cat to the conversation; the add-cat panel opens. */
  onAddParticipant?: () => void;
  /** When set, renders an icon button to the left of the side-panel
   * toggle that takes the user to the cat's profile page. The chat
   * product wires this on direct-lane channels so the user can jump
   * to `/entities/cats/:catId` from inside an active conversation. */
  onOpenCatProfile?: () => void;
}

export function ConversationViewTopBar({
  avatars,
  showRosterAvatars,
  isDirectLane,
  topBarTitle,
  sidePanelOpen,
  approvalCount,
  extraActions,
  onToggleSidePanel,
  onAddParticipant,
  onOpenCatProfile,
}: ConversationViewTopBarProps) {
  const { t } = useI18n();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const closePopover = useCallback(() => setOpenKey(null), []);
  const rosterRef = useDismissablePopover(openKey != null, closePopover);
  const openAvatar = showRosterAvatars
    ? avatars.find((avatar) => avatar.key === openKey && avatar.editor) ?? null
    : null;
  return (
    <header className={openAvatar ? 'channelTopBar channelTopBarPopoverOpen' : 'channelTopBar'}>
      <div className="channelTopBarStart">
        {showRosterAvatars ? (
          <div className="rosterAvatars rosterAvatarsExpanded" ref={rosterRef}>
            {avatars.map((avatar) => {
              const isOpen = openAvatar?.key === avatar.key;
              const toggle = avatar.editor
                ? () => setOpenKey(isOpen ? null : avatar.key)
                : undefined;
              return (
                <div
                  key={avatar.key}
                  className={[
                    avatar.isBoss ? 'catAvatar catAvatarBoss' : 'catAvatar',
                    avatar.useNeutralAvatar ? 'channelParticipantAvatar' : '',
                    avatar.pulsing ? 'catAvatarPulsing' : '',
                    toggle ? 'catAvatarEditable' : '',
                  ].filter(Boolean).join(' ')}
                  role={toggle ? 'button' : undefined}
                  tabIndex={toggle ? 0 : undefined}
                  aria-label={toggle
                    ? t(messageKeys.sharedAudienceChangeModelLabel, { name: avatar.label })
                    : undefined}
                  aria-haspopup={toggle ? 'dialog' : undefined}
                  aria-expanded={toggle ? isOpen : undefined}
                  onClick={toggle}
                  onKeyDown={toggle
                    ? (event: KeyboardEvent<HTMLDivElement>) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggle();
                        }
                      }
                    : undefined}
                  data-tooltip={isOpen
                    ? undefined
                    : avatar.useNeutralAvatar
                      ? (avatar.executionLabel || avatar.label)
                      : (avatar.executionLabel ? `${avatar.label} · ${avatar.executionLabel}` : avatar.label)}
                  style={avatar.avatarUrl
                    ? { backgroundImage: `url(${avatar.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : !avatar.useNeutralAvatar && avatar.avatarColor
                      ? { background: avatar.avatarColor }
                      : undefined}
                >
                  {avatar.avatarUrl ? null : catInitials(avatar.label)}
                  {avatar.catId ? (
                    <CatAvatarSelectionAttention catId={avatar.catId} target={avatar.selectionTarget ?? null} />
                  ) : null}
                </div>
              );
            })}
            {openAvatar?.editor ? (
              <ParticipantTargetPopover
                participant={toPopoverParticipant(openAvatar)}
                editor={openAvatar.editor}
                showIdentity
                placement="below-start"
                onClose={closePopover}
              />
            ) : null}
          </div>
        ) : null}
        {onAddParticipant ? (
          <button
            type="button"
            className="parallelAddButton channelTopBarAddButton"
            aria-label={t(messageKeys.chatParticipantsSectionChooseCatsButton)}
            data-tooltip={t(messageKeys.chatParticipantsSectionChooseCatsButton)}
            onClick={onAddParticipant}
          >
            <CollaborateIcon />
          </button>
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
        {onOpenCatProfile ? (
          <button
            className="sidePanelToggle"
            type="button"
            onClick={onOpenCatProfile}
            aria-label={t(messageKeys.chatTopBarOpenCatProfileAriaLabel)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
          </button>
        ) : null}
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
