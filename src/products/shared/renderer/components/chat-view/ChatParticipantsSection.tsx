import type { ChatCat } from '../../../api/workspaceContracts.js';
import { buildDraftParticipantExecutionLabel } from '../../draftChatUtils.js';
import { CatAvatarRow } from '../CatAvatarRow.js';
import type { ResolvedChannelParticipant } from '../../../channelParticipants.js';
import {
  isChannelParticipantBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

export interface ChatParticipantsSectionProps {
  assignedCatRecords: ChatCat[];
  assignedAdhocParticipants: ResolvedChannelParticipant[];
  bossCatId: string | null;
  defaultRecipientCatId: string | null;
  editingParticipantId: string | null;
  editingParticipantName: string;
  busy: WorkspaceBusyState;
  canRenameParticipants: boolean;
  showAddCatButton: boolean;
  onEditingParticipantNameChange: (value: string) => void;
  onBeginParticipantRename: (participant: ResolvedChannelParticipant) => void;
  onCancelParticipantRename: () => void;
  onSubmitParticipantRename: (participantId: string) => void;
  onOpenAddCat?: () => void;
  onCloseSidePanel: () => void;
}

export function ChatParticipantsSection({
  assignedCatRecords,
  assignedAdhocParticipants,
  bossCatId,
  defaultRecipientCatId,
  editingParticipantId,
  editingParticipantName,
  busy,
  canRenameParticipants,
  showAddCatButton,
  onEditingParticipantNameChange,
  onBeginParticipantRename,
  onCancelParticipantRename,
  onSubmitParticipantRename,
  onOpenAddCat,
  onCloseSidePanel,
}: ChatParticipantsSectionProps) {
  const { t } = useI18n();
  const isBusyForParticipant = (participantId: string): boolean =>
    isChannelParticipantBusy(busy, participantId);

  return (
    <div className="sidePanelSectionStack">
      {assignedCatRecords.length > 0 ? (
        <CatAvatarRow
          cats={assignedCatRecords}
          bossCatId={bossCatId}
          selectedIds={assignedCatRecords.map((cat) => cat.id)}
          highlightedId={defaultRecipientCatId}
          defaultRecipientCatId={defaultRecipientCatId}
          toggleable={false}
          showLeadBadge
          onToggle={() => {}}
          onHighlight={() => {}}
        />
      ) : null}
      {assignedAdhocParticipants.length > 0 ? (
        <div className="sidePanelParticipantList">
          {assignedAdhocParticipants.map((participant) => (
            <div key={participant.participantId} className="addCatItem">
              <div>
                <strong>{participant.name}</strong>
                <p>{buildDraftParticipantExecutionLabel(participant.execution.target)}</p>
                {participant.roleHint ? <p>{participant.roleHint}</p> : null}
                {editingParticipantId === participant.participantId ? (
                  <form
                    style={{ display: 'grid', gap: 8, marginTop: 8 }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      onSubmitParticipantRename(participant.participantId);
                    }}
                  >
                    <label
                      style={{
                        display: 'grid',
                        gap: 4,
                        fontSize: '0.8rem',
                      }}
                    >
                      <span>{t(messageKeys.chatParticipantsSectionNameLabel)}</span>
                      <input
                        className="chromeInput"
                        value={editingParticipantName}
                        onChange={(event) => onEditingParticipantNameChange(event.target.value)}
                        disabled={isBusyForParticipant(participant.participantId)}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="submit"
                        className="addCatAssignButton"
                        disabled={
                          !editingParticipantName.trim()
                          || isBusyForParticipant(participant.participantId)
                        }
                      >
                        {t(messageKeys.chatParticipantsSectionSaveNameButton)}
                      </button>
                      <button
                        type="button"
                        className="addCatAssignButton"
                        onClick={onCancelParticipantRename}
                        disabled={isBusyForParticipant(participant.participantId)}
                      >
                        {t(messageKeys.chatParticipantsSectionCancelButton)}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {canRenameParticipants ? (
                  <button
                    type="button"
                    className="addCatAssignButton"
                    disabled={isBusyForParticipant(participant.participantId)}
                    onClick={() => onBeginParticipantRename(participant)}
                  >
                    {t(messageKeys.chatParticipantsSectionRenameButton)}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {assignedCatRecords.length === 0 && assignedAdhocParticipants.length === 0 ? (
        <p className="operatorEmptyState">
          {t(messageKeys.chatParticipantsSectionNoParticipants)}
        </p>
      ) : null}
      {showAddCatButton ? (
        <button
          type="button"
          className="operatorActionButton"
          onClick={() => {
            onCloseSidePanel();
            onOpenAddCat?.();
          }}
        >
          {t(messageKeys.chatParticipantsSectionChooseCatsButton)}
        </button>
      ) : null}
    </div>
  );
}
