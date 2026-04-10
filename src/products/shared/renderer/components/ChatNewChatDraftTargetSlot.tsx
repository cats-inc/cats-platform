import type { AppShellPayload } from '../../api/workspaceContracts.js';
import type { DraftTemporaryParticipant } from '../draftChatUtils.js';
import { catInitials } from '../workspaceChatUtils.js';
import {
  ComposerRecipientChip,
  type RecipientChipTarget,
} from './ComposerRecipientChip.js';
import { ComposerCatStack } from './ComposerCatStack.js';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from './ModelSelector.js';

interface GroupComposerParticipant {
  key: string;
  name: string;
  executionLabel: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  isCat: boolean;
  catId: string | null;
  participantId: string | null;
}

export interface ChatNewChatDraftTargetSlotProps {
  payload: AppShellPayload;
  isGroupDraft: boolean;
  isDirectLaneContext: boolean;
  effectiveDefaultRecipientCat: AppShellPayload['chat']['cats'][number] | null;
  effectiveDefaultRecipientTemporaryParticipant: DraftTemporaryParticipant | null;
  draftComposerRecipients: RecipientChipTarget[];
  groupComposerParticipants: GroupComposerParticipant[];
  activePanelModel: ModelSelectorValue | null;
  isSubmittingFirstTurn: boolean;
  onOpenCats: () => void;
  onOpenExecution: () => void;
  onToggleDraftCat: (catId: string) => void;
  onRemoveDraftTemporaryParticipant: (participantId: string) => void;
  onRemoveFromAudience?: (key: string) => void;
}

export function ChatNewChatDraftTargetSlot({
  payload,
  isGroupDraft,
  isDirectLaneContext,
  effectiveDefaultRecipientCat,
  effectiveDefaultRecipientTemporaryParticipant,
  draftComposerRecipients,
  groupComposerParticipants,
  activePanelModel,
  isSubmittingFirstTurn,
  onOpenCats,
  onOpenExecution,
  onToggleDraftCat,
  onRemoveDraftTemporaryParticipant,
  onRemoveFromAudience,
}: ChatNewChatDraftTargetSlotProps) {
  if (isGroupDraft) {
    if (groupComposerParticipants.length === 0) {
      return null;
    }

    return (
      <div
        className="composerCatStack"
        onClick={isSubmittingFirstTurn ? undefined : onOpenCats}
        role={isSubmittingFirstTurn ? undefined : 'button'}
        tabIndex={isSubmittingFirstTurn ? undefined : 0}
      >
        {[...groupComposerParticipants].reverse().map((participant, index, rendered) => {
          const isBoss = participant.isCat && participant.catId === payload.chat.bossCatId;
          const canRemove = groupComposerParticipants.length >= 2;

          return (
            <div
              key={participant.key}
              className={`catAvatar composerStackAvatar${isBoss ? ' catAvatarBoss' : ''}`}
              data-tooltip={participant.executionLabel || participant.name}
              style={{
                ...(participant.avatarUrl
                  ? {
                      backgroundImage: `url(${participant.avatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : participant.isCat
                    ? {
                        background: participant.avatarColor ?? '#8B7E74',
                      }
                    : {
                        background: '#fff',
                        color: '#222',
                        border: '1px solid rgba(0, 0, 0, 0.15)',
                      }),
                zIndex: index + 1,
              }}
            >
              {participant.avatarUrl ? null : catInitials(participant.name)}
              {!isSubmittingFirstTurn && canRemove && onRemoveFromAudience ? (
                <button
                  type="button"
                  className="composerStackRemove"
                  aria-label={`Remove ${participant.name} from audience`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveFromAudience(participant.key);
                  }}
                >
                  &times;
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (isDirectLaneContext && effectiveDefaultRecipientCat) {
    return (
      <ComposerCatStack
        cats={[effectiveDefaultRecipientCat]}
        bossCatId={payload.chat.bossCatId}
        defaultRecipientCatId={effectiveDefaultRecipientCat.id}
        onClick={isSubmittingFirstTurn ? undefined : onOpenExecution}
      />
    );
  }

  if (draftComposerRecipients.length > 0) {
    return (
      <ComposerRecipientChip
        recipients={draftComposerRecipients}
        disabled={isSubmittingFirstTurn}
        onClick={isSubmittingFirstTurn ? undefined : (
          effectiveDefaultRecipientCat || effectiveDefaultRecipientTemporaryParticipant
            ? onOpenCats
            : onOpenExecution
        )}
      />
    );
  }

  if (activePanelModel) {
    return (
      <div style={{ marginRight: 8 }}>
        <ModelSelectorChip
          label={buildModelSelectorLabel(activePanelModel)}
          onClick={isSubmittingFirstTurn ? undefined : onOpenExecution}
        />
      </div>
    );
  }

  return null;
}
