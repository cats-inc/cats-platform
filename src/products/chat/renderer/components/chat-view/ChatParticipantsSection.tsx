import type { ChatCat } from '../../../api/contracts.js';
import { buildDraftParticipantExecutionLabel } from '../../chatUtils.js';
import { CatAvatarRow } from '../CatAvatarRow.js';
import type { ResolvedChannelParticipant } from '../../../shared/channelParticipants.js';
import {
  isChannelParticipantBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';

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
                      <span>Participant name</span>
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
                        Save name
                      </button>
                      <button
                        type="button"
                        className="addCatAssignButton"
                        onClick={onCancelParticipantRename}
                        disabled={isBusyForParticipant(participant.participantId)}
                      >
                        Cancel
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
                    Rename
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {assignedCatRecords.length === 0 && assignedAdhocParticipants.length === 0 ? (
        <p className="operatorEmptyState">No participants are in this chat yet.</p>
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
          Choose cats
        </button>
      ) : null}
    </div>
  );
}
