import { type KeyboardEvent, useCallback, useState } from 'react';

import { catInitials } from '../workspaceChatUtils.js';
import type { AudienceTargetEditor } from './AudienceChip.js';
import type { DraftComposerStackParticipant } from './newConversationDraftSupport.js';
import {
  buildAudienceAvatarStyle,
  buildParticipantTooltip,
  ParticipantTargetPopover,
  useDismissablePopover,
} from './ParticipantTargetPopover.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

export interface BranchAudienceRosterProps {
  audienceParticipants: DraftComposerStackParticipant[];
  isSubmittingFirstTurn: boolean;
  canRemoveParticipant: boolean;
  useDangerRemoveHover?: boolean;
  /** An avatar with an editor opens that participant's popover; one without is a plain mark. */
  resolveTargetEditor?: (participant: DraftComposerStackParticipant) => AudienceTargetEditor | null;
  onRemoveParticipant: (participant: DraftComposerStackParticipant) => void;
}

/**
 * Roster of avatar slots representing a single parallel-branch's
 * audience members. Used by both the lead row (whole-draft audience)
 * and shadow rows (per-branch audience subset) so every branch row
 * gets the same left-side treatment.
 *
 * Hidden when the branch has 0 or 1 participants — a single
 * participant is already conveyed by the audience chip on the row's
 * right side (or implicit in the parallel target itself for the
 * traditional 1xN parallel case), so the slot row would just be
 * redundant noise.
 */
export function BranchAudienceRoster({
  audienceParticipants,
  isSubmittingFirstTurn,
  canRemoveParticipant,
  useDangerRemoveHover = false,
  resolveTargetEditor,
  onRemoveParticipant,
}: BranchAudienceRosterProps) {
  const { t } = useI18n();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const closePopover = useCallback(() => setOpenKey(null), []);
  const rosterRef = useDismissablePopover(openKey != null, closePopover);
  if (audienceParticipants.length <= 1) return null;

  const openParticipant = isSubmittingFirstTurn
    ? null
    : audienceParticipants.find((participant) => participant.key === openKey) ?? null;
  const openEditor = openParticipant ? resolveTargetEditor?.(openParticipant) ?? null : null;

  return (
    <div className="composerGroupRoster" ref={rosterRef}>
      {audienceParticipants.map((participant) => {
        const editor = resolveTargetEditor?.(participant) ?? null;
        const isOpen = openParticipant?.key === participant.key;
        const activate = isSubmittingFirstTurn || !editor
          ? undefined
          : () => setOpenKey(isOpen ? null : participant.key);
        return (
          <div key={participant.key} className="composerGroupAvatarSlot">
            <div
              className="catAvatar"
              role={activate ? 'button' : undefined}
              tabIndex={activate ? 0 : undefined}
              aria-label={editor
                ? t(messageKeys.sharedAudienceChangeModelLabel, { name: participant.name })
                : undefined}
              aria-haspopup={editor ? 'dialog' : undefined}
              aria-expanded={activate ? isOpen : undefined}
              onClick={activate}
              onKeyDown={activate
                ? (event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      activate();
                    }
                  }
                : undefined}
              data-tooltip={isOpen ? undefined : buildParticipantTooltip(participant, editor)}
              style={buildAudienceAvatarStyle(participant)}
            >
              {participant.avatarUrl ? null : catInitials(participant.name)}
            </div>
            {canRemoveParticipant ? (
              <button
                type="button"
                className={`composerGroupAvatarRemove${useDangerRemoveHover ? ' composerGroupAvatarRemoveDanger' : ''}`}
                aria-label={t(messageKeys.chatAudienceRemoveParticipantAria, {
                  name: participant.name,
                })}
                disabled={isSubmittingFirstTurn}
                onClick={() => onRemoveParticipant(participant)}
              >
                &times;
              </button>
            ) : null}
          </div>
        );
      })}
      {openParticipant && openEditor ? (
        <ParticipantTargetPopover
          participant={openParticipant}
          editor={openEditor}
          showIdentity
          placement="above-start"
          onClose={closePopover}
        />
      ) : null}
    </div>
  );
}
