import { catInitials } from '../workspaceChatUtils.js';
import type { DraftComposerStackParticipant } from './chatNewChatDraftSupport.js';

export interface BranchAudienceRosterProps {
  audienceParticipants: DraftComposerStackParticipant[];
  isSubmittingFirstTurn: boolean;
  canRemoveParticipant: boolean;
  useDangerRemoveHover?: boolean;
  onAvatarClick?: () => void;
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
  onAvatarClick,
  onRemoveParticipant,
}: BranchAudienceRosterProps) {
  if (audienceParticipants.length <= 1) return null;
  return (
    <>
      {audienceParticipants.map((participant) => (
        <div key={participant.key} className="composerGroupAvatarSlot">
          <div
            className="catAvatar"
            role={isSubmittingFirstTurn ? undefined : 'button'}
            tabIndex={isSubmittingFirstTurn ? undefined : 0}
            onClick={isSubmittingFirstTurn ? undefined : onAvatarClick}
            data-tooltip={participant.isCat && participant.executionLabel
              ? `${participant.name} \u00b7 ${participant.executionLabel}`
              : (participant.executionLabel || participant.name)}
            style={
              participant.avatarUrl
                ? {
                    backgroundImage: `url(${participant.avatarUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : participant.isCat
                  ? { background: participant.avatarColor ?? '#8B7E74' }
                  : {
                      background: '#fff',
                      color: '#222',
                      border: '1px solid rgba(0, 0, 0, 0.15)',
                    }
            }
          >
            {participant.avatarUrl ? null : catInitials(participant.name)}
          </div>
          {canRemoveParticipant ? (
            <button
              type="button"
              className={`composerGroupAvatarRemove${useDangerRemoveHover ? ' composerGroupAvatarRemoveDanger' : ''}`}
              aria-label={`Remove ${participant.name}`}
              disabled={isSubmittingFirstTurn}
              onClick={() => onRemoveParticipant(participant)}
            >
              &times;
            </button>
          ) : null}
        </div>
      ))}
    </>
  );
}
